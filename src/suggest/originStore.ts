import { create } from 'zustand'
import type { TheoryOrigin } from '../repo/mapSource'

/**
 * The theory-repo commit the open map was loaded from, and the map as loaded. Present only for
 * the default map opened from the repo: it is what switches the Suggest a change button on.
 * Separate from the document store like `shareStore` and `suggestionStore`.
 */
interface OriginState {
  origin: TheoryOrigin | null
  setOrigin: (origin: TheoryOrigin | null) => void
}

export const useOriginStore = create<OriginState>((set) => ({
  origin: null,
  setOrigin: (origin) => set({ origin }),
}))
