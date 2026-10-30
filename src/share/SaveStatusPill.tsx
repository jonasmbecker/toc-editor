import { useShareStore, type SaveStatus } from './shareStore'

const TEXT: Record<Exclude<SaveStatus, 'local'>, string> = {
  saving: 'Saving',
  saved: 'Saved',
  quiet: 'Saved',
  failed: 'Not saved, retrying',
  conflict: 'Not saved: newer version',
}

/** The top-bar save state of a document on an edit link. A local document keeps the existing
 * "Unsaved local draft" pill instead; a view link shows neither. */
export function SaveStatusPill() {
  const status = useShareStore((state) => state.status)
  if (status === 'local') return null
  return (
    <span className={`toc-status toc-status--${status}`} role="status" aria-live="polite">
      <span className="toc-status__dot" aria-hidden="true" />
      {TEXT[status]}
    </span>
  )
}
