import { create } from 'zustand'
import type { ToCDocument } from '../model/schema'
import type { TheoryOrigin } from '../repo/mapSource'

/**
 * The theory-repo commit the open map was loaded from, and the map as loaded. Present only for
 * the default map opened from the repo: it is what switches the Suggest a change button on.
 * Separate from the document store like `shareStore` and `suggestionStore`.
 *
 * `sent` is the last suggestion that went through: the exact document object sent and its link.
 * While the map is still that object, the dialog shows the link instead of offering to send
 * the same edits twice; it is kept here, not in the dialog, so closing the dialog mid-send
 * still keeps the link.
 */
interface OriginState {
  origin: TheoryOrigin | null
  sent: { document: ToCDocument; url: string } | null
  setOrigin: (origin: TheoryOrigin | null) => void
  markSent: (document: ToCDocument, url: string) => void
}

export const useOriginStore = create<OriginState>((set) => ({
  origin: null,
  sent: null,
  setOrigin: (origin) => set({ origin, sent: null }),
  markSent: (document, url) => set({ sent: { document, url } }),
}))
