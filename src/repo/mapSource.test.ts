import { beforeEach, describe, expect, it, vi } from 'vitest'
import statusQuoJson from '../templates/status-quo-metacrisis.json'
import { loadDefaultMap, statusQuoMetacrisis } from '../templates'
import { serializeMapFile, splitDocument } from '../files/split'
import type { ToCDocument } from '../model/schema'
import {
  CACHE_KEY,
  CACHE_TTL_MS,
  FETCH_TIMEOUT_MS,
  RepoFetchError,
  documentFromFiles,
  loadTheoryMap,
  rawUrl,
  THEORY_REPO,
} from './mapSource'

const { content, layout } = splitDocument(statusQuoJson as unknown as ToCDocument)

function respond(body: string, status = 200) {
  return Promise.resolve(new Response(body, { status }))
}

/** Serves the split bundled map from the raw host, as GitHub would. */
function serveMap(overrides: Partial<Record<'content' | 'layout', string>> = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === rawUrl(THEORY_REPO, 'main', 'content')) {
      return respond(overrides.content ?? serializeMapFile(content))
    }
    if (url === rawUrl(THEORY_REPO, 'main', 'layout')) {
      return respond(overrides.layout ?? serializeMapFile(layout))
    }
    return respond('not found', 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const title = (doc: ToCDocument) => doc.title

describe('loading the theory map from the repo', () => {
  beforeEach(() => sessionStorage.clear())

  it('fetches content.json and layout.json from the repo main and merges them', async () => {
    const fetchMock = serveMap()
    const doc = await loadTheoryMap()
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://raw.githubusercontent.com/jonasmbecker/theory-of-metacrisis/main/map/content.json',
      'https://raw.githubusercontent.com/jonasmbecker/theory-of-metacrisis/main/map/layout.json',
    ])
    expect(serializeMapFile(doc)).toBe(serializeMapFile(statusQuoMetacrisis()))
  })

  it('shows a change merged into the repo', async () => {
    const edited = { ...content, title: 'The theory, edited on GitHub' }
    serveMap({ content: serializeMapFile(edited) })
    expect(title(await loadTheoryMap())).toBe('The theory, edited on GitHub')
  })

  it('serves a repeat open from sessionStorage until the entry is 5 minutes old', async () => {
    const fetchMock = serveMap()
    const start = 1_000_000
    await loadTheoryMap(() => start)
    await loadTheoryMap(() => start + CACHE_TTL_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await loadTheoryMap(() => start + CACHE_TTL_MS + 1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('lets a click that lands during the fetch-ahead join that request', async () => {
    const fetchMock = serveMap()
    const [ahead, click] = await Promise.all([loadTheoryMap(), loadTheoryMap()])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(serializeMapFile(click)).toBe(serializeMapFile(ahead))
  })

  it('never caches files that fail to merge', async () => {
    serveMap({ layout: serializeMapFile({ cards: {} }) })
    await expect(loadTheoryMap()).rejects.toBeInstanceOf(RepoFetchError)
    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('drops a damaged cache entry and fetches again', async () => {
    sessionStorage.setItem(CACHE_KEY, '{"fetchedAt": 1, nonsense')
    const fetchMock = serveMap()
    await loadTheoryMap()
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('timeout', 'TimeoutError')),
        )
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
})
