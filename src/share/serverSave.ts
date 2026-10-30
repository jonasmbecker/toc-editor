import { useEffect } from 'react'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { AUTOSAVE_DELAY_MS } from '../files/useAutosave'
import { saveShared, type SaveOutcome } from './api'
import { useShareStore } from './shareStore'

export const SAVED_HOLD_MS = 2000
const RETRY_FIRST_MS = 2000
const RETRY_MAX_MS = 30000

const shareState = () => useShareStore.getState()

/**
 * Saves the document to its edit link shortly after each edit, one request at a time, sending
 * the revision it was loaded or last saved at. A 409 stops saving and raises the conflict bar
 * until the user reloads; any other failure retries with a doubling delay. Once stopped it
 * neither schedules nor touches the share store again, so a response that lands after the
 * user has moved on cannot write into whatever document is open by then.
 */
class ServerSaver {
  private timer: ReturnType<typeof setTimeout> | undefined
  private quietTimer: ReturnType<typeof setTimeout> | undefined
  private inFlight = false
  private isStopped = false
  private retryDelay = RETRY_FIRST_MS
  private readonly editToken: string

  constructor() {
    const { editToken, storedDocument } = shareState()
    this.editToken = editToken ?? ''
    // Edits typed while the create or reload request was out are not on the server yet.
    if (storedDocument !== useToCStore.getState().document) this.schedule(AUTOSAVE_DELAY_MS)
  }

  onDocumentChange(document: ToCDocument, isDirty: boolean): void {
    if (this.isStopped) return
    // A load (reload after a conflict, a fresh open) is what the server already holds.
    if (!isDirty) return this.markStored(document)
    if (document === shareState().storedDocument) return this.settleNothingPending()
    // While a retry is already waiting, typing must not move it: the retry sends whatever the
    // document is when it fires.
    if (shareState().status === 'failed' && this.timer !== undefined) return
    this.schedule(AUTOSAVE_DELAY_MS)
  }

  /** The page is going away or being hidden: send what is pending now. */
  flushNow(): void {
    clearTimeout(this.timer)
    void this.flush(true)
  }

  /** Leaving the editor: one last best-effort send of anything pending, then silence. */
  stop(): void {
    this.isStopped = true
    clearTimeout(this.timer)
    clearTimeout(this.quietTimer)
    const document = useToCStore.getState().document
    if (this.hasPending(document))
      void saveShared(this.editToken, document, shareState().revision, true).catch(() => {})
  }

  private hasPending(document: ToCDocument): boolean {
    return this.editToken !== '' && document !== shareState().storedDocument
  }

  private markStored(document: ToCDocument): void {
    const { revision } = shareState()
    shareState().setSaved(revision, document)
    shareState().setStatus('quiet')
  }

  private settleNothingPending(): void {
    clearTimeout(this.timer)
    if (shareState().status === 'failed') shareState().setStatus('quiet')
  }

  private schedule(delay: number): void {
    if (this.isStopped) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, delay)
  }

  private async flush(isLeaving = false): Promise<void> {
    const { revision, status } = shareState()
    const document = useToCStore.getState().document
    if (this.isStopped || this.inFlight || status === 'conflict' || !this.hasPending(document))
      return
    this.inFlight = true
    shareState().setStatus('saving')
    try {
      const outcome = await saveShared(this.editToken, document, revision, isLeaving)
      if (!this.isStopped) this.settle(outcome, document)
    } catch {
      if (!this.isStopped) this.retryLater()
    } finally {
      this.inFlight = false
    }
    // Edits made while a successful request was out go in the next one. After a failure the
    // retry timer already covers them; after a conflict nothing is sent until Reload.
    if (
      !this.isStopped &&
      shareState().status === 'saved' &&
      this.hasPending(useToCStore.getState().document)
    ) {
      this.schedule(AUTOSAVE_DELAY_MS)
    }
  }

  private settle(outcome: SaveOutcome, sent: ToCDocument): void {
    if (outcome.kind === 'conflict') return shareState().setStatus('conflict')
    this.retryDelay = RETRY_FIRST_MS
    shareState().setSaved(outcome.revision, sent)
    clearTimeout(this.quietTimer)
    this.quietTimer = setTimeout(() => {
      if (shareState().status === 'saved') shareState().setStatus('quiet')
    }, SAVED_HOLD_MS)
  }

  private retryLater(): void {
    shareState().setStatus('failed')
    this.schedule(this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS)
  }
}

/** Starts saving the open document to its edit link. Returns the stop function. */
export function startServerSave(): () => void {
  const saver = new ServerSaver()
  const unsubscribe = useToCStore.subscribe((state, previous) => {
    if (state.document !== previous.document) saver.onDocumentChange(state.document, state.isDirty)
  })
  // `pagehide` covers close, reload and navigation; `visibilitychange` catches a tab switch
  // on mobile, where the page may be discarded without `pagehide` ever firing.
  const onHidden = () => saver.flushNow()
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') saver.flushNow()
  }
  window.addEventListener('pagehide', onHidden)
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', onHidden)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    saver.stop()
  }
}

/** Runs `startServerSave` while the editor shows a document opened from (or shared to) an
 * edit link. */
export function useServerSave(isEditing: boolean): void {
  const editToken = useShareStore((state) => (state.role === 'edit' ? state.editToken : null))
  useEffect(() => {
    if (!isEditing || !editToken) return
    return startServerSave()
  }, [isEditing, editToken])
}
