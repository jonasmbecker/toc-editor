import { beforeEach, describe, expect, it, vi } from 'vitest'
import statusQuoJson from '../templates/status-quo-metacrisis.json'
import { statusQuoMetacrisis } from '../templates'
import { serializeMapFile, splitDocument } from '../files/split'
import type { ToCDocument } from '../model/schema'
import {
  CACHE_TTL_MS,
  FETCH_TIMEOUT_MS,
  RepoFetchError,
  cacheKey,
  documentFromFiles,
  indexUrl,
  loadTheoryIndex,
  loadTheoryMap,
  theoryOriginOf,
  rawUrl,
  THEORY_REPO,
} from './mapSource'
import { BUNDLED_INDEX, parseTheoryIndex } from './theoryIndex'
import { openTheory } from './openTheory'

/** What the bare address opens: the default theory, or the bundled copy. */
const loadDefaultMap = async () => (await openTheory(null)).document

const { content, layout } = splitDocument(statusQuoJson as unknown as ToCDocument)

function respond(body: string, status = 200) {
  return Promise.resolve(new Response(body, { status }))
}

const SHA = 'a'.repeat(40)
const SHA_URL = 'https://api.github.com/repos/jonasmbecker/theory-of-metacrisis/commits/main'

const INDEX = {
  default: 'jonas',
  theories: [
    { slug: 'jonas', title: "Jonas Becker's theory", status: 'author', layout: 'stages' },
    {
      slug: 'schmachtenberger',
      title: 'Daniel Schmachtenberger (reconstructed)',
      status: 'reconstructed',
      layout: 'free',
      statusNote: 'Not endorsed by him.',
    },
  ],
}

interface Served {
  content?: string
  layout?: string
  /** The index file's text, or null for a commit that has none yet (its map is in `map/`). */
  index?: string | null
}

