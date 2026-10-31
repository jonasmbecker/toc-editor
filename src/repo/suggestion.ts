import { z } from 'zod'
import type { ToCDocument } from '../model/schema'
import {
  API_HOST,
  RepoFetchError,
  THEORY_REPO,
  documentFromFiles,
  fetchJson,
  fetchMapFiles,
} from './mapSource'

/**
 * A suggestion is a pull request on the theory repo, and `/?suggestion=<number>` opens the map
 * that pull request proposes. The pull request is resolved through GitHub's public API (no
 * token), and its two map files are read at the exact commit the branch points to, so the
 * preview cannot change under the reader while they look. Everything read from a pull request
 * is untrusted: the numbers and names are checked here, and the map goes through the same
 * validation as any imported file (which refuses non-web link addresses).
 */

export interface SuggestionInfo {
  number: number
  title: string
  /** The pull request's page on GitHub. */
  url: string
}

export type SuggestionFailure = 'not-found' | 'closed' | 'merged' | 'no-map' | 'unreachable'

export class SuggestionError extends Error {
  readonly reason: SuggestionFailure
  constructor(reason: SuggestionFailure) {
    super(reason)
    this.name = 'SuggestionError'
    this.reason = reason
  }
}

/** The raw `suggestion` query value, or null when the address has none. */
export function suggestionParam(search: string): string | null {
  return new URLSearchParams(search).get('suggestion')
}

const NUMBER = /^[1-9]\d{0,6}$/

const pullSchema = z.object({
  state: z.enum(['open', 'closed']),
  merged: z.boolean().optional(),
  title: z.string(),
  head: z.object({
    sha: z.string().regex(/^[0-9a-f]{40}$/),
    repo: z.object({ full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }).nullable(),
  }),
})

async function fetchPull(number: number): Promise<z.infer<typeof pullSchema>> {
  let raw: unknown
  try {
    raw = await fetchJson(`${API_HOST}/repos/${THEORY_REPO}/pulls/${number}`)
  } catch (error) {
    const isMissing = error instanceof RepoFetchError && error.status === 404
    throw new SuggestionError(isMissing ? 'not-found' : 'unreachable')
  }
  const parsed = pullSchema.safeParse(raw)
  if (!parsed.success) throw new SuggestionError('unreachable')
  return parsed.data
}

/** Loads suggestion `raw` (the query value) as a document. Throws `SuggestionError`. */
export async function loadSuggestion(
  raw: string,
): Promise<{ info: SuggestionInfo; document: ToCDocument }> {
  if (!NUMBER.test(raw)) throw new SuggestionError('not-found')
  const number = Number(raw)
  const pull = await fetchPull(number)
  if (pull.state === 'closed') throw new SuggestionError(pull.merged ? 'merged' : 'closed')
  // A pull request from a fork whose repository was deleted has no files left to read.
  if (!pull.head.repo) throw new SuggestionError('not-found')

  let document: ToCDocument
  try {
    document = documentFromFiles(await fetchMapFiles(pull.head.repo.full_name, pull.head.sha))
  } catch (error) {
    const isMissing = error instanceof RepoFetchError && error.status === 404
    const isUnreadable = error instanceof RepoFetchError && error.kind === 'unreadable'
    throw new SuggestionError(isMissing || isUnreadable ? 'no-map' : 'unreachable')
  }
  const info = {
    number,
    title: pull.title,
    url: `https://github.com/${THEORY_REPO}/pull/${number}`,
  }
  return { info, document }
}

/** What the person is told when a suggestion cannot be shown; the current map opens instead. */
export function explainFailure(raw: string, reason: SuggestionFailure): string {
  const label = NUMBER.test(raw) ? `Suggestion #${raw}` : 'That suggestion'
  switch (reason) {
    case 'not-found':
      return `${label} was not found. Here is the current map.`
    case 'closed':
      return `${label} was closed without being accepted, so there is nothing to preview. Here is the current map.`
    case 'merged':
      return `${label} was accepted and is already part of the current map.`
    case 'no-map':
      return `${label} has no map that can be shown. Here is the current map.`
    case 'unreachable':
      return `${label} could not be loaded right now. Here is the current map.`
  }
}
