import { useState } from 'react'
import { useSuggestionStore } from '../repo/suggestionStore'
import { useTheoryStore } from '../repo/theoryStore'
import { findTheory } from '../repo/theoryIndex'
import { AlertIcon } from '../share/icons'
import './theory-switcher.css'

const DISMISS_KEY = 'toc-theory-note-dismissed:'

function isDismissed(slug: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY + slug) === '1'
  } catch {
    return false
  }
}

function dismiss(slug: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY + slug, '1')
  } catch {
    // Not kept: the note shows again on the next open, which is the safe side.
  }
}

/** Says once per theory and session, in a strip under the top bar, that a reconstructed theory
 * is not its subject's own: the badge alone is easy to overlook on a first visit. */
export function TheoryNoteBar() {
  const index = useTheoryStore((state) => state.index)
  const current = useTheoryStore((state) => state.current)
  const hasSuggestion = useSuggestionStore((state) => state.suggestion !== null)
  const [closed, setClosed] = useState<string | null>(null)
  const theory = current ? findTheory(index, current) : null
  if (!theory || theory.status !== 'reconstructed' || !theory.statusNote) return null
  // The suggestion banner owns the strip while a preview is open.
  if (hasSuggestion || closed === theory.slug || isDismissed(theory.slug)) return null
  return (
    <div className="toc-bar toc-bar--theory" role="note">
      <AlertIcon />
      <span>
        <strong>Reconstructed, not endorsed.</strong>{' '}
        <span className="toc-bar__muted">{theory.statusNote}</span>
      </span>
      <span className="toc-bar__spacer" />
      <button
        type="button"
        className="toc-bar__close"
        aria-label="Hide this note"
        onClick={() => {
          dismiss(theory.slug)
          setClosed(theory.slug)
        }}
      >
        ×
      </button>
    </div>
  )
}
