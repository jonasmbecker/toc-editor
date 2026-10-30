import { useEffect } from 'react'
import { useToCStore } from '../state/store'
import { announce } from '../state/notice'

const UNDO_NOTICE_MS = 1200

function isMetaCombo(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey
}

function announceHistory(verb: string, label: string | null) {
  if (label) announce(`${verb}: ${label}`, UNDO_NOTICE_MS)
}

/**
 * Window-level Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) and Escape, active everywhere — including
 * while a textarea has focus, so the store's own (coalesced) history is the one undo stack
 * rather than competing with the browser's native textarea undo. Escape always clears
 * selection (node or connection); harmless when nothing is selected.
 */
export function useEditorShortcuts(isActive = true): void {
  useEffect(() => {
    if (!isActive) return
    function onKeyDown(event: KeyboardEvent) {
      // While an IME is composing (Japanese, Chinese, Korean, dead keys on many layouts) the
      // keys belong to the composition, not to us: Escape cancels the composition, and
      // `keyCode === 229` is the legacy signal older engines send instead of `isComposing`.
      if (event.isComposing || event.keyCode === 229) return
      const key = event.key.toLowerCase()
      if (isMetaCombo(event) && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        announceHistory('Undone', useToCStore.getState().undo())
        return
      }
      if (isMetaCombo(event) && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault()
        announceHistory('Redid', useToCStore.getState().redo())
        return
      }
      if (event.key === 'Escape') {
        useToCStore.getState().select(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isActive])
}
