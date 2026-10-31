import {
  GithubError,
  githubMessage,
  installationToken,
  type AppConfig,
  type FetchFn,
} from './githubApp'

/**
 * The few things the suggestion function does on the theory repo, as one interface so the
 * request rules can be tested without GitHub (`suggestApi.ts`), and a real implementation over
 * GitHub's REST API with the bot's installation token.
 *
 * A suggestion is one commit on a new branch cut from the commit the contributor started from
 * (`baseSha`), not from today's main. Both files are written whole, so cutting from today's main
 * would silently undo anything merged since; cutting from `baseSha` makes the pull request show
 * exactly what the contributor changed, and GitHub merges or flags a conflict as usual.
 */

export const THEORY_REPO_NAME = 'theory-of-metacrisis'
export const THEORY_REPO = `jonasmbecker/${THEORY_REPO_NAME}`
export const SUGGESTION_LABEL = 'suggestion'

const API = 'https://api.github.com'
const CALL_TIMEOUT_MS = 8000
const BRANCH_TRIES = 3

/** The two map files as text, exactly as stored at a commit. */
export interface MapTexts {
  content: string
  layout: string
}

export interface PullRequestSpec {
  title: string
  commitMessage: string
  /** Lower-case words and hyphens for the branch name; the repo adds a random suffix. */
  slug: string
  baseSha: string
  files: { path: string; text: string }[]
  /** The pull request text. `number` is null on creation and the real number on the follow-up
   * edit, which is how the text can link to the preview. */
  body: (number: number | null) => string
}

export interface TheoryRepo {
  /** Whether `sha` is a commit on main (or main itself). */
  isOnMain(sha: string): Promise<boolean>
  readMap(sha: string): Promise<MapTexts>
  openPullRequest(spec: PullRequestSpec): Promise<{ number: number; url: string }>
}

interface CallOptions {
  body?: unknown
  accept?: string
}

/** Calls on the theory repo with the installation token, which is fetched on first use and
 * kept for the rest of the request. */
interface Api {
  call(method: string, path: string, options?: CallOptions): Promise<Response>
  /** A call that must succeed; the error names the step and status, never the token. */
  mustCall(step: string, method: string, path: string, options?: CallOptions): Promise<Response>
  mustJson<T>(step: string, method: string, path: string, options?: CallOptions): Promise<T>
}

function createApi(config: AppConfig, fetchFn: FetchFn, now: () => number): Api {
  let token: Promise<string> | undefined
  const getToken = () =>
    (token ??= installationToken(config, THEORY_REPO_NAME, fetchFn, Math.floor(now() / 1000)))

  const call: Api['call'] = async (method, path, options = {}) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await getToken()}`,
      accept: options.accept ?? 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'toc-editor-suggest',
    }
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    return fetchFn(`${API}/repos/${THEORY_REPO}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
  }
  const mustCall: Api['mustCall'] = async (step, method, path, options) => {
    const response = await call(method, path, options)
    if (!response.ok) throw new GithubError(step, response.status, await githubMessage(response))
    return response
  }
  const mustJson = async <T>(step: string, method: string, path: string, options?: CallOptions) =>
    (await (await mustCall(step, method, path, options)).json()) as T
  return { call, mustCall, mustJson }
}

function shortId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function isOnMain(api: Api, sha: string): Promise<boolean> {
  const response = await api.call('GET', `/compare/${sha}...main?per_page=1`)
  if (response.status === 404 || response.status === 422) return false
  if (!response.ok) throw new GithubError('compare', response.status, await githubMessage(response))
  const { status } = (await response.json()) as { status?: string }
  // `ahead`: main has commits `sha` lacks, so `sha` is an ancestor of main.
  return status === 'ahead' || status === 'identical'
}

async function readFile(api: Api, sha: string, file: string): Promise<string> {
  const response = await api.mustCall(
    `read ${file}.json`,
    'GET',
    `/contents/map/${file}.json?ref=${sha}`,
    { accept: 'application/vnd.github.raw+json' },
  )
  return response.text()
}

async function commitFiles(api: Api, spec: PullRequestSpec): Promise<string> {
  const parent = await api.mustJson<{ tree?: { sha?: string } }>(
    'read base commit',
    'GET',
    `/git/commits/${spec.baseSha}`,
  )
  const tree = await api.mustJson<{ sha?: string }>('write files', 'POST', '/git/trees', {
    body: {
      base_tree: parent.tree?.sha,
      tree: spec.files.map((file) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.text,
      })),
    },
  })
  const commit = await api.mustJson<{ sha?: string }>('commit', 'POST', '/git/commits', {
    body: { message: spec.commitMessage, tree: tree.sha, parents: [spec.baseSha] },
  })
  if (!commit.sha) throw new GithubError('commit', 0, 'no commit id returned')
  return commit.sha
}

async function createBranch(api: Api, slug: string, commit: string): Promise<string> {
  for (let attempt = 1; attempt <= BRANCH_TRIES; attempt += 1) {
    const branch = `suggest/${slug}-${shortId()}`
    const response = await api.call('POST', '/git/refs', {
      body: { ref: `refs/heads/${branch}`, sha: commit },
    })
    if (response.ok) return branch
    // 422 is "that name exists": a random suffix collided, try another.
    if (response.status !== 422 || attempt === BRANCH_TRIES) {
      throw new GithubError('create branch', response.status, await githubMessage(response))
    }
  }
  throw new GithubError('create branch', 422)
}

/** The label and the preview link are conveniences: the pull request already exists, so a
 * failure here is logged and does not fail the suggestion. */
async function finish(api: Api, number: number, spec: PullRequestSpec): Promise<void> {
  const steps = ['label', 'preview link']
  const results = await Promise.allSettled([
    api.call('POST', `/issues/${number}/labels`, { body: { labels: [SUGGESTION_LABEL] } }),
    api.call('PATCH', `/pulls/${number}`, { body: { body: spec.body(number) } }),
  ])
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const name = result.reason instanceof Error ? result.reason.name : typeof result.reason
      console.error(`suggest: ${steps[index]} failed (${name})`)
    } else if (!result.value.ok) {
      console.error(`suggest: ${steps[index]} failed (${result.value.status})`)
    }
  })
}

async function openPullRequest(api: Api, spec: PullRequestSpec) {
  const commit = await commitFiles(api, spec)
  const branch = await createBranch(api, spec.slug, commit)
  let number: number
  try {
    const pull = await api.mustJson<{ number?: unknown }>('open pull request', 'POST', '/pulls', {
      body: { title: spec.title, head: branch, base: 'main', body: spec.body(null) },
    })
    if (!Number.isInteger(pull.number) || (pull.number as number) < 1) {
      throw new GithubError('open pull request', 0, 'no number returned')
    }
    number = pull.number as number
  } catch (error) {
    // Do not leave a branch behind that no pull request points at.
    await api.call('DELETE', `/git/refs/heads/${branch}`).catch(() => undefined)
    throw error
  }
  await finish(api, number, spec)
  return { number, url: `https://github.com/${THEORY_REPO}/pull/${number}` }
}

export function createTheoryRepo(
  config: AppConfig,
  fetchFn: FetchFn = fetch,
  now: () => number = Date.now,
): TheoryRepo {
  const api = createApi(config, fetchFn, now)
  return {
    isOnMain: (sha) => isOnMain(api, sha),
    readMap: async (sha) => {
      const [content, layout] = await Promise.all([
        readFile(api, sha, 'content'),
        readFile(api, sha, 'layout'),
      ])
      return { content, layout }
    },
    openPullRequest: (spec) => openPullRequest(api, spec),
  }
}
