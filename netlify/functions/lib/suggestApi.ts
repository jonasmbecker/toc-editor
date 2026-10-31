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
import { failure, json, readJsonBody, type BodyLimit } from './http'
import type { Kv } from './kv'
import {
  SUGGESTIONS_PER_DAY,
  SUGGESTIONS_PER_HOUR,
  releaseSuggestion,
  reserveSuggestion,
} from './suggestLimits'
import { EDITOR_URL, branchSlug, commitMessage, previewUrl, pullRequestBody } from './suggestPr'
import { cleanName, cleanReason } from './suggestText'
import { THEORY_REPO, type TheoryRepo } from './theoryRepo'

/**
 * The suggestion API, free of anything Netlify-specific so it can be tested against an in-memory
 * store and a fake repo. `suggest-change.ts` adapts it to a Netlify Function.
 *
 *   POST { content, layout, name, reason, baseSha, website }
 *     -> 201 { url, number, previewUrl }
 *
 * `content` and `layout` are the two map files as the editor would write them, `baseSha` the
 * commit of the theory repo the contributor's edit started from, and `website` the honeypot: a
 * field no person sees, so anything in it is a bot, which is answered with a success that opens
 * nothing.
 *
 * The limits, in the order they apply: body at most 512 KB; honeypot; name at most 80 and reason
 * at most 1000 characters, stripped of HTML; a map that passes the editor's schema; no more than
 * 5 cards removed at once; then, only for a request that would go ahead, 3 suggestions an hour
 * and 10 a day per address.
 */

export const MAX_BODY: BodyLimit = {
  bytes: 512 * 1024,
  message: 'Your suggestion is too large to send (the limit is 512 KB).',
}
/** More removals than this in one suggestion are refused: bulk deletion is how a map is vandalised. */
export const MAX_CARDS_REMOVED = 5

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

function readFields(body: Record<string, unknown>): Checked<Fields> {
  const name = cleanName(body.name)
  if (!name.ok) return bad(name.error)
  const reason = cleanReason(body.reason)
  if (!reason.ok) return bad(reason.error)
  const baseSha = typeof body.baseSha === 'string' ? body.baseSha.trim() : ''
  if (!SHA.test(baseSha)) {
    return bad('The editor did not say which version of the map you started from.')
  }
  const { content, layout } = body
  return { ok: true, value: { name: name.text, reason: reason.text, baseSha, content, layout } }
}

/** Anything in the field a person cannot see: text, a number, `true`. Blank text counts as empty,
 * since a browser's autofill can leave a space. */
function isFilled(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false
  return typeof value === 'string' ? value.trim() !== '' : true
}

/** Looks exactly like a success (and costs the bot nothing to believe) but opens nothing, uses no
 * rate-limit slot and calls no one. The number 0 is how a client can tell it is not real. */
function honeypotResponse(): Response {
  return json(201, {
    url: `https://github.com/${THEORY_REPO}/pulls`,
    number: 0,
    previewUrl: EDITOR_URL,
  })
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
  if (summary.cardsRemoved > MAX_CARDS_REMOVED) {
    return bad(
      `This removes more than ${MAX_CARDS_REMOVED} cards at once. Please send the removals in smaller suggestions, each with its reason.`,
    )
  }
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

/** Takes a rate-limit slot, opens the pull request, and gives the slot back if GitHub fails. */
async function sendWithinLimits(
  repo: TheoryRepo,
  deps: SuggestDeps,
  fields: Fields,
  proposed: Proposed,
): Promise<Response> {
  if (!(await reserveSuggestion(deps.kv, deps.ip, deps.now()))) {
    return failure(
      429,
      `You have sent several suggestions already (up to ${SUGGESTIONS_PER_HOUR} an hour and ${SUGGESTIONS_PER_DAY} a day). Please try again later.`,
    )
  }
  try {
    return await openPull(repo, fields, proposed)
  } catch (error) {
    await releaseSuggestion(deps.kv, deps.ip, deps.now())
    throw error
  }
}

export async function handleSuggest(request: Request, deps: SuggestDeps): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'Use POST')
  const repo = deps.repo
  if (!repo) return failure(503, 'Suggestions are not switched on yet.')
  const parsed = await readJsonBody(request, MAX_BODY)
  if (!parsed.ok) return parsed.response
  if (isFilled(parsed.body.website)) return honeypotResponse()
  const fields = readFields(parsed.body)
  if (!fields.ok) return fields.response
  // Without an address there is nothing to count against, and nothing is let through unchecked.
  if (!deps.ip) return failure(400, 'Your request could not be checked, try again later.')
  try {
    const change = await checkChange(repo, fields.value)
    if (!change.ok) return change.response
    return await sendWithinLimits(repo, deps, fields.value, change.value)
  } catch (error) {
    logFailure(error)
    // TEMP-DIAGNOSTIC: remove after the end-to-end test.
    const detail =
      error instanceof GithubError
        ? error.message
        : `${error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : typeof error}`
    return json(502, { error: 'Your suggestion could not be sent right now. Your edits are still here, try again in a few minutes.', detail })
  }
}
