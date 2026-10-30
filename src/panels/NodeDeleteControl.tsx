import { useState } from 'react'
import { DeleteConfirm } from './DeleteConfirm'

export interface NodeDeleteControlProps {
  connectionCount: number
  onDelete: () => void
}

function message(connectionCount: number): string {
  return `Delete and remove its ${connectionCount} connection${connectionCount === 1 ? '' : 's'}?`
}

/** Owns its own confirm/cancel state — nothing outside needs to know whether the confirm row is
 * open, and the parent panel remounting on selection change (see `Canvas`'s `key`) already
 * resets it for free when the user moves to a different node. */
export function NodeDeleteControl({ connectionCount, onDelete }: NodeDeleteControlProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (isConfirming) {
    return (
      <DeleteConfirm
        message={message(connectionCount)}
        onConfirm={onDelete}
        onCancel={() => setIsConfirming(false)}
      />
    )
  }

  return (
    <button
      type="button"
      className="toc-button toc-button--danger toc-button--block"
      onClick={() => setIsConfirming(true)}
    >
      Delete node
    </button>
  )
}
