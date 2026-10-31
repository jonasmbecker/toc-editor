import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import App, { LEAVE_UNSAVED_PROMPT } from './App'
import { useToCStore } from './state/store'
import { clearDraft, loadDraft } from './files/draft'
import { renameSection } from './state/sections'
import { statusQuoMetacrisis } from './templates'
import { splitDocument } from './files/split'
import { useSuggestionStore } from './repo/suggestionStore'

/** React Flow needs a real layout engine; the editor itself is covered elsewhere, so here it
 * is only a stub carrying the Home button the flow under test needs. */
vi.mock('./canvas/Canvas', () => ({
  Canvas: ({ onHome }: { onHome: () => void }) => (
    <button type="button" onClick={onHome}>
      Home
    </button>
  ),
}))

function openBlank() {
  fireEvent.click(screen.getByRole('button', { name: /Blank theory of change/ }))
}

function rename(title: string) {
  act(() => useToCStore.getState().transform('rename', (d) => renameSection(d, 0, title)))
}

describe('App: home and editor', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDraft()
  })
  afterEach(() => vi.restoreAllMocks())

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

  it('opens the proposed map read-only, and Home clears the address so a reload cannot reopen it', async () => {
    window.history.replaceState(null, '', '/?suggestion=12')
    serveSuggestion()
    render(<App />)
    const home = await screen.findByRole('button', { name: 'Home' })
    expect(useToCStore.getState().document.title).toBe('As proposed')
    expect(useToCStore.getState().isReadOnly).toBe(true)
    expect(useSuggestionStore.getState().suggestion).toMatchObject({ number: 12 })

    fireEvent.click(home)
    expect(await screen.findByRole('button', { name: /Blank theory of change/ })).toBeVisible()
    expect(window.location.pathname + window.location.search).toBe('/')
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
