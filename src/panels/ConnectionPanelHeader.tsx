import type { Connection } from '../model/schema'

export interface ConnectionPanelHeaderProps {
  connection: Connection
  onClose: () => void
  /** A view link adds "View only" after the eyebrow. */
  isReadOnly?: boolean
}

/** Eyebrow, close button, and a row of tags that only renders when any apply. */
export function ConnectionPanelHeader({
  connection,
  onClose,
  isReadOnly = false,
}: ConnectionPanelHeaderProps) {
  const tags = [
    connection.isFeedbackLoop ? (
      <span key="loop" className="toc-tag toc-tag--loop">
        Loop
      </span>
    ) : null,
    connection.provenance === 'interpreted' ? (
      <span key="interp" className="toc-tag" title="Interpreted from the photo, not read verbatim">
        Interpreted
      </span>
    ) : null,
    connection.provenance === 'verbatim-structure' ? (
      <span key="pair" className="toc-tag">
        Paired rows
      </span>
    ) : null,
  ].filter(Boolean)

  return (
    <header className="toc-panel__header toc-panel__header--wrap">
      <div className="toc-panel__eyebrow">
        Connection details
        {isReadOnly ? <span className="toc-panel__eyebrow-col">View only</span> : null}
      </div>
      <button type="button" className="toc-panel__close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {tags.length > 0 ? <div className="toc-tags">{tags}</div> : null}
    </header>
  )
}
