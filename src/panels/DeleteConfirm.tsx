import type { KeyboardEvent } from 'react'

export interface DeleteConfirmProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/** Replaces a delete button in place. "Delete" is focused on mount, so Enter activates it
 * natively; Escape cancels without deleting, and stopping its propagation keeps the
 * window-level Escape handler (which clears the whole selection) from also firing, so backing
 * out of a delete never also closes the panel. No Enter handler on the wrapper: one would
 * fire before "Keep" could, deleting when the user meant to keep. */
export function DeleteConfirm({ message, onConfirm, onCancel }: DeleteConfirmProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="toc-panel__confirm" onKeyDown={handleKeyDown}>
      <p className="toc-panel__confirm-text">{message}</p>
      <div className="toc-panel__confirm-actions">
        <button
          type="button"
          className="toc-button toc-button--danger"
          onClick={onConfirm}
          autoFocus
        >
          Delete
        </button>
        <button type="button" className="toc-button toc-button--outline" onClick={onCancel}>
          Keep
        </button>
      </div>
    </div>
  )
}
