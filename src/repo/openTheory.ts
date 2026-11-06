import type { ToCDocument } from '../model/schema'
import { statusQuoMetacrisis } from '../templates'
import { loadTheoryIndex, loadTheoryMap, type TheorySnapshot } from './mapSource'
import { BUNDLED_INDEX, findTheory } from './theoryIndex'
import { useTheoryStore } from './theoryStore'

export interface OpenedTheory {
  document: ToCDocument
  /** The theory that actually opened. */
  slug: string
  /** Said to the person when the address asked for something else; null when it did not. */
  notice: string | null
  /** True only when a fetched index lacks the asked-for theory: then the address is wrong and
   * may be rewritten. A theory that merely could not be read keeps its address for a reload. */
  isUnknown: boolean
}

/** Reads the index into the theory store, or puts the bundled one there when GitHub cannot give
 * it. Never rejects; null when the index could not be read. */
export async function refreshTheoryIndex(): Promise<TheorySnapshot | null> {
  try {
    const snapshot = await loadTheoryIndex()
    useTheoryStore.getState().setIndex(snapshot.index, false)
    return snapshot
  } catch {
    useTheoryStore.getState().setIndex(BUNDLED_INDEX, true)
    return null
  }
}

const COULD_NOT_LOAD = 'That theory could not be loaded right now. Showing'

/**
 * The theory an address asks for (`raw` from `?theory=`, null for the bare address). Never
 * rejects: an unknown slug opens the default theory with a notice, a theory GitHub cannot give
 * right now opens the default with a notice, and the default itself falls back to the bundled
 * copy without a word, as it always has. The index is read once, so a GitHub that hangs costs
 * one timeout before the bundled map opens, not one per step.
 */
export async function openTheory(raw: string | null): Promise<OpenedTheory> {
  const snapshot = await refreshTheoryIndex()
  const index = snapshot?.index ?? BUNDLED_INDEX
  const fallbackTitle = findTheory(index, index.default)?.title ?? 'the main theory'
  const asked = raw ?? index.default
  const opened = (document: ToCDocument, slug: string, notice: string | null = null) => ({
    document,
    slug,
    notice,
    isUnknown: false,
  })
  if (!snapshot) {
    const notice = asked === index.default ? null : `${COULD_NOT_LOAD} ${fallbackTitle}.`
    return opened(statusQuoMetacrisis(), index.default, notice)
  }
  if (!findTheory(index, asked)) {
    const fallback = await openDefault(snapshot)
    const notice = `There is no theory called "${asked}". Showing ${fallbackTitle}.`
    return { ...opened(fallback, index.default, notice), isUnknown: true }
  }
  try {
    return opened(await loadTheoryMap(asked, Date.now, snapshot), asked)
  } catch {
    const notice = asked === index.default ? null : `${COULD_NOT_LOAD} ${fallbackTitle}.`
    return opened(await openDefault(snapshot), index.default, notice)
  }
}

async function openDefault(snapshot: TheorySnapshot): Promise<ToCDocument> {
  try {
    return await loadTheoryMap(snapshot.index.default, Date.now, snapshot)
  } catch {
    return statusQuoMetacrisis()
  }
}
