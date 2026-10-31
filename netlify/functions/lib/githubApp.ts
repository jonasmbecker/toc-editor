import { createSign } from 'node:crypto'

/**
 * Authentication as the suggestion bot: a GitHub App with an installation on the theory repo.
 * The three values come from Netlify environment variables and nowhere else; nothing here logs
 * them, returns them, or puts them in an error message.
 *
 *   GITHUB_APP_ID               the App's numeric id
 *   GITHUB_APP_INSTALLATION_ID  the numeric id of its installation on the theory repo
 *   GITHUB_APP_PRIVATE_KEY      the PEM private key (real newlines or literal "\n")
 */

export interface AppConfig {
  appId: string
  installationId: string
  privateKey: string
}

const API = 'https://api.github.com'
const CALL_TIMEOUT_MS = 8000

/** Pasted keys come with real newlines, literal `\n` sequences, wrapping quotes, or with the line
 * breaks turned into spaces or lost, depending on how they were entered in the Netlify dashboard.
 * The PEM is rebuilt from its label and base64 body (whitespace removed, 64 per line), which is
 * the one layout OpenSSL accepts. */
export function normalizePrivateKey(raw: string): string {
  const unquoted = raw
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .replace(/\\n/g, '\n')
    .trim()
  const pem = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/.exec(unquoted)
  if (!pem) return unquoted
  const lines = pem[2].replace(/\s+/g, '').match(/.{1,64}/g) ?? []
  return [`-----BEGIN ${pem[1]}-----`, ...lines, `-----END ${pem[1]}-----`].join('\n')
}

/** The App's settings, or null when any is missing or has the wrong shape, which is how the
 * function knows suggestions are not switched on (rather than failing on the first request). */
export function readAppConfig(env: Record<string, string | undefined>): AppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim() ?? ''
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim() ?? ''
  const privateKey = normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY ?? '')
  const idsOk = /^\d+$/.test(appId) && /^\d+$/.test(installationId)
  const keyOk = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----$/.test(
    privateKey,
  )
  return idsOk && keyOk ? { appId, installationId, privateKey } : null
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** A 9-minute RS256 token that proves we are the App (GitHub allows up to 10). Backdated a
 * minute so a slightly fast clock here does not make GitHub reject it as issued in the future. */
export function appJwt(config: AppConfig, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 9 * 60, iss: config.appId }),
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(config.privateKey)
  return `${header}.${payload}.${base64url(signature)}`
}

/** What a failed call to GitHub tells the logs: which call and which status, never the token. */
export class GithubError extends Error {
  readonly step: string
  readonly status: number
  constructor(step: string, status: number, detail = '') {
    super(`GitHub ${step} failed (${status})${detail ? `: ${detail}` : ''}`)
    this.name = 'GithubError'
    this.step = step
    this.status = status
  }
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>

/** A short-lived token for the installation, narrowed to the theory repo and to the two
 * permissions the function uses, whatever else the App was granted. */
export async function installationToken(
  config: AppConfig,
  repoName: string,
  fetchFn: FetchFn,
  nowSeconds: number,
): Promise<string> {
  const response = await fetchFn(
    `${API}/app/installations/${config.installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appJwt(config, nowSeconds)}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'toc-editor-suggest',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        repositories: [repoName],
        permissions: { contents: 'write', pull_requests: 'write' },
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  )
  if (!response.ok) throw new GithubError('token', response.status, await githubMessage(response))
  const body = (await response.json()) as { token?: unknown }
  if (typeof body.token !== 'string' || body.token === '') throw new GithubError('token', 0)
  return body.token
}

/** GitHub's own explanation of an error ("Resource not accessible by integration"), clipped.
 * It never contains a credential; it is what tells a missing permission from a bad id. */
export async function githubMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    return typeof body.message === 'string' ? body.message.slice(0, 200) : ''
  } catch {
    return ''
  }
}
