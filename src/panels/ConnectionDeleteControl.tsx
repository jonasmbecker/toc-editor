import { useEffect, useState } from 'react'
import { DeleteConfirm } from './DeleteConfirm'

export interface ConnectionDeleteControlProps {
  fromTitle: string
  toTitle: string
  onDelete: () => void
}

/** Anything where Delete or Backspace means "edit text", not "delete the connection". */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input:not([type="range"]), textarea, select, [contenteditable]') !== null
  )
}

/** "Delete connection" and its in-place confirm row. Delete or Backspace while the edge is
 * selected and no field has focus opens the same row rather than deleting silently. */
export function ConnectionDeleteControl({
  fromTitle,
  toTitle,
  onDelete,
}: ConnectionDeleteControlProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      setIsConfirming(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (isConfirming) {
    return (
      <DeleteConfirm
        message={`Remove the link from "${fromTitle}" to "${toTitle}"?`}
        onConfirm={onDelete}
        onCancel={() => setIsConfirming(false)}
      />
    )
  }

  return (
    <button
      type="button"
      className="toc-button toc-button--danger-outline toc-button--block"
      onClick={() => setIsConfirming(true)}
    >
      Delete connection
    </button>
  )
}
