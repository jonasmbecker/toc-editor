// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubError, readAppConfig, type FetchFn } from './githubApp'
import { createTheoryRepo, type PullRequestSpec } from './theoryRepo'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})
const config = readAppConfig({
  GITHUB_APP_ID: '1',
  GITHUB_APP_INSTALLATION_ID: '2',
  GITHUB_APP_PRIVATE_KEY: privateKey,
})!

const REPO = '/repos/jonasmbecker/theory-of-metacrisis'
const BASE = 'a'.repeat(40)

interface Call {
  method: string
  path: string
  query: string
  headers: Record<string, string>
  body: Record<string, unknown> | undefined
}
type Handler = (call: Call) => Response
type Route = [method: string, path: RegExp, handler: Handler]

const reply =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status })

/** A stand-in for GitHub: answers the calls a suggestion makes and records every request. */
function fakeGithub(overrides: Route[] = []) {
  const calls: Call[] = []
  const defaults: Route[] = [
    ['POST', /^\/app\/installations\/2\/access_tokens$/, reply({ token: 'ghs_installation' }, 201)],
    ['GET', /\/git\/commits\/a+$/, reply({ tree: { sha: 'tree-1' } })],
    ['POST', /\/git\/trees$/, reply({ sha: 'tree-2' }, 201)],
    ['POST', /\/git\/commits$/, reply({ sha: 'commit-1' }, 201)],
    ['POST', /\/git\/refs$/, reply({}, 201)],
    ['POST', /\/pulls$/, reply({ number: 12 }, 201)],
    ['POST', /\/issues\/12\/labels$/, reply([], 200)],
    ['PATCH', /\/pulls\/12$/, reply({}, 200)],
    ['DELETE', /\/git\/refs\/heads\/.+$/, () => new Response(null, { status: 204 })],
  ]
  const fetchFn: FetchFn = async (url, init) => {
    const parsed = new URL(url)
    const call: Call = {
      method: init.method ?? 'GET',
      path: parsed.pathname,
      query: parsed.search,
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Call['body']) : undefined,
    }
    calls.push(call)
    const route = [...overrides, ...defaults].find(
      ([method, path]) => method === call.method && path.test(call.path),
    )
    return route ? route[2](call) : Response.json({ message: 'no route' }, { status: 404 })
  }
  return { fetchFn, calls }
}

const spec: PullRequestSpec = {
  title: 'Added link: "A" → "B"',
  commitMessage: 'Added link\n\nSuggested by Ana.',
  slug: 'added-link-a-b',
  baseSha: BASE,
  files: [{ path: 'map/content.json', text: '{"a":1}\n' }],
  body: (number) => (number === null ? 'body' : `body ${number}`),
}

afterEach(() => vi.restoreAllMocks())

