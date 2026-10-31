// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubError } from './githubApp'
import type { SuggestDeps } from './suggestApi'
import { MAX_BODY } from './suggestApi'
import { SUGGESTIONS_PER_HOUR } from './suggestLimits'
import {
  FREEZE,
  TRAUMA,
  addLink,
  cardsOf,
  fakeRepo,
  freshDeps,
  send,
  suggestion,
} from './suggestTestKit'
import type { PullRequestSpec, TheoryRepo } from './theoryRepo'

let repo: TheoryRepo
let opened: PullRequestSpec[]
let deps: ReturnType<typeof freshDeps>

const post = (body: unknown, headers?: Record<string, string>) => send(deps, body, headers)
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error

beforeEach(() => {
  ;({ repo, opened } = fakeRepo())
  deps = freshDeps(repo)
})
afterEach(() => vi.restoreAllMocks())

describe('honeypot', () => {
  it.each([['http://spam.example'], ['x'], [1], [true], [['a']]])(
    'answers like a success and opens nothing when it holds %j',
    async (website) => {
      const response = await post(suggestion(addLink, { website }))
      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({ number: 0 })
      expect(repo.isOnMain).not.toHaveBeenCalled()
      expect(repo.openPullRequest).not.toHaveBeenCalled()
      expect(deps.kv.keys()).toEqual([])
    },
  )

  it.each([[''], ['   '], [null], [undefined]])('ignores an empty trap: %j', async (website) => {
    expect((await post(suggestion(addLink, { website }))).status).toBe(201)
    expect(opened).toHaveLength(1)
  })
})

describe('rate limit', () => {
  it('refuses the fourth suggestion in an hour with 429, and opens only three', async () => {
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1)
      expect((await post(suggestion(addLink))).status).toBe(201)
    const response = await post(suggestion(addLink))
    expect(response.status).toBe(429)
    expect(await errorOf(response)).toContain('up to 3 an hour and 10 a day')
    expect(opened).toHaveLength(3)
  })

  it('does not count refused requests, so a bad map never uses up the allowance', async () => {
    for (let i = 0; i < 6; i += 1) await post(suggestion(addLink, { name: '' }))
    for (let i = 0; i < 6; i += 1) await post(suggestion(() => undefined))
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1)
      expect((await post(suggestion(addLink))).status).toBe(201)
  })

  it('opens exactly three when eight arrive at once', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(suggestion(addLink))))
    expect(responses.filter((r) => r.status === 201)).toHaveLength(3)
    expect(responses.filter((r) => r.status === 429)).toHaveLength(5)
    expect(opened).toHaveLength(3)
  })

  it('applies again after the hour, and to another address not at all', async () => {
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) await post(suggestion(addLink))
    const other: SuggestDeps = { ...deps, ip: '198.51.100.4' }
    expect((await send(other, suggestion(addLink))).status).toBe(201)
    deps = { ...deps, now: () => new Date('2026-10-31T11:00:01Z') }
    expect((await post(suggestion(addLink))).status).toBe(201)
  })

  it('gives the slot back when GitHub fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing = fakeRepo({
      openPullRequest: async () => {
        throw new GithubError('commit', 500)
      },
    }).repo
    deps = { ...deps, repo: failing }
    for (let i = 0; i < SUGGESTIONS_PER_HOUR + 2; i += 1)
      expect((await post(suggestion(addLink))).status).toBe(502)
    deps = { ...deps, repo }
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1)
      expect((await post(suggestion(addLink))).status).toBe(201)
  })

  it('refuses a request with no address', async () => {
    deps = { ...deps, ip: '' }
    expect((await post(suggestion(addLink))).status).toBe(400)
    expect(repo.openPullRequest).not.toHaveBeenCalled()
  })
})

describe('size and field caps', () => {
  it('refuses a body over 512 KB by its declared length, and by its real size', async () => {
    const huge = JSON.stringify({ padding: 'x'.repeat(MAX_BODY.bytes) })
    const declared = await post(huge, {
      'content-type': 'application/json',
      'content-length': String(huge.length),
    })
    expect(declared.status).toBe(413)
    expect(await errorOf(declared)).toBe(MAX_BODY.message)
    expect((await post(huge)).status).toBe(413)
    expect(repo.isOnMain).not.toHaveBeenCalled()
  })

  it('refuses a name over 80 and a reason over 1000 characters, and takes exactly that many', async () => {
    expect((await post(suggestion(addLink, { name: 'n'.repeat(81) }))).status).toBe(400)
    expect((await post(suggestion(addLink, { reason: 'r'.repeat(1001) }))).status).toBe(400)
    expect(
      (await post(suggestion(addLink, { name: 'n'.repeat(80), reason: 'r'.repeat(1000) }))).status,
    ).toBe(201)
  })

  it('strips HTML from the name and the reason before they reach the pull request', async () => {
    await post(
      suggestion(addLink, {
        name: '<b>Ana</b><script>x</script>',
        reason: '<img src=x onerror=alert(1)>Seen <a href="http://evil.example">it</a>.',
      }),
    )
    const body = opened[0].body(null)
    expect(body).toContain('Suggested by **Anax**')
    expect(body).toContain('> Seen it.')
    expect(body).not.toMatch(/<(b|img|script|a)\b/)
    expect(opened[0].commitMessage).toContain('by Anax.')
  })

  it('rejects a name or reason that is only HTML', async () => {
    expect((await post(suggestion(addLink, { name: '<b></b>' }))).status).toBe(400)
    expect((await post(suggestion(addLink, { reason: '<p></p>' }))).status).toBe(400)
  })

  it('defuses an @mention in the name and reason', async () => {
    await post(suggestion(addLink, { name: '@octocat', reason: 'cc @jonasmbecker, see #1' }))
    expect(opened[0].body(null)).not.toMatch(new RegExp(`@(?!${String.fromCharCode(0x200b)})`))
  })
})

describe('removing cards', () => {
  const without = (count: number) => (doc: Parameters<typeof addLink>[0]) => {
    const ids = new Set(
      cardsOf(doc)
        .filter((c) => c.id !== TRAUMA && c.id !== FREEZE && c.kind !== 'group')
        .slice(0, count)
        .map((c) => c.id),
    )
    for (const column of doc.sections.flatMap((s) => s.columns)) {
      column.nodes = column.nodes.filter((n) => !ids.has(n.id))
      for (const n of column.nodes)
        n.connections = n.connections.filter((c) => !ids.has(c.targetId))
    }
    for (const n of cardsOf(doc)) if (n.groupId && ids.has(n.groupId)) delete n.groupId
  }

  it('takes five removals', async () => {
    expect((await post(suggestion(without(5)))).status).toBe(201)
  })

  it('refuses six at once, naming the limit, and opens nothing', async () => {
    const response = await post(suggestion(without(6)))
    expect(response.status).toBe(400)
    expect(await errorOf(response)).toContain('more than 5 cards')
    expect(opened).toHaveLength(0)
  })
})
