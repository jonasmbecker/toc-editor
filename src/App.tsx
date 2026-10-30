import { useCallback, useEffect, useState } from 'react'
import type { ToCDocument } from './model/schema'
import { useToCStore } from './state/store'
import { Canvas } from './canvas/Canvas'
import { useEditorShortcuts } from './panels/useEditorShortcuts'
import { NoticeToast } from './panels/NoticeToast'
import { Home } from './home/Home'
import { clearDraft, loadDraft, saveDraft, type Draft } from './files/draft'
import { useAutosave } from './files/useAutosave'
import { useBlockWindowDrop } from './files/useBlockWindowDrop'
import { OpeningShared } from './share/OpeningShared'
import { parseShareRoute, setPath } from './share/route'
import { useServerSave } from './share/serverSave'
import { useShareStore } from './share/shareStore'

type View = 'home' | 'opening' | 'editor'

/** Back and forward move between links (a view link and the copy made from it, or a link and
 * the start page). Each address opens its own document, so the simplest correct answer is to
 * load the address again. */
function useReloadOnHistoryMove(): void {
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('popstate', reload)
    return () => window.removeEventListener('popstate', reload)
  }, [])
}

export const LEAVE_UNSAVED_PROMPT =
  'Your edits could not be saved in this browser (storage full or blocked). Leave anyway and lose them? Export JSON first to keep them.'

/** Saves the document for the home screen's banner. Returns the draft to show there, or null
 * when the edits could not be saved and the user chose to stay. A shared document is never
 * drafted: its edits go to its link, and a draft of it would reopen as a detached local copy. */
function leaveEditor(): { draft: Draft | null } | null {
  const { isDirty, document } = useToCStore.getState()
  const isShared = useShareStore.getState().role !== null
  if (!isDirty || isShared) return { draft: loadDraft() }
  const saved = saveDraft(document)
  if (saved) return { draft: saved }
  return window.confirm(LEAVE_UNSAVED_PROMPT) ? { draft: loadDraft() } : null
}

function App() {
  const [route] = useState(() => parseShareRoute(window.location.pathname))
  const [view, setView] = useState<View>(route ? 'opening' : 'home')
  const [draft, setDraft] = useState<Draft | null>(() => loadDraft())
  const isEditing = view === 'editor'
  const isShared = useShareStore((state) => state.role !== null)
  const onOpened = useCallback(() => setView('editor'), [])

  useBlockWindowDrop()
  useEditorShortcuts(isEditing)
  // A local document is kept in this browser; a shared one is kept on its link.
  useAutosave(isEditing && !isShared)
  useServerSave(isEditing)
  useReloadOnHistoryMove()

  /** The one way the home screen opens a document: load it, then show the editor. A share
   * link opens through `OpeningShared` instead. */
  function open(document: ToCDocument) {
    useShareStore.getState().reset()
    useToCStore.getState().load(document)
    setView('editor')
  }

  function goHome() {
    const left = leaveEditor()
    if (!left) return
    useShareStore.getState().reset()
    setPath('/')
    setDraft(left.draft)
    setView('home')
  }

  if (view === 'opening' && route) {
    return <OpeningShared route={route} onOpened={onOpened} onHome={goHome} />
  }

  if (!isEditing) {
    return (
      <Home
        draft={draft}
        onOpen={open}
        onRestoreDraft={() => draft && open(draft.document)}
        onDiscardDraft={() => {
          clearDraft()
          setDraft(null)
        }}
      />
    )
  }

  return (
    <>
      <Canvas onHome={goHome} />
      <NoticeToast />
    </>
  )
}

export default App
