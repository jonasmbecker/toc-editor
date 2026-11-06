import { importFromJson } from '../files/import'
import { mergeDocument, type MapContent, type MapLayout } from '../files/split'
import type { ToCDocument } from '../model/schema'
import { BUNDLED_INDEX, findTheory, parseTheoryIndex, type TheoryIndex } from './theoryIndex'

/**
 * Each theory lives in the public theory-of-metacrisis repo as two files (see `files/split.ts`)
 * in its own folder, `theories/<slug>/`, listed in `theories/index.json` (`theoryIndex.ts`);
 * before the index existed the one theory lived in `map/`. This reads them from GitHub's raw
 * host, which needs no login and no token, and rebuilds a document through the same
 * `importFromJson` door files and templates use. Every failure throws a `RepoFetchError`; the
 * callers decide what the person sees (the default map falls back to the bundled copy without a
 * word, a suggestion preview explains itself).
 */

export const THEORY_REPO = 'jonasmbecker/theory-of-metacrisis'
export const RAW_HOST = 'https://raw.githubusercontent.com'
export const API_HOST = 'https://api.github.com'

/** A slow or hanging GitHub must not hold the opening map: past this the bundled map opens. */
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

/** Where Jonas's theory lived before the repo held several. Read when `theories/index.json` does
 * not exist yet at the commit being read, and for suggestions opened against that layout. */
export const LEGACY_DIR = 'map'
export const INDEX_PATH = 'theories/index.json'

/** The folder a theory's two files live in. */
export function theoryDir(slug: string): string {
  return `theories/${slug}`
}

export function rawUrl(repo: string, ref: string, dir: string, file: 'content' | 'layout'): string {
  return `${RAW_HOST}/${repo}/${ref}/${dir}/${file}.json`
}

export function indexUrl(repo: string, ref: string): string {
  return `${RAW_HOST}/${repo}/${ref}/${INDEX_PATH}`
}

export async function fetchMapFiles(repo: string, ref: string, dir: string): Promise<MapFiles> {
  const [content, layout] = await Promise.all([
    fetchJson(rawUrl(repo, ref, dir, 'content')),
    fetchJson(rawUrl(repo, ref, dir, 'layout')),
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

const SHA_PATTERN = /^[0-9a-f]{40}$/

function readEntry<T extends object>(
  key: string,
  now: number,
): (T & { sha: string | null }) | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const cached = JSON.parse(raw) as T & { fetchedAt?: unknown; sha?: unknown }
    if (typeof cached.fetchedAt !== 'number' || now - cached.fetchedAt > CACHE_TTL_MS) return null
    const sha = typeof cached.sha === 'string' && SHA_PATTERN.test(cached.sha) ? cached.sha : null
    return { ...cached, sha }
  } catch {
    return null
  }
}

function writeEntry(key: string, value: object, now: number): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...value, fetchedAt: now }))
  } catch {
    // Storage full or blocked: the next open simply fetches again.
  }
}