describe('openPullRequest', () => {
  it('makes one commit from the base commit, a branch, a pull request, a label and the preview edit', async () => {
    const { fetchFn, calls } = fakeGithub()
    const result = await createTheoryRepo(config, fetchFn).openPullRequest(spec)
    expect(result).toEqual({
      number: 12,
      url: 'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12',
    })
    expect(calls.map((call) => `${call.method} ${call.path.replace(REPO, '')}`)).toEqual([
      'POST /app/installations/2/access_tokens',
      `GET /git/commits/${BASE}`,
      'POST /git/trees',
      'POST /git/commits',
      'POST /git/refs',
      'POST /pulls',
      'POST /issues/12/labels',
      'PATCH /pulls/12',
    ])
    const [, , tree, commit, ref, pull, label, edit] = calls
    expect(tree.body).toEqual({
      base_tree: 'tree-1',
      tree: [{ path: 'map/content.json', mode: '100644', type: 'blob', content: '{"a":1}\n' }],
    })
    expect(commit.body).toEqual({ message: spec.commitMessage, tree: 'tree-2', parents: [BASE] })
    expect(ref.body).toMatchObject({ sha: 'commit-1' })
    expect(ref.body?.ref).toMatch(/^refs\/heads\/suggest\/added-link-a-b-[0-9a-f]{6}$/)
    const branch = (ref.body?.ref as string).replace('refs/heads/', '')
    expect(pull.body).toEqual({ title: spec.title, head: branch, base: 'main', body: 'body' })
    expect(label.body).toEqual({ labels: ['suggestion'] })
    expect(edit.body).toEqual({ body: 'body 12' })
  })

  it('asks for a token once and sends it, not the App key, on every repo call', async () => {
    const { fetchFn, calls } = fakeGithub()
    const repo = createTheoryRepo(config, fetchFn)
    await repo.openPullRequest(spec)
    expect(calls.filter((call) => call.path.endsWith('/access_tokens'))).toHaveLength(1)
    for (const call of calls.filter((c) => c.path.startsWith('/repos'))) {
      expect(call.headers.authorization).toBe('Bearer ghs_installation')
    }
    expect(JSON.stringify(calls)).not.toContain('PRIVATE KEY')
  })

  it('tries another branch name when the first is taken', async () => {
    let taken = true
    const { fetchFn, calls } = fakeGithub([
      [
        'POST',
        /\/git\/refs$/,
        () => {
          const was = taken
          taken = false
          return Response.json({ message: 'Reference already exists' }, { status: was ? 422 : 201 })
        },
      ],
    ])
    await createTheoryRepo(config, fetchFn).openPullRequest(spec)
    const refs = calls.filter((call) => call.path.endsWith('/git/refs'))
    expect(refs).toHaveLength(2)
    expect(refs[0].body?.ref).not.toBe(refs[1].body?.ref)
  })

  it('deletes its branch when the pull request cannot be opened', async () => {
    const { fetchFn, calls } = fakeGithub([
      ['POST', /\/pulls$/, reply({ message: 'Validation Failed' }, 422)],
    ])
    const error = await createTheoryRepo(config, fetchFn)
      .openPullRequest(spec)
      .catch((e) => e)
    expect(error).toBeInstanceOf(GithubError)
    expect(error.message).toBe('GitHub open pull request failed (422): Validation Failed')
    const branch = (calls.find((c) => c.path.endsWith('/git/refs'))?.body?.ref as string).replace(
      'refs/heads/',
      '',
    )
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${REPO}/git/refs/heads/${branch}`,
    })
  })

  it('stops at the first failing step and says which', async () => {
    const { fetchFn } = fakeGithub([
      ['POST', /\/git\/trees$/, reply({ message: 'Resource not accessible by integration' }, 403)],
    ])
    await expect(createTheoryRepo(config, fetchFn).openPullRequest(spec)).rejects.toThrow(
      'GitHub write files failed (403): Resource not accessible by integration',
    )
  })

  it('still succeeds when only the label or the preview edit fails, and logs it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { fetchFn } = fakeGithub([
      ['POST', /\/issues\/12\/labels$/, reply({ message: 'nope' }, 403)],
      ['PATCH', /\/pulls\/12$/, reply({ message: 'nope' }, 500)],
    ])
    const result = await createTheoryRepo(config, fetchFn).openPullRequest(spec)
    expect(result.number).toBe(12)
    expect(logged).toHaveBeenCalledWith('suggest: label failed (403)')
    expect(logged).toHaveBeenCalledWith('suggest: preview link failed (500)')
  })
})

describe('isOnMain', () => {
  it.each([
    ['ahead', true],
    ['identical', true],
    ['diverged', false],
    ['behind', false],
  ])('is %s -> %s', async (status, expected) => {
    const { fetchFn, calls } = fakeGithub([['GET', /\/compare\//, reply({ status })]])
    expect(await createTheoryRepo(config, fetchFn).isOnMain(BASE)).toBe(expected)
    expect(calls.at(-1)?.path).toBe(`${REPO}/compare/${BASE}...main`)
  })

  it('is false for a commit GitHub does not know', async () => {
    const { fetchFn } = fakeGithub([['GET', /\/compare\//, reply({ message: 'Not Found' }, 404)]])
    expect(await createTheoryRepo(config, fetchFn).isOnMain(BASE)).toBe(false)
  })

  it('throws on a GitHub error, so an outage is not read as "out of date"', async () => {
    const { fetchFn } = fakeGithub([['GET', /\/compare\//, reply({ message: 'boom' }, 500)]])
    await expect(createTheoryRepo(config, fetchFn).isOnMain(BASE)).rejects.toThrow(GithubError)
  })
})

describe('readMap', () => {
  it('reads both files at the commit as raw text', async () => {
    const { fetchFn, calls } = fakeGithub([
      [
        'GET',
        /\/contents\/map\/(content|layout)\.json$/,
        (call) => new Response(call.path.endsWith('/content.json') ? 'C-TEXT' : 'L-TEXT'),
      ],
    ])
    const map = await createTheoryRepo(config, fetchFn).readMap(BASE)
    expect(map).toEqual({ content: 'C-TEXT', layout: 'L-TEXT' })
    const reads = calls.filter((call) => call.path.includes('/contents/'))
    expect(reads.map((call) => call.query)).toEqual([`?ref=${BASE}`, `?ref=${BASE}`])
    expect(reads[0].headers.accept).toBe('application/vnd.github.raw+json')
  })
})
