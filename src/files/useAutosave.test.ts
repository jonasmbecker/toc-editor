import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { DRAFT_FAILED_NOTICE, useAutosave } from './useAutosave'
import { clearDraft, loadDraft, saveDraft } from './draft'
import { useToCStore } from '../state/store'
import { blankTheoryOfChange } from '../templates'
import { addSectionAfter } from '../state/sections'

function edit() {
  useToCStore.getState().transform('add section', (d) => addSectionAfter(d, 0))
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    clearDraft()
    useToCStore.getState().load(blankTheoryOfChange())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not save an untouched document, nor a newly loaded one', () => {
    renderHook(() => useAutosave(true))
    useToCStore.getState().load(blankTheoryOfChange())
    vi.advanceTimersByTime(2000)
    expect(loadDraft()).toBeNull()
  })

  it('saves shortly after a burst of edits, once', () => {
    renderHook(() => useAutosave(true))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    edit()
    edit()
    expect(loadDraft()).toBeNull()
    vi.advanceTimersByTime(900)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(loadDraft()?.document.sections).toHaveLength(7)
  })

  it('flushes a pending save when the editor closes', () => {
    const hook = renderHook(({ isActive }) => useAutosave(isActive), {
      initialProps: { isActive: true },
    })
    edit()
    hook.rerender({ isActive: false })
    expect(loadDraft()?.document.sections).toHaveLength(6)
  })

  it('flushes a pending save when the page is hidden', () => {
    renderHook(() => useAutosave(true))
    edit()
    window.dispatchEvent(new Event('pagehide'))
    expect(loadDraft()?.document.sections).toHaveLength(6)
  })

  it('does not write again when the document was just saved by hand', () => {
    const hook = renderHook(({ isActive }) => useAutosave(isActive), {
      initialProps: { isActive: true },
    })
    edit()
    saveDraft(useToCStore.getState().document)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    hook.rerender({ isActive: false })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('tells the user once when storage refuses the draft', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    renderHook(() => useAutosave(true))
    edit()
    vi.advanceTimersByTime(900)
    expect(useToCStore.getState().notice).toBe(DRAFT_FAILED_NOTICE)
    useToCStore.getState().notify(null)
    edit()
    vi.advanceTimersByTime(900)
    expect(useToCStore.getState().notice).toBeNull()
  })

  it('does nothing while inactive', () => {
    renderHook(() => useAutosave(false))
    edit()
    vi.advanceTimersByTime(2000)
    expect(loadDraft()).toBeNull()
  })
})
