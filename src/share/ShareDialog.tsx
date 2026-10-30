import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useToCStore } from '../state/store'
import { useShareStore } from './shareStore'
import { absoluteUrl, editPath, viewPath } from './route'
import { ShareLinkRow } from './ShareLinkRow'
import { CloseIcon, EyeIcon, PencilIcon } from './icons'
import '../home/home.css'
import './share-dialog.css'

export type SharePhase = 'creating' | 'ready' | 'error'

export interface ShareDialogProps {
  phase: SharePhase
  onRetry: () => void
  onClose: () => void
}

/** Undo and redo belong to the canvas; from inside the dialog they would silently change the
 * diagram behind the scrim. Escape closes the dialog without also clearing the selection. */
function isCanvasShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  return (event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')
}

/**
 * The Share dialog (design detail "share-ui-dialog"): the two links once the document is
 * stored, a short creating state before that, and a retry when storing failed. Storing is
 * started by the Share button (`TopBarActions`), not by this dialog rendering.
 */
export function ShareDialog({ phase, onRetry, onClose }: ShareDialogProps) {
  const title = useToCStore((state) => state.document.title)
  const editToken = useShareStore((state) => state.editToken)
  const viewToken = useShareStore((state) => state.viewToken)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'ready') dialog.current?.focus()
  }, [phase])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (isCanvasShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <div className="toc-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="toc-share"
        role="dialog"
        aria-modal="true"
        aria-labelledby="toc-share-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="toc-share__head">
          <div>
            <div className="toc-panel__eyebrow">Share</div>
            <h2 className="toc-share__title" id="toc-share-title">
              {title}
            </h2>
          </div>
          <button type="button" className="toc-share__close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {phase === 'creating' ? <Creating /> : null}
        {phase === 'error' ? <CreateFailed onRetry={onRetry} /> : null}
        {phase === 'ready' && editToken ? (
          <ShareLinks editToken={editToken} viewToken={viewToken} />
        ) : null}
      </div>
    </div>
  )
}

function Creating() {
  return (
    <div className="toc-share__creating" role="status">
      <span className="toc-spinner" aria-hidden="true" />
      Creating your links. The diagram is being stored so it can be opened from anywhere.
    </div>
  )
}

function CreateFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="toc-share__error" role="alert">
      <span>
        The links could not be created (no connection, or the service is busy). Your edits are still
        in this browser.
      </span>
      <button type="button" className="toc-topbar__btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

function ShareLinks({ editToken, viewToken }: { editToken: string; viewToken: string | null }) {
  return (
    <>
      <ShareLinkRow
        label="Edit link"
        audience="you and your team"
        icon={<PencilIcon />}
        url={absoluteUrl(editPath(editToken))}
        autoFocus
        who={
          <>
            Anyone with this link can change the diagram.{' '}
            <em>Treat it like a key: there is no login.</em>
          </>
        }
      />
      {viewToken ? (
        <ShareLinkRow
          label="View link"
          audience="anyone"
          icon={<EyeIcon />}
          url={absoluteUrl(viewPath(viewToken))}
          who={
            <>
              Anyone with this link can read every node and arrow and make their own copy.{' '}
              <em>Nothing they do changes yours.</em>
            </>
          }
        />
      ) : null}
      <p className="toc-share__foot">
        Links do not expire and cannot be revoked. If the edit link leaks, make a copy from the view
        link and share the new links instead.
      </p>
    </>
  )
}
