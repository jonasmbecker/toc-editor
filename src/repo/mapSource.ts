import { importFromJson } from '../files/import'
import { mergeDocument, type MapContent, type MapLayout } from '../files/split'
import type { ToCDocument } from '../model/schema'

/**
 * The theory lives in the public theory-of-metacrisis repo as two files (see `files/split.ts`).
 * This reads them from GitHub's raw host, which needs no login and no token, and rebuilds a
 * document through the same `importFromJson` door files and templates use. Every failure
 * throws a `RepoFetchError`; the callers decide what the person sees (the default map falls
 * back to the bundled copy without a word, a suggestion preview explains itself).
 */

export const THEORY_REPO = 'jonasmbecker/theory-of-metacrisis'
export const RAW_HOST = 'https://raw.githubusercontent.com'
export const API_HOST = 'https://api.github.com'

/** A slow or hanging GitHub must not hold the home screen: past this the bundled map opens. */
export const FETCH_TIMEOUT_MS = 5000
/** The real files are about 50 KB and 5 KB; anything near this is not a map. */
const MAX_FILE_CHARS = 2_000_000

export const CACHE_KEY = 'toc-theory-map:main'
/** Raw GitHub caches a file for 5 minutes itself, so a merged proposal shows up within that. */
export const CACHE_TTL_MS = 5 * 60 * 1000

export type RepoFetchErrorKind = 'network' | 'http' | 'unreadable'

export class RepoFetchError extends Error {
  readonly kind: RepoFetchErrorKind
  /** The HTTP status for `kind: 'http'`; 0 otherwise. */
  readonly status: number
  constructor(kind: RepoFetchErrorKind, status: number, message: string) {
    super(message)
    this.name = 'RepoFetchError'
    this.kind = kind
    this.status = status
  }
}

/** The files raw GitHub serves as text/plain, and the API as JSON: both are read as text and
 * parsed here, so a wrong content type never matters. */
export async function fetchJson(url: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch {
    throw new RepoFetchError('network', 0, 'GitHub could not be reached')
  }
  if (!response.ok) throw new RepoFetchError('http', response.status, `HTTP ${response.status}`)
  let text: string
  try {
    text = await response.text()
  } catch {
    throw new RepoFetchError('network', 0, 'GitHub could not be reached')
  }
  if (text.length > MAX_FILE_CHARS) throw new RepoFetchError('unreadable', 0, 'File too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new RepoFetchError('unreadable', 0, 'Not JSON')
  }
}

export interface MapFiles {
  content: unknown
  layout: unknown
}

export function rawUrl(repo: string, ref: string, file: 'content' | 'layout'): string {
  return `${RAW_HOST}/${repo}/${ref}/map/${file}.json`
}

export async function fetchMapFiles(repo: string, ref: string): Promise<MapFiles> {
  const [content, layout] = await Promise.all([
    fetchJson(rawUrl(repo, ref, 'content')),
    fetchJson(rawUrl(repo, ref, 'layout')),
  ])
  return { content, layout }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Merges and validates the two files. Throws `RepoFetchError('unreadable')` when they are not
 * a map the editor can open, so a half-edited proposal can never load a broken document. */
export function documentFromFiles({ content, layout }: MapFiles): ToCDocument {
  if (!isObject(content) || !isObject(layout) || !isObject(layout.cards)) {
    throw new RepoFetchError('unreadable', 0, 'The map files have the wrong shape')
  }
  let merged: ReturnType<typeof mergeDocument>
  try {
    merged = mergeDocument(content as MapContent, layout as unknown as MapLayout)
  } catch {
    throw new RepoFetchError('unreadable', 0, 'The map files have the wrong shape')
  }
  if (!merged.ok) throw new RepoFetchError('unreadable', 0, merged.errors.join('; '))
  const result = importFromJson(merged.document)
  if (!result.ok) throw new RepoFetchError('unreadable', 0, result.errors.join('; '))
  return result.document
}

interface CachedFiles extends MapFiles {
  fetchedAt: number
}

function readCache(now: number): MapFiles | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedFiles
    if (typeof cached.fetchedAt !== 'number' || now - cached.fetchedAt > CACHE_TTL_MS) return null
    return { content: cached.content, layout: cached.layout }
  } catch {
    return null
  }
}

function writeCache(files: MapFiles, now: number): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...files, fetchedAt: now }))
  } catch {
    // Storage full or blocked: the next open simply fetches again.
  }
}

/**
 * The theory's `main` branch as a document. Served from sessionStorage for 5 minutes (so a
 * home screen that fetched ahead opens instantly, and a reload does not hit GitHub again);
 * only files that merged and validated are ever cached. Throws `RepoFetchError`.
 */
export async function loadTheoryMap(now: () => number = Date.now): Promise<ToCDocument> {
  const cached = readCache(now())
  if (cached) {
    try {
      return documentFromFiles(cached)
    } catch {
      // A stale or damaged entry: fall through to a fresh fetch.
    }
  }
  const files = await fetchMapFiles(THEORY_REPO, 'main')
  const document = documentFromFiles(files)
  writeCache(files, now())
  return document
}

/** Fetches ahead so a click on the featured card opens at once. Never throws. */
export function warmTheoryMap(): void {
  void loadTheoryMap().catch(() => undefined)
}