/** Serves the split bundled map as both theories, the index, and the commit main points at. */
function serveMap(overrides: Served = {}) {
  const index = overrides.index === undefined ? JSON.stringify(INDEX) : overrides.index
  const dirs = index === null ? ['map'] : ['theories/jonas', 'theories/schmachtenberger']
  const fetchMock = vi.fn((url: string) => {
    if (url === SHA_URL) return respond(SHA)
    if (url === indexUrl(THEORY_REPO, SHA) && index !== null) return respond(index)
    for (const dir of dirs) {
      if (url === rawUrl(THEORY_REPO, SHA, dir, 'content')) {
        return respond(overrides.content ?? serializeMapFile(content))
      }
      if (url === rawUrl(THEORY_REPO, SHA, dir, 'layout')) {
        return respond(overrides.layout ?? serializeMapFile(layout))
      }
    }
    return respond('not found', 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const title = (doc: ToCDocument) => doc.title
const urls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url]) => url)

describe('loading a theory from the repo', () => {
  beforeEach(() => sessionStorage.clear())

  it("reads the index, then the default theory's two files, at the commit main points at", async () => {
    const fetchMock = serveMap()
    const doc = await loadTheoryMap()
    const raw = `https://raw.githubusercontent.com/jonasmbecker/theory-of-metacrisis/${SHA}`
    expect(urls(fetchMock).sort()).toEqual([
      SHA_URL,
      `${raw}/theories/index.json`,
      `${raw}/theories/jonas/content.json`,
      `${raw}/theories/jonas/layout.json`,
    ])
    expect(serializeMapFile(doc)).toBe(serializeMapFile(statusQuoMetacrisis()))
    expect(theoryOriginOf(doc)).toMatchObject({ sha: SHA, slug: 'jonas' })
    expect(theoryOriginOf(statusQuoMetacrisis())).toBeNull()
  })

  it('opens another listed theory from its own folder, at the same commit', async () => {
    const fetchMock = serveMap()
    const doc = await loadTheoryMap('schmachtenberger')
    expect(urls(fetchMock)).toContain(
      rawUrl(THEORY_REPO, SHA, 'theories/schmachtenberger', 'content'),
    )
    expect(theoryOriginOf(doc)).toMatchObject({ sha: SHA, slug: 'schmachtenberger' })
  })

  it('refuses a theory the index does not list, without reading any folder', async () => {
    const fetchMock = serveMap()
    await expect(loadTheoryMap('../map')).rejects.toMatchObject({ kind: 'http', status: 404 })
    expect(urls(fetchMock).some((url) => String(url).endsWith('content.json'))).toBe(false)
  })

  it('reads map/ as the default theory while the repo has no index yet', async () => {
    const fetchMock = serveMap({ index: null })
    const doc = await loadTheoryMap()
    expect(urls(fetchMock)).toContain(rawUrl(THEORY_REPO, SHA, 'map', 'content'))
    expect(theoryOriginOf(doc)).toMatchObject({ sha: SHA, slug: 'jonas' })
    expect((await loadTheoryIndex()).index).toEqual(BUNDLED_INDEX)
  })

  it('fails rather than guessing when the index is not one', async () => {
    serveMap({ index: '{"default": "nobody", "theories": []}' })
    await expect(loadTheoryMap()).rejects.toMatchObject({ kind: 'unreadable' })
  })

  it('reads main and offers no origin when GitHub will not give the commit', async () => {
    const fetchMock = vi.fn((url: string) =>
      url.endsWith('content.json')
        ? respond(serializeMapFile(content))
        : url.endsWith('layout.json')
          ? respond(serializeMapFile(layout))
          : url.endsWith('index.json')
            ? respond(JSON.stringify(INDEX))
            : respond('rate limited', 403),
    )
    vi.stubGlobal('fetch', fetchMock)
    const doc = await loadTheoryMap()
    expect(urls(fetchMock)).toContain(rawUrl(THEORY_REPO, 'main', 'theories/jonas', 'content'))
    expect(theoryOriginOf(doc)).toBeNull()
  })

  it('keeps the commit through the cache', async () => {
    serveMap()
    await loadTheoryMap()
    expect(theoryOriginOf(await loadTheoryMap())?.sha).toBe(SHA)
  })

  it('shows a change merged into the repo', async () => {
    const edited = { ...content, title: 'The theory, edited on GitHub' }
    serveMap({ content: serializeMapFile(edited) })
    expect(title(await loadTheoryMap())).toBe('The theory, edited on GitHub')
  })

  it('serves a repeat open from sessionStorage until the entry is 5 minutes old', async () => {
    const fetchMock = serveMap()
    const start = 1_000_000
    await loadTheoryMap(null, () => start)
    await loadTheoryMap(null, () => start + CACHE_TTL_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await loadTheoryMap(null, () => start + CACHE_TTL_MS + 1)
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it('lets a click that lands during the fetch-ahead join that request', async () => {
    const fetchMock = serveMap()
    const [ahead, click] = await Promise.all([loadTheoryMap(), loadTheoryMap()])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(serializeMapFile(click)).toBe(serializeMapFile(ahead))
  })

  it('never caches files that fail to merge', async () => {
    serveMap({ layout: serializeMapFile({ cards: {} }) })
    await expect(loadTheoryMap()).rejects.toBeInstanceOf(RepoFetchError)
    expect(sessionStorage.getItem(cacheKey('jonas'))).toBeNull()
  })

  it('drops a damaged cache entry and fetches again', async () => {
    sessionStorage.setItem(cacheKey('jonas'), '{"fetchedAt": 1, nonsense')
    const fetchMock = serveMap()
    await loadTheoryMap()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('still opens when storage is blocked', async () => {
    serveMap()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await expect(loadTheoryMap()).resolves.toBeDefined()
    vi.restoreAllMocks()
  })
})

describe('the default map falls back to the bundled copy without a word', () => {
  beforeEach(() => sessionStorage.clear())

  const bundled = () => serializeMapFile(statusQuoMetacrisis())

  it('when the network is down', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when GitHub answers 404 or rate-limits', async () => {
    vi.stubGlobal('fetch', () => respond('Not Found', 404))
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
    vi.stubGlobal('fetch', () => respond('rate limited', 429))
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when a file is not JSON', async () => {
    serveMap({ content: '<html>captive portal</html>' })
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when the files no longer fit the schema', async () => {
    const broken = { ...content, sections: 'not a list' }
    serveMap({ content: serializeMapFile(broken) })
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when a card in content.json has no position in layout.json', async () => {
    serveMap({ layout: serializeMapFile({ ...layout, cards: {} }) })
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when a link address is not a web address', async () => {
    const text = serializeMapFile(content).replace(
      /"url": "https?:\/\/[^"]+"/,
      '"url": "javascript:alert(1)"',
    )
    expect(text).not.toBe(serializeMapFile(content))
    serveMap({ content: text })
    expect(serializeMapFile(await loadDefaultMap())).toBe(bundled())
  })

  it('when GitHub hangs past the timeout', async () => {
    // `AbortSignal.timeout` runs on the platform's own clock, which fake timers do not move,
    // so the test owns the signal and fires it where the 5 seconds would end.
    const expiry = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(expiry.signal)
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const fail = () => reject(new DOMException('timeout', 'TimeoutError'))
        if (init.signal?.aborted) fail()
        init.signal?.addEventListener('abort', fail)
      })
    })
    const pending = loadDefaultMap()
    expect(timeout).toHaveBeenCalledWith(FETCH_TIMEOUT_MS)
    expiry.abort()
    expect(serializeMapFile(await pending)).toBe(bundled())
    timeout.mockRestore()
  })
})