/** The commit `main` points at, or null when GitHub will not say (rate limit, offline). */
async function fetchMainSha(): Promise<string | null> {
  try {
    const response = await fetch(`${API_HOST}/repos/${THEORY_REPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github.sha' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const text = (await response.text()).trim()
    return SHA_PATTERN.test(text) ? text : null
  } catch {
    return null
  }
}

/** What `main` offers at one commit: its theory index, and whether that commit still keeps the
 * single map in `map/` (no index yet, so the bundled index stands in). */
export interface TheorySnapshot {
  sha: string | null
  index: TheoryIndex
  legacy: boolean
}

export const INDEX_CACHE_KEY = 'toc-theory-index:main'

/** The sessionStorage key a theory's files are kept under. */
export function cacheKey(slug: string): string {
  return `${CACHE_KEY}:${slug}`
}

/** One request at a time: a click that lands while the fetch-ahead is still running joins it. */
let pendingIndex: Promise<TheorySnapshot> | null = null
const pendingMaps = new Map<string, Promise<MapFiles>>()

/** Reads the index at the commit `main` points at, so every theory opened from it, and the sha
 * a suggestion is branched from, belong to one version. Without a sha it reads `main`. */
function fetchSnapshot(): Promise<TheorySnapshot> {
  pendingIndex ??= (async () => {
    const sha = await fetchMainSha()
    try {
      const index = parseTheoryIndex(await fetchJson(indexUrl(THEORY_REPO, sha ?? 'main')))
      if (!index) throw new RepoFetchError('unreadable', 0, 'The theory index has the wrong shape')
      return { sha, index, legacy: false }
    } catch (error) {
      if (error instanceof RepoFetchError && error.status === 404) {
        return { sha, index: BUNDLED_INDEX, legacy: true }
      }
      throw error
    }
  })().finally(() => {
    pendingIndex = null
  })
  return pendingIndex
}

/**
 * The theories `main` offers. Served from sessionStorage for 5 minutes, like the maps (raw GitHub
 * caches a file that long itself). Throws `RepoFetchError`; callers fall back to `BUNDLED_INDEX`.
 */
export async function loadTheoryIndex(now: () => number = Date.now): Promise<TheorySnapshot> {
  const cached = readEntry<{ index?: unknown; legacy?: unknown }>(INDEX_CACHE_KEY, now())
  const index = cached ? parseTheoryIndex(cached.index) : null
  if (cached && index) return { sha: cached.sha, index, legacy: cached.legacy === true }
  const snapshot = await fetchSnapshot()
  writeEntry(INDEX_CACHE_KEY, snapshot, now())
  return snapshot
}

function fetchTheoryFiles(snapshot: TheorySnapshot, slug: string): Promise<MapFiles> {
  const dir = snapshot.legacy ? LEGACY_DIR : theoryDir(slug)
  const key = `${snapshot.sha ?? 'main'}/${dir}`
  let pending = pendingMaps.get(key)
  if (!pending) {
    pending = fetchMapFiles(THEORY_REPO, snapshot.sha ?? 'main', dir).finally(() => {
      pendingMaps.delete(key)
    })
    pendingMaps.set(key, pending)
  }
  return pending
}

/** Where the map the person is editing came from: the commit, the theory and the document as
 * loaded, which a suggestion is compared against. Set by every `loadTheoryMap`; `App` claims it
 * only when the document it opens is this very object (so a draft, a share link or a template
 * never claims). */
export interface TheoryOrigin {
  sha: string
  slug: string
  document: ToCDocument
}

let lastOrigin: TheoryOrigin | null = null

export function theoryOriginOf(document: ToCDocument): TheoryOrigin | null {
  return lastOrigin && lastOrigin.document === document ? lastOrigin : null
}

/**
 * One theory from `main` as a document: `slug`, or the index's default when null. The files are
 * read at the same commit as the index and kept in sessionStorage for 5 minutes; only files that
 * merged and validated are ever kept. Throws `RepoFetchError` (status 404 for a slug the index
 * does not list).
 */
export async function loadTheoryMap(
  slug: string | null = null,
  now: () => number = Date.now,
): Promise<ToCDocument> {
  const snapshot = await loadTheoryIndex(now)
  const target = slug ?? snapshot.index.default
  if (!findTheory(snapshot.index, target)) {
    throw new RepoFetchError('http', 404, `No theory called "${target}"`)
  }
  const claim = (document: ToCDocument) => {
    lastOrigin = snapshot.sha ? { sha: snapshot.sha, slug: target, document } : null
    return document
  }
  const cached = readEntry<MapFiles>(cacheKey(target), now())
  // A kept map counts only if it was read at the commit the index was.
  if (cached && cached.sha === snapshot.sha) {
    try {
      return claim(documentFromFiles(cached))
    } catch {
      // A stale or damaged entry: fall through to a fresh fetch.
    }
  }
  const files = await fetchTheoryFiles(snapshot, target)
  const document = documentFromFiles(files)
  writeEntry(cacheKey(target), { ...files, sha: snapshot.sha }, now())
  return claim(document)
}

/** Fetches ahead so opening the default theory is instant. Never throws. */
export function warmTheoryMap(): void {
  void loadTheoryMap().catch(() => undefined)
}
