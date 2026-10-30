import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import App, { LEAVE_UNSAVED_PROMPT } from './App'
import { useToCStore } from './state/store'
import { clearDraft, loadDraft } from './files/draft'
import { renameSection } from './state/sections'

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
