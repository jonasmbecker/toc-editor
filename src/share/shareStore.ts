import { create } from 'zustand'
import type { ToCDocument } from '../model/schema'
import type { ShareRole } from './api'

/**
 * Where the open document lives on the server, if anywhere, and how its saving is going.
 * Separate from the document store on purpose: undo, export and the draft never need to know
 * about links, and loading a document never resets how it is shared.
 *
 * `status` drives the top-bar pill (design detail "share-ui-dialog"):
 * local (nothing to save to a server) | saving | saved (green for 2s) | quiet | failed
 * (retrying) | conflict.
 */

export type SaveStatus = 'local' | 'saving' | 'saved' | 'quiet' | 'failed' | 'conflict'

interface ShareState {
  role: ShareRole | null
  editToken: string | null
  viewToken: string | null
  /** The revision the server holds for what this tab last loaded or saved. */
  revision: number
  /** The document object the server holds, by reference, so the saver knows whether edits
   * made while a create or reload was in flight still have to go out. */
  storedDocument: ToCDocument | null
  status: SaveStatus
}

export interface SharedInfo {
  role: ShareRole
  editToken?: string | null
  viewToken?: string | null
  revision: number
  storedDocument: ToCDocument
}

interface ShareActions {
  setShared: (share: SharedInfo) => void
  setSaved: (revision: number, storedDocument: ToCDocument) => void
  setStatus: (status: SaveStatus) => void
  reset: () => void
}

const LOCAL: ShareState = {
  role: null,
  editToken: null,
  viewToken: null,
  revision: 0,
  storedDocument: null,
  status: 'local',
}

export const useShareStore = create<ShareState & ShareActions>((set) => ({
  ...LOCAL,
  setShared({ role, editToken = null, viewToken = null, revision, storedDocument }) {
    set({
      role,
      editToken,
      viewToken,
      revision,
      storedDocument,
      status: role === 'edit' ? 'quiet' : 'local',
    })
  },
  setSaved(revision, storedDocument) {
    set({ revision, storedDocument, status: 'saved' })
  },
  setStatus(status) {
    set({ status })
  },
  reset() {
    set(LOCAL)
  },
}))
