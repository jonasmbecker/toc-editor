import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App, { LEAVE_UNSAVED_PROMPT } from './App'
import { useToCStore } from './state/store'
import { clearDraft, loadDraft, saveDraft } from './files/draft'
import { renameSection } from './state/sections'
import { statusQuoMetacrisis } from './templates'
import { splitDocument } from './files/split'
import { useSuggestionStore } from './repo/suggestionStore'
import { useTheoryStore } from './repo/theoryStore'
import { useOriginStore } from './suggest/originStore'

/** React Flow needs a real layout engine; the editor itself is covered elsewhere, so here it
 * is only a stub carrying the two ways out the flows under test need: the start page (named
 * Home here) and a switch to another theory. */
vi.mock('./canvas/Canvas', () => ({
  Canvas: ({
    onHome,
    onSwitchTheory,
    banner,
  }: {
    onHome: () => void
    onSwitchTheory: (slug: string) => void
    banner?: ReactNode
  }) => (
    <>
      {banner}
      <button type="button" onClick={onHome}>
        Home
      </button>
      <button type="button" onClick={() => onSwitchTheory('schmachtenberger')}>
        Switch
      </button>
    </>
  ),
}))

const where = () => window.location.pathname + window.location.search

function openBlank() {
  fireEvent.click(screen.getByRole('button', { name: /Blank theory of change/ }))
}

function rename(title: string) {
  act(() => useToCStore.getState().transform('rename', (d) => renameSection(d, 0, title)))
}

describe('App: the start page and the editor', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDraft()
    window.history.replaceState(null, '', '/?start')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('leaving the editor shows the edit just made as the draft, and restore brings it back', () => {
    render(<App />)
    openBlank()
    rename('Means')
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByText(/Unsaved local draft: Untitled theory of change/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(useToCStore.getState().document.sections[0].title).toBe('Means')
    expect(useToCStore.getState().isDirty).toBe(false)
  })

  it('discard clears the stored draft', () => {
    render(<App />)
    openBlank()
    rename('Means')
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft()).toBeNull()
    expect(screen.queryByText(/Unsaved local draft/)).not.toBeInTheDocument()
  })

  it('only looking at a template leaves the draft alone', () => {
    render(<App />)
    openBlank()
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(loadDraft()).toBeNull()
  })

  it('asks before leaving when the draft cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    openBlank()
    rename('Means')
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(confirm).toHaveBeenCalledWith(LEAVE_UNSAVED_PROMPT)
    expect(screen.queryByRole('button', { name: /Blank theory of change/ })).not.toBeInTheDocument()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('button', { name: /Blank theory of change/ })).toBeInTheDocument()
  })
})

