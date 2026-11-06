import type { Draft } from './draft'

export interface DraftBarProps {
  draft: Draft
  onRestore: () => void
  onDiscard: () => void
}

/**
 * The start page's draft banner, for the editor. The site now opens straight into a theory, so
 * a draft kept in this browser (from an earlier visit, or from the map just left by the theory
 * switcher) would otherwise go unseen, and the first edit here would replace it: there is one
 * draft slot.
 */
export function DraftBar({ draft, onRestore, onDiscard }: DraftBarProps) {
  return (
    <div className="toc-bar toc-bar--conflict" role="status">
      <span>
        <strong>Unsaved local draft: {draft.document.title}.</strong>{' '}
        <span className="toc-bar__muted">Editing this map replaces it.</span>
      </span>
      <span className="toc-bar__spacer" />
      <button
        type="button"
        className="toc-topbar__btn toc-topbar__btn--primary"
        onClick={onRestore}
      >
        Restore draft
      </button>
      <button type="button" className="toc-topbar__btn" onClick={onDiscard}>
        Discard
      </button>
    </div>
  )
}
