import { create } from 'zustand'
import type { SuggestionInfo } from './suggestion'

/**
 * The suggestion whose map is open for preview, if any. Separate from the document store like
 * `shareStore`: the preview is a read-only document (the store's own `isReadOnly`), and this
 * only says which pull request it came from, for the banner.
 */
interface SuggestionState {
  suggestion: SuggestionInfo | null
  setSuggestion: (suggestion: SuggestionInfo) => void
  clear: () => void
}

export const useSuggestionStore = create<SuggestionState>((set) => ({
  suggestion: null,
  setSuggestion: (suggestion) => set({ suggestion }),
  clear: () => set({ suggestion: null }),
}))
