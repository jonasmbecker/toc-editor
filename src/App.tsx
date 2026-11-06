import { useCallback, useEffect, useState } from 'react'
import type { ToCDocument } from './model/schema'
import { useToCStore } from './state/store'
import { Canvas } from './canvas/Canvas'
import { useEditorShortcuts } from './panels/useEditorShortcuts'
import { NoticeToast } from './panels/NoticeToast'
import { Home } from './home/Home'
import { DraftBar } from './files/DraftBar'
import { clearDraft, loadDraft, saveDraft, type Draft } from './files/draft'
import { useAutosave } from './files/useAutosave'
import { useBlockWindowDrop } from './files/useBlockWindowDrop'
import { OpeningSuggestion } from './repo/OpeningSuggestion'
import { OpeningTheory } from './repo/OpeningTheory'
import { suggestionParam } from './repo/suggestion'
import { useSuggestionStore } from './repo/suggestionStore'
import { theoryOriginOf } from './repo/mapSource'
import { refreshTheoryIndex } from './repo/openTheory'
import { theoryParam, theoryPath } from './repo/theoryIndex'
import { useTheoryStore } from './repo/theoryStore'
import { useOriginStore } from './suggest/originStore'
import { OpeningShared } from './share/OpeningShared'
import { parseShareRoute, setPath } from './share/route'
import { useServerSave } from './share/serverSave'
import { useShareStore } from './share/shareStore'

type View = 'home' | 'opening' | 'editor'

/** Back and forward move between links (a view link and the copy made from it, two theories,
 * or a link and the start page). Each address opens its own document, so the simplest correct
 * answer is to load the address again. */
function useReloadOnHistoryMove(): void {
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('popstate', reload)
    return () => window.removeEventListener('popstate', reload)
  }, [])
}

export const LEAVE_UNSAVED_PROMPT =
  'Your edits could not be saved in this browser (storage full or blocked). Leave anyway and lose them? Export JSON first to keep them.'

/** Where "Start your own" lives: its own address, so a reload stays on the start page instead
 * of opening the default theory. */
export const START_PATH = '/?start'

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

interface Address {
  route: ReturnType<typeof parseShareRoute>
  suggestion: string | null
  /** The raw `?theory=` value; null for the bare address, which opens the default theory. */
  theory: string | null
  isStart: boolean
}

/** What the address asks for. A share link wins over `?suggestion=`, which wins over
 * `?theory=`: the more specific the document, the more it says. Everything else is a theory:
 * the site opens straight into one, and the start page has its own address. */
function readAddress(): Address {
  const route = parseShareRoute(window.location.pathname)
  const search = window.location.search
  const suggestion = route ? null : suggestionParam(search)
  const isStart = !route && suggestion === null && new URLSearchParams(search).has('start')
  const theory = route || suggestion !== null || isStart ? null : theoryParam(search)
  return { route, suggestion, theory, isStart }
}

/** Nothing about the document being left (its share link, its suggestion) carries over to the
 * next one. */
function forgetOrigin(): void {
  useShareStore.getState().reset()
  useSuggestionStore.getState().clear()
  useOriginStore.getState().setOrigin(null)
  useTheoryStore.getState().setCurrent(null)
}

/** What an address shows while its document loads. */
function Opening({ address, onOpened, onHome }: OpeningProps) {
  if (address.route)
    return <OpeningShared route={address.route} onOpened={onOpened} onHome={onHome} />
  if (address.suggestion !== null)
    return <OpeningSuggestion raw={address.suggestion} onOpened={onOpened} />
  return <OpeningTheory raw={address.theory} onOpened={onOpened} />
}

interface OpeningProps {
  address: Address
  onOpened: () => void
  onHome: () => void
}

/** The address of theory `slug`, written to the address bar: the bare one for the default. */
function theoryAddress(slug: string): Address {
  const index = useTheoryStore.getState().index
  setPath(theoryPath(index, slug))
  const theory = slug === index.default ? null : slug
  return { route: null, suggestion: null, theory, isStart: false }
}

/** The start page lists the theories, and a suggestion names its theory in the switcher. A
 * share link names its own document and never calls GitHub until its start page opens. */
function useTheoryIndex(isNeeded: boolean): void {
  useEffect(() => {
    if (isNeeded) void refreshTheoryIndex()
  }, [isNeeded])
}

interface Navigation {
  view: View
  setView: (view: View) => void
  draft: Draft | null
  setDraft: (draft: Draft | null) => void
  setAddress: (address: Address) => void
}

/** Every way from one document to another: the start page's templates and files, the start
 * page itself, and a theory (from the switcher or the start page's theory cards). */
function useMoves({ view, setView, draft, setDraft, setAddress }: Navigation) {
  /** The one way the start page opens a document: load it, then show the editor. A share
   * link opens through `OpeningShared`, a theory through `OpeningTheory`. */
  function open(document: ToCDocument) {
    forgetOrigin()
    useToCStore.getState().load(document)
    useOriginStore.getState().setOrigin(theoryOriginOf(document))
    setView('editor')
  }

  function goHome() {
    const left = leaveEditor()
    if (!left) return
    forgetOrigin()
    setPath(START_PATH)
    setDraft(left.draft)
    setView('home')
  }

  /** A theory gets its own address, so Back returns to the last one and a reload stays put. */
  function showTheory(slug: string) {
    const left = view === 'editor' ? leaveEditor() : { draft }
    if (!left) return
    forgetOrigin()
    setDraft(left.draft)
    setAddress(theoryAddress(slug))
    setView('opening')
  }

  function discardDraft() {
    clearDraft()
    setDraft(null)
  }

  return { open, goHome, showTheory, discardDraft }
}

function App() {
  const [address, setAddress] = useState(readAddress)
  const [view, setView] = useState<View>(address.isStart ? 'home' : 'opening')
  const [draft, setDraft] = useState<Draft | null>(() => loadDraft())
  const isEditing = view === 'editor'
  const isShared = useShareStore((state) => state.role !== null)
  const onOpened = useCallback(() => setView('editor'), [])
  const moves = useMoves({ view, setView, draft, setDraft, setAddress })
  const { open, goHome, showTheory } = moves
  const isTheory = useTheoryStore((state) => state.current !== null)

  useBlockWindowDrop()
  useEditorShortcuts(isEditing)
  // A local document is kept in this browser; a shared one is kept on its link.
  useAutosave(isEditing && !isShared)
  useServerSave(isEditing)
  useReloadOnHistoryMove()
  useTheoryIndex(view === 'home' || address.suggestion !== null)

  if (view === 'opening') return <Opening address={address} onOpened={onOpened} onHome={goHome} />

  if (!isEditing) {
    return (
      <Home
        draft={draft}
        onOpen={open}
        onOpenTheory={showTheory}
        onRestoreDraft={() => draft && open(draft.document)}
        onDiscardDraft={moves.discardDraft}
      />
    )
  }

  return (
    <>
      <Canvas
        onHome={goHome}
        onSwitchTheory={showTheory}
        banner={
          draft && isTheory ? (
            <DraftBar
              draft={draft}
              onRestore={() => open(draft.document)}
              onDiscard={moves.discardDraft}
            />
          ) : null
        }
      />
      <NoticeToast />
    </>
  )
}

export default App