describe('documentFromFiles', () => {
  it('rejects values that are not the two files', () => {
    expect(() => documentFromFiles({ content: null, layout })).toThrow(RepoFetchError)
    expect(() => documentFromFiles({ content, layout: [] })).toThrow(RepoFetchError)
    expect(() => documentFromFiles({ content: { sections: [{ columns: 3 }] }, layout })).toThrow(
      RepoFetchError,
    )
  })

  const freeContent = {
    color: '#2F2D2E',
    title: 'Loops',
    sections: [
      {
        title: '',
        columns: [
          { nodes: [{ id: 'a', title: 'A', text: '', color: '#FFFFFF', connections: [] }] },
        ],
      },
    ],
  }

  it('reads a free-canvas layout: the mode and every card x', () => {
    const freeLayout = {
      layoutMode: 'free',
      cards: { a: { width: 200, yPosition: 40, xPosition: 320 } },
    }
    const doc = documentFromFiles({ content: freeContent, layout: freeLayout })
    expect(doc.layoutMode).toBe('free')
    expect(doc.sections[0].columns[0].nodes[0].xPosition).toBe(320)
  })

  it('refuses a free layout whose x is not a number', () => {
    const bad = {
      layoutMode: 'free',
      cards: { a: { width: 200, yPosition: 40, xPosition: 'left' } },
    }
    expect(() => documentFromFiles({ content: freeContent, layout: bad })).toThrow(RepoFetchError)
  })
})

describe('parseTheoryIndex', () => {
  it('keeps the entries that fit, and marks an unknown status as other', () => {
    const index = parseTheoryIndex({
      default: 'a',
      theories: [
        { slug: 'a', title: 'A', status: 'author' },
        { slug: 'b', title: 'B', status: 'endorsed-later' },
        { slug: 'Not A Slug', title: 'C', status: 'author' },
        { slug: 'a', title: 'A again', status: 'author' },
      ],
    })
    expect(index?.theories.map((t) => [t.slug, t.status, t.layout])).toEqual([
      ['a', 'author', 'stages'],
      ['b', 'other', 'stages'],
    ])
  })

  it('refuses an index whose default it does not list', () => {
    const one = [{ slug: 'a', title: 'A', status: 'author' }]
    expect(parseTheoryIndex({ default: 'x', theories: one })).toBeNull()
    expect(parseTheoryIndex([])).toBeNull()
  })
})
