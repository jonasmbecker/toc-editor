import { useRef, useState } from 'react'
import { useToCStore } from '../state/store'
import { downloadDocument, type ExportMode } from '../files/export'
import { useShareStore } from '../share/shareStore'
import { ensureShared, makeOwnCopy } from '../share/actions'
import { SaveStatusPill } from '../share/SaveStatusPill'
import { ShareDialog, type SharePhase } from '../share/ShareDialog'
import { CopyIcon, LinkIcon } from '../share/icons'
import { useOriginStore } from '../suggest/originStore'
import { SuggestDialog } from '../suggest/SuggestDialog'
import '../share/share.css'

/** The Share button stores a not-yet-shared document when clicked (an event, so React's
 * development double effects cannot create two records), then shows the dialog; closing it
 * returns focus to the button. On a view link the button is "Make your own copy" instead. */
function ShareAction() {
  const role = useShareStore((state) => state.role)
  // A read-only document with no share role is a suggestion preview: sharing it would store a
  // read-only document as an edit link, so it offers the same copy button a view link does.
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const [phase, setPhase] = useState<SharePhase | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  function store() {
    setPhase(useShareStore.getState().editToken ? 'ready' : 'creating')
    ensureShared().then(
      () => setPhase('ready'),
      () => setPhase('error'),
    )
  }

  if (role === 'view' || isReadOnly) {
    return (
      <button
        type="button"
        className="toc-topbar__btn toc-topbar__btn--primary"
        onClick={() => void makeOwnCopy()}
      >
        <CopyIcon />
        Make your own copy
      </button>
    )
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="toc-topbar__btn toc-topbar__btn--primary"
        onClick={store}
      >
        <LinkIcon />
        Share
      </button>
      {phase ? (
        <ShareDialog
          phase={phase}
          onRetry={store}
          onClose={() => {
            setPhase(null)
            button.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}

/** Offered only on the default map opened from the theory repo, when it is editable and not a
 * share link: those are the maps a suggestion can be compared against and branched from. */
function SuggestAction() {
  const origin = useOriginStore((state) => state.origin)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const isShared = useShareStore((state) => state.role !== null)
  const [isOpen, setIsOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  if (!origin || isReadOnly || isShared) return null
  return (
    <>
      <button
        ref={button}
        type="button"
        className="toc-topbar__btn"
        onClick={() => setIsOpen(true)}
      >
        Suggest a change
      </button>
      {isOpen ? (
        <SuggestDialog
          origin={origin}
          onClose={() => {
            setIsOpen(false)
            button.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}

function exportNow(mode: ExportMode) {
  downloadDocument(useToCStore.getState().document, mode)
}

/** Save state, Home, the two exports and Share, shown on the right of the top bar. Reads the
 * document only when a button is pressed, so typing does not re-render the bar. */
export function TopBarActions({ onHome }: { onHome: () => void }) {
  const isLocalDirty = useToCStore((state) => state.isDirty)
  const isShared = useShareStore((state) => state.role !== null)

  return (
    <>
      <SaveStatusPill />
      {isLocalDirty && !isShared ? (
        <span className="toc-topbar__draft" title="Edits are kept in this browser only">
          Unsaved local draft
        </span>
      ) : null}
      <button type="button" className="toc-topbar__btn" onClick={onHome}>
        Home
      </button>
      <button type="button" className="toc-topbar__btn" onClick={() => exportNow('full')}>
        Export JSON
      </button>
      <button
        type="button"
        className="toc-topbar__btn"
        title="Opens on theoryofchangebuilder.com: extension fields removed"
        onClick={() => exportNow('compatible')}
      >
        Export for theoryofchangebuilder
      </button>
      <SuggestAction />
      <ShareAction />
    </>
  )
}
