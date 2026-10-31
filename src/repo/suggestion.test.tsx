import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import statusQuoJson from '../templates/status-quo-metacrisis.json'
import { statusQuoMetacrisis } from '../templates'
import { serializeMapFile, splitDocument } from '../files/split'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { useShareStore } from '../share/shareStore'
import { StageBar } from '../share/StageBar'
import { loadSuggestion, suggestionParam, explainFailure } from './suggestion'
import { useSuggestionStore } from './suggestionStore'
import { OpeningSuggestion } from './OpeningSuggestion'
import { rawUrl } from './mapSource'

const { content, layout } = splitDocument(statusQuoJson as unknown as ToCDocument)
const SHA = 'a'.repeat(40)
const PULL_URL = 'https://api.github.com/repos/jonasmbecker/theory-of-metacrisis/pulls/12'

function pull(overrides: Record<string, unknown> = {}) {
  return {
    state: 'open',
    merged: false,
    title: 'Added link: Intergenerational war trauma to Collective freeze',
    head: { sha: SHA, repo: { full_name: 'jonasmbecker/theory-of-metacrisis' } },
    ...overrides,
  }
}

/** Serves the pull request and its two map files at the commit, as GitHub would. */
function serve({
  pullBody = pull(),
  pullStatus = 200,
  proposed = { ...content, title: 'The map as proposed' },
  filesStatus = 200,
}: {
  pullBody?: unknown
  pullStatus?: number
  proposed?: unknown
  filesStatus?: number
} = {}) {
  const fetchMock = vi.fn((url: string) => {
    const reply = (body: string, status: number) => Promise.resolve(new Response(body, { status }))
    if (url === PULL_URL) return reply(JSON.stringify(pullBody), pullStatus)
    if (url === rawUrl('jonasmbecker/theory-of-metacrisis', SHA, 'content')) {
      return reply(serializeMapFile(proposed), filesStatus)
    }
    if (url === rawUrl('jonasmbecker/theory-of-metacrisis', SHA, 'layout')) {
      return reply(serializeMapFile(layout), filesStatus)
    }
    // Everything else, such as the default map's own files, is simply not there.
    return reply('Not Found', 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?suggestion=12')
  useShareStore.getState().reset()
  useSuggestionStore.getState().clear()
  useToCStore.getState().load({ color: '#2F2D2E', title: 'Before', sections: [] })
})

describe('suggestion address', () => {
  it('reads the raw query value, and nothing when there is none', () => {
    expect(suggestionParam('?suggestion=12')).toBe('12')
    expect(suggestionParam('?other=1')).toBeNull()
    expect(suggestionParam('')).toBeNull()
  })
})

describe('loadSuggestion', () => {
  it('resolves the pull request, then reads its files at the commit it points to', async () => {
    const fetchMock = serve()
    const { info, document } = await loadSuggestion('12')
    expect(info).toEqual({
      number: 12,
      title: 'Added link: Intergenerational war trauma to Collective freeze',
      url: 'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12',
    })
    expect(document.title).toBe('The map as proposed')
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      `https://raw.githubusercontent.com/jonasmbecker/theory-of-metacrisis/${SHA}/map/content.json`,
    )
    // No credentials of any kind ride along.
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit?][]) {
      expect(init?.headers).toBeUndefined()
    }
  })

  it('reads a pull request from a fork at the fork', async () => {
    const fork = pull({ head: { sha: SHA, repo: { full_name: 'someone/their-fork' } } })
    const fetchMock = vi.fn((url: string) => {
      const reply = (body: string) => Promise.resolve(new Response(body, { status: 200 }))
      if (url === PULL_URL) return reply(JSON.stringify(fork))
      if (url === rawUrl('someone/their-fork', SHA, 'content'))
        return reply(serializeMapFile(content))
      return reply(serializeMapFile(layout))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadSuggestion('12')).resolves.toBeDefined()
  })

  it.each([
    ['an unknown number', { pullStatus: 404 }, 'not-found'],
    ['a closed pull request', { pullBody: pull({ state: 'closed' }) }, 'closed'],
    ['a merged pull request', { pullBody: pull({ state: 'closed', merged: true }) }, 'merged'],
    ['a deleted fork', { pullBody: pull({ head: { sha: SHA, repo: null } }) }, 'not-found'],
    ['a rate-limited API', { pullStatus: 403 }, 'unreachable'],
    ['an unexpected API answer', { pullBody: { hello: 'world' } }, 'unreachable'],
    ['a branch without the map files', { filesStatus: 404 }, 'no-map'],
    ['a map that fails the schema', { proposed: { ...content, sections: 'x' } }, 'no-map'],
  ])('refuses %s', async (_name, options, reason) => {
    serve(options)
    await expect(loadSuggestion('12')).rejects.toMatchObject({ reason })
  })

  it.each(['abc', '0', '-3', '1.5', '12abc', '99999999', '../../x'])(
    'never calls GitHub for the value %s',
    async (value) => {
      const fetchMock = serve()
      await expect(loadSuggestion(value)).rejects.toMatchObject({ reason: 'not-found' })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('says in plain words what went wrong', () => {
    expect(explainFailure('12', 'closed')).toMatch(/Suggestion #12 was closed/)
    expect(explainFailure('abc', 'not-found')).toMatch(/^That suggestion was not found/)
  })
})

describe('OpeningSuggestion', () => {
  it('opens the proposed map read-only with the banner naming the suggestion', async () => {
    serve()
    const onOpened = vi.fn()
    render(<OpeningSuggestion raw="12" onOpened={onOpened} />)
    await waitFor(() => expect(onOpened).toHaveBeenCalled())

    const state = useToCStore.getState()
    expect(state.document.title).toBe('The map as proposed')
    expect(state.isReadOnly).toBe(true)
    expect(useShareStore.getState().role).toBeNull()

    // Edits are refused.
    const before = state.document
    state.transform('rename', (d) => ({ ...d, title: 'Defaced' }))
    expect(useToCStore.getState().document).toBe(before)

    render(<StageBar />)
    expect(screen.getByText(/Suggestion #12: Added link/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12',
    )
    expect(screen.getByRole('button', { name: /Make your own copy/ })).toBeInTheDocument()
  })

  it('shows a title as text, never as markup', async () => {
    serve({ pullBody: pull({ title: '<img src=x onerror=alert(1)>' }) })
    const onOpened = vi.fn()
    render(<OpeningSuggestion raw="12" onOpened={onOpened} />)
    await waitFor(() => expect(onOpened).toHaveBeenCalled())
    const { container } = render(<StageBar />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
  })

  it('opens the current map instead, with a notice and a clean address, when it is closed', async () => {
    serve({ pullBody: pull({ state: 'closed' }) })
    const onOpened = vi.fn()
    render(<OpeningSuggestion raw="12" onOpened={onOpened} />)
    await waitFor(() => expect(onOpened).toHaveBeenCalled())

    const state = useToCStore.getState()
    expect(serializeMapFile(state.document)).toBe(serializeMapFile(statusQuoMetacrisis()))
    expect(state.isReadOnly).toBe(false)
    expect(state.notice).toMatch(/Suggestion #12 was closed without being accepted/)
    expect(useSuggestionStore.getState().suggestion).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('opens the current map for a number that is not a number', async () => {
    serve()
    const onOpened = vi.fn()
    render(<OpeningSuggestion raw="banana" onOpened={onOpened} />)
    await waitFor(() => expect(onOpened).toHaveBeenCalled())
    expect(useToCStore.getState().notice).toMatch(/That suggestion was not found/)
    expect(useToCStore.getState().isReadOnly).toBe(false)
  })

  it('keeps the banner away once "Make your own copy" has made the document editable', async () => {
    serve()
    const onOpened = vi.fn()
    render(<OpeningSuggestion raw="12" onOpened={onOpened} />)
    await waitFor(() => expect(onOpened).toHaveBeenCalled())
    render(<StageBar />)
    expect(screen.getByText(/Suggestion #12/)).toBeInTheDocument()
    act(() => useToCStore.getState().load(useToCStore.getState().document))
    expect(screen.queryByText(/Suggestion #12/)).not.toBeInTheDocument()
  })
})
