import { create } from 'zustand'
import { BUNDLED_INDEX, type TheoryIndex } from './theoryIndex'

/**
 * Which theories the switcher offers, and which one is open. Separate from the document store
 * like `shareStore` and `suggestionStore`: a theory is where a document came from, not part of
 * it. `current` is null for anything that is not a theory from the repo (a template, a file, a
 * share link), and then the top bar shows the plain title instead of the switcher.
 */
interface TheoryState {
  index: TheoryIndex
  /** True when the index could not be read and the bundled one stands in. */
  isIndexFallback: boolean
  current: string | null
  setIndex: (index: TheoryIndex, isFallback: boolean) => void
  setCurrent: (slug: string | null) => void
}

export const useTheoryStore = create<TheoryState>((set) => ({
  index: BUNDLED_INDEX,
  isIndexFallback: false,
  current: null,
  setIndex: (index, isIndexFallback) => set({ index, isIndexFallback }),
  setCurrent: (current) => set({ current }),
}))
