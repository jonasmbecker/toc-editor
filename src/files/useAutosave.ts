import { useEffect } from 'react'
import { useToCStore } from '../state/store'
import { announce } from '../state/notice'
import { isDraftCurrent, saveDraft } from './draft'

/** How long after the last edit a save goes out; the server save (`share/serverSave.ts`)
 * uses the same pause so the two never disagree about when an edit has "settled". */
export const AUTOSAVE_DELAY_MS = 800
const FAILURE_NOTICE_MS = 4000
export const DRAFT_FAILED_NOTICE =
  'The local draft could not be saved (storage full or blocked). Export JSON to keep your edits.'

/** Saves the store's document when it has unsaved edits. Reports a failure once per streak of
 * failures, so a full storage does not toast on every keystroke. */
function flushDraft(hasReportedFailure: { value: boolean }): void {
  const { document, isDirty } = useToCStore.getState()
  if (!isDirty || isDraftCurrent(document)) return
  if (saveDraft(document)) {
    hasReportedFailure.value = false
    return
  }
  if (!hasReportedFailure.value) announce(DRAFT_FAILED_NOTICE, FAILURE_NOTICE_MS)
  hasReportedFailure.value = true
}

/**
 * While the editor is open, writes the document to the local draft shortly after each edit,
 * and at once when the editor closes or the page is hidden (tab closed, reload, navigation),
 * so the last keystrokes before leaving are never lost. A freshly opened, untouched document
 * (isDirty false) is never saved, so just looking at a template does not replace the draft.
 */
export function useAutosave(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return
    const hasReportedFailure = { value: false }
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      clearTimeout(timer)
      flushDraft(hasReportedFailure)
    }
    const unsubscribe = useToCStore.subscribe((state, previous) => {
      if (state.document === previous.document || !state.isDirty) return
      clearTimeout(timer)
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS)
    })
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [isActive])
}
