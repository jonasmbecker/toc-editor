import { useToCStore } from '../state/store'
import { downloadDocument } from '../files/export'
import { SuggestionBanner } from '../repo/SuggestionBanner'
import { useSuggestionStore } from '../repo/suggestionStore'
import { useShareStore } from './shareStore'
import { makeOwnCopy, reloadShared } from './actions'
import { AlertIcon, CopyIcon, EyeIcon } from './icons'

/**
 * The one strip above the canvas (design detail "share-ui-bars"): the view-only banner on a
 * view link, the conflict bar on an edit link after a stale save. Never both: a view link
 * cannot save, so it cannot conflict.
 */
export function StageBar() {
  const role = useShareStore((state) => state.role)
  const isConflict = useShareStore((state) => state.status === 'conflict')
  const suggestion = useSuggestionStore((state) => state.suggestion)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  if (role === 'view') return <ViewBanner />
  // Only while the preview itself is open: "Make your own copy" loads an editable document.
  if (suggestion && isReadOnly) return <SuggestionBanner suggestion={suggestion} />
  if (isConflict) return <ConflictBar />
  return null
}

function ViewBanner() {
  return (
    <div className="toc-bar toc-bar--view" role="status">
      <EyeIcon />
      <span>
        <strong>View only.</strong>{' '}
        <span className="toc-bar__muted">
          Click any node or arrow to read it. Reload to see the owner&apos;s latest changes.
        </span>
      </span>
      <span className="toc-bar__spacer" />
      <button type="button" className="toc-topbar__btn" onClick={() => void makeOwnCopy()}>
        <CopyIcon />
        Make your own copy
      </button>
    </div>
  )
}

function ConflictBar() {
  return (
    <div className="toc-bar toc-bar--conflict" role="alert">
      <AlertIcon />
      <span>
        <strong>Someone saved a newer version.</strong> Your last change was not saved. Reload to
        get theirs, or export yours first to keep it.
      </span>
      <span className="toc-bar__spacer" />
      <button
        type="button"
        className="toc-topbar__btn"
        onClick={() => downloadDocument(useToCStore.getState().document, 'full')}
      >
        Export my version
      </button>
      <button
        type="button"
        className="toc-topbar__btn toc-topbar__btn--primary"
        onClick={() => void reloadShared()}
      >
        Reload
      </button>
    </div>
  )
}
