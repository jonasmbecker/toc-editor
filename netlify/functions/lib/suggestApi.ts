import { hasChanges, summarizeChanges, summaryTitle } from '../../../src/files/changeSummary'
import {
  mergeDocument,
  serializeMapFile,
  splitDocument,
  type MapContent,
  type MapLayout,
} from '../../../src/files/split'
import { parseDocument, type ToCDocument } from '../../../src/model/schema'
import { GithubError } from './githubApp'
import { failure, json, readJsonBody } from './http'
import type { Kv } from './kv'
import { branchSlug, commitMessage, previewUrl, pullRequestBody } from './suggestPr'
import type { TheoryRepo } from './theoryRepo'

/**
 * The suggestion API, free of anything Netlify-specific so it can be tested against an in-memory
 * store and a fake repo. `suggest-change.ts` adapts it to a Netlify Function.
 *
 *   POST { content, layout, name, reason, baseSha, website }
 *     -> 201 { url, number, previewUrl }
 *
 * `content` and `layout` are the two map files as the editor would write them, `baseSha` the
 * commit of the theory repo the contributor's edit started from, and `website` the honeypot.
 */

export interface SuggestDeps {
  kv: Kv
  ip: string
  now: () => Date
  /** null while the GitHub App settings are missing. */
  repo: TheoryRepo | null
}

type Checked<T> = { ok: true; value: T } | { ok: false; response: Response }

const bad = (message: string, status = 400): { ok: false; response: Response } => ({
  ok: false,
  response: failure(status, message),
})

const SHA = /^[0-9a-f]{40}$/

interface Fields {
  name: string
  reason: string
  baseSha: string
  content: unknown
  layout: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFields(body: Record<string, unknown>): Checked<Fields> {
  const name = text(body.name)
  const reason = text(body.reason)
  const baseSha = text(body.baseSha)
  if (!name) return bad('Add your name (a nickname is fine).')
  if (!reason) return bad('Add a short reason for the change.')
  if (!SHA.test(baseSha))
    return bad('The editor did not say which version of the map you started from.')
  return { ok: true, value: { name, reason, baseSha, content: body.content, layout: body.layout } }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Merges the two files and checks the result with the editor's own schema. The returned
 * document is the merged input, not zod's copy, so key order stays as the contributor sent it. */
function documentFrom(content: unknown, layout: unknown): Checked<ToCDocument> {
  if (!isObject(content) || !isObject(layout) || !isObject(layout.cards)) {
    return bad('The map files have the wrong shape.')
  }
  let merged: ReturnType<typeof mergeDocument>
  try {
    merged = mergeDocument(content as MapContent, layout as unknown as MapLayout)
  } catch {
    return bad('The map files have the wrong shape.')
  }
  if (!merged.ok) return bad(merged.errors.slice(0, 3).join(' '))
  const parsed = parseDocument(merged.document)
  if (!parsed.ok) return bad(`The map is not valid: ${parsed.errors.slice(0, 3).join('; ')}`)
  return { ok: true, value: merged.document }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

interface Proposed {
  after: ToCDocument
  summary: ReturnType<typeof summarizeChanges>
}

/** Everything that can be checked before a rate-limit slot is spent. The contributor's map is
 * checked first (no network); then the version it started from is read from GitHub. */
async function checkChange(repo: TheoryRepo, fields: Fields): Promise<Checked<Proposed>> {
  const after = documentFrom(fields.content, fields.layout)
  if (!after.ok) return after
  if (!(await repo.isOnMain(fields.baseSha))) {
    return bad('Your copy of the map is out of date. Reload the editor and make the change again.')
  }
  const texts = await repo.readMap(fields.baseSha)
  const before = documentFrom(parseJson(texts.content), parseJson(texts.layout))
  if (!before.ok) return bad('The current map could not be read, try again later.', 502)
  const summary = summarizeChanges(before.value, after.value)
  if (!hasChanges(summary)) return bad('Nothing has changed compared to the map you started from.')
  return { ok: true, value: { after: after.value, summary } }
}

async function openPull(repo: TheoryRepo, fields: Fields, { after, summary }: Proposed) {
  const next = splitDocument(after)
  const files = []
  // A file nobody changed is left out, so the pull request only touches what the person did.
  if (summary.lines.length > 0) {
    files.push({ path: 'map/content.json', text: serializeMapFile(next.content) })
  }
  if (summary.layoutChanged) {
    files.push({ path: 'map/layout.json', text: serializeMapFile(next.layout) })
  }
  const title = summaryTitle(summary)
  const pull = await repo.openPullRequest({
    title,
    commitMessage: commitMessage(title, fields.name),
    slug: branchSlug(title),
    baseSha: fields.baseSha,
    files,
    body: (number) =>
      pullRequestBody({ name: fields.name, reason: fields.reason, summary }, number),
  })
  return json(201, { url: pull.url, number: pull.number, previewUrl: previewUrl(pull.number) })
}

/** The log line for a failed suggestion: what kind of failure and which GitHub step, never the
 * request (it holds a person's name and words) and never a credential. */
function logFailure(error: unknown): void {
  if (error instanceof GithubError) {
    console.error(`suggest: ${error.message}`)
  } else {
    console.error(`suggest: failed (${error instanceof Error ? error.name : typeof error})`)
  }
}

export async function handleSuggest(request: Request, deps: SuggestDeps): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'Use POST')
  const repo = deps.repo
  if (!repo) return failure(503, 'Suggestions are not switched on yet.')
  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  const fields = readFields(parsed.body)
  if (!fields.ok) return fields.response
  try {
    const change = await checkChange(repo, fields.value)
    if (!change.ok) return change.response
    return await openPull(repo, fields.value, change.value)
  } catch (error) {
    logFailure(error)
    return failure(
      502,
      'Your suggestion could not be sent right now. Your edits are still here, try again in a few minutes.',
    )
  }
}
