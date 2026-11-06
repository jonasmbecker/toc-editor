import { statusLabel, type TheoryEntry } from '../repo/theoryIndex'
import './theory-badge.css'

/**
 * A theory's status as a pill: neutral for the author's own, amber for a reconstruction, so the
 * two can never be mistaken for each other. Used by the switcher and the start page. On narrow
 * screens the pill shrinks to a mark whose shape (round or square) carries the status too, and
 * the words stay for screen readers.
 */
export function StatusBadge({ theory }: { theory: TheoryEntry }) {
  const label = statusLabel(theory)
  if (!label) return null
  const isReconstructed = theory.status === 'reconstructed'
  return (
    <span
      className={`toc-topbar__pill toc-theory-badge${isReconstructed ? ' toc-theory-badge--reconstructed' : ''}`}
      title={theory.statusNote ? `${label}. ${theory.statusNote}` : label}
    >
      <span className="toc-theory-badge__text">{label}</span>
    </span>
  )
}