describe('App: a ?suggestion= address', () => {
  const SHA = 'b'.repeat(40)
  const { content, layout } = splitDocument(statusQuoMetacrisis())

  function serveSuggestion() {
    const fetchMock = vi.fn((url: string) => {
      const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
      if (url.endsWith('/pulls/12')) {
        const repo = { full_name: 'jonasmbecker/theory-of-metacrisis' }
        return reply({ state: 'open', title: 'A proposal', head: { sha: SHA, repo } })
      }
      if (url.endsWith('/pulls/12/files?per_page=100')) {
        return reply([{ filename: 'theories/jonas/content.json' }])
      }
      if (url.endsWith('content.json')) return reply({ ...content, title: 'As proposed' })
      return reply(layout)
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    localStorage.clear()
    clearDraft()
    useSuggestionStore.getState().clear()
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('opens the proposed map read-only, and the start page clears the address so a reload cannot reopen it', async () => {
    window.history.replaceState(null, '', '/?suggestion=12')
    serveSuggestion()
    render(<App />)
    const home = await screen.findByRole('button', { name: 'Home' })
    expect(useToCStore.getState().document.title).toBe('As proposed')
    expect(useToCStore.getState().isReadOnly).toBe(true)
    expect(useSuggestionStore.getState().suggestion).toMatchObject({ number: 12, theory: 'jonas' })
    expect(useTheoryStore.getState().current).toBe('jonas')

    fireEvent.click(home)
    expect(await screen.findByRole('button', { name: /Blank theory of change/ })).toBeVisible()
    expect(where()).toBe('/?start')
    expect(useSuggestionStore.getState().suggestion).toBeNull()
  })

  it('leaves a share link alone: its address names the document, no GitHub call is made', async () => {
    window.history.replaceState(null, '', `/d/${'E'.repeat(22)}?suggestion=12`)
    const fetchMock = vi.fn((url: string) => Promise.reject(new TypeError(`offline: ${url}`)))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    expect(await screen.findByText(/No connection/)).toBeVisible()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/api/diagrams/${'E'.repeat(22)}`])
  })
})

describe('App: the site opens in a theory', () => {
  const SHA = 'c'.repeat(40)
  const { content, layout } = splitDocument(statusQuoMetacrisis())
  const INDEX = {
    default: 'jonas',
    theories: [
      { slug: 'jonas', title: "Jonas Becker's theory", status: 'author', layout: 'stages' },
      {
        slug: 'schmachtenberger',
        title: 'Daniel Schmachtenberger (reconstructed)',
        status: 'reconstructed',
        layout: 'free',
      },
    ],
  }

  /** The theory repo at one commit: the index, and each theory's files titled by its slug. */
  function serveTheories() {
    const fetchMock = vi.fn((url: string) => {
      const reply = (body: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }))
      if (url.endsWith('/commits/main')) return Promise.resolve(new Response(SHA))
      if (url.endsWith(`${SHA}/theories/index.json`)) return reply(INDEX)
      const match = /theories\/([a-z]+)\/(content|layout)\.json$/.exec(url)
      if (!match) return reply('Not Found', 404)
      return reply(match[2] === 'content' ? { ...content, title: `Map of ${match[1]}` } : layout)
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const openedTitle = () => useToCStore.getState().document.title

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearDraft()
    useTheoryStore.getState().setCurrent(null)
  })
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('opens the default theory at the bare address, with no start page in between', async () => {
    window.history.replaceState(null, '', '/')
    serveTheories()
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    expect(openedTitle()).toBe('Map of jonas')
    expect(useTheoryStore.getState().current).toBe('jonas')
    expect(useOriginStore.getState().origin).toMatchObject({ sha: SHA, slug: 'jonas' })
    expect(screen.queryByRole('button', { name: /Blank theory of change/ })).toBeNull()
  })

  it('opens ?theory=<slug>, and the switcher moves between theories at their own addresses', async () => {
    window.history.replaceState(null, '', '/')
    serveTheories()
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    expect(openedTitle()).toBe('Map of jonas')

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() => expect(openedTitle()).toBe('Map of schmachtenberger'))
    expect(where()).toBe('/?theory=schmachtenberger')
    expect(useOriginStore.getState().origin?.slug).toBe('schmachtenberger')
    expect(useTheoryStore.getState().current).toBe('schmachtenberger')
  })

  it('opens the default theory with a notice for a slug the index does not list', async () => {
    window.history.replaceState(null, '', '/?theory=nobody')
    serveTheories()
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    expect(openedTitle()).toBe('Map of jonas')
    expect(useToCStore.getState().notice).toMatch(/no theory called "nobody"/)
    expect(where()).toBe('/')
  })

  it('keeps ?theory= in the address when GitHub fails, so a reload can still reach it', async () => {
    window.history.replaceState(null, '', '/?theory=schmachtenberger')
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    expect(openedTitle()).toBe(statusQuoMetacrisis().title)
    expect(useToCStore.getState().notice).toMatch(/could not be loaded right now/)
    expect(where()).toBe('/?theory=schmachtenberger')
  })

  it('shows a draft kept in this browser on the theory, and restores it', async () => {
    window.history.replaceState(null, '', '/')
    saveDraft({ ...statusQuoMetacrisis(), title: 'My earlier edits' })
    serveTheories()
    render(<App />)
    expect(await screen.findByText(/Unsaved local draft: My earlier edits/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Restore draft' }))
    expect(openedTitle()).toBe('My earlier edits')
    expect(screen.queryByText(/Unsaved local draft/)).toBeNull()
  })

  it('keeps an edited map as a draft when switching theory, and says so there', async () => {
    window.history.replaceState(null, '', '/')
    serveTheories()
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    rename('My change')
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() => expect(openedTitle()).toBe('Map of schmachtenberger'))
    expect(screen.getByText(/Unsaved local draft: Map of jonas/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft()).toBeNull()
  })

  it('opens the bundled map when GitHub cannot be reached at all', async () => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
    render(<App />)
    await screen.findByRole('button', { name: 'Home' })
    expect(openedTitle()).toBe(statusQuoMetacrisis().title)
    expect(useTheoryStore.getState().isIndexFallback).toBe(true)
    expect(useOriginStore.getState().origin).toBeNull()
  })
})
