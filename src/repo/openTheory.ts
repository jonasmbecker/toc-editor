import type { ToCDocument } from '../model/schema'
import { statusQuoMetacrisis } from '../templates'
import { loadTheoryIndex, loadTheoryMap } from './mapSource'
import { BUNDLED_INDEX, findTheory, type TheoryIndex } from './theoryIndex'
import { useTheoryStore } from './theoryStore'

export interface OpenedTheory {
  document: ToCDocument
  /** The theory that actually opened. */
  slug: string
  /** Said to the person when the address asked for something else; null when it did not. */
  notice: string | null
}

/** Reads the index into the theory store, or puts the bundled one there when GitHub cannot give
 * it. Never rejects. */
export async function refreshTheoryIndex(): Promise<TheoryIndex> {
  try {
    const { index } = await loadTheoryIndex()
    useTheoryStore.getState().setIndex(index, false)
    return index
  } catch {
    useTheoryStore.getState().setIndex(BUNDLED_INDEX, true)
    return BUNDLED_INDEX
  }
}

/**
 * The theory an address asks for (`raw` from `?theory=`, null for the bare address). Never
 * rejects: an unknown slug opens the default theory with a notice, a theory GitHub cannot give
 * right now opens the default with a notice, and the default itself falls back to the bundled
 * copy without a word, as it always has. Opening a theory must not depend on GitHub.
 */
export async function openTheory(raw: string | null): Promise<OpenedTheory> {
  const index = await refreshTheoryIndex()
  const fallback = findTheory(index, index.default)
  const fallbackTitle = fallback?.title ?? 'the main theory'
  const asked = raw ?? index.default
  if (!findTheory(index, asked)) {
    return {
      ...(await openDefault(index)),
      notice: `There is no theory called "${asked}". Showing ${fallbackTitle}.`,
    }
  }
  try {
    return { document: await loadTheoryMap(asked), slug: asked, notice: null }
  } catch {
    if (asked === index.default) return { ...(await openDefault(index)), notice: null }
    return {
      ...(await openDefault(index)),
      notice: `That theory could not be loaded right now. Showing ${fallbackTitle}.`,
    }
  }
}

async function openDefault(index: TheoryIndex): Promise<{ document: ToCDocument; slug: string }> {
  try {
    return { document: await loadTheoryMap(index.default), slug: index.default }
  } catch {
    return { document: statusQuoMetacrisis(), slug: index.default }
  }
}
