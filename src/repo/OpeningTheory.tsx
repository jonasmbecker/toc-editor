import { useEffect } from 'react'
import { useToCStore } from '../state/store'
import { announce } from '../state/notice'
import { setPath } from '../share/route'
import { useOriginStore } from '../suggest/originStore'
import { theoryOriginOf } from './mapSource'
import { openTheory } from './openTheory'
import { theoryPath } from './theoryIndex'
import { useTheoryStore } from './theoryStore'
import '../home/home.css'

/** Long enough to read a sentence, as for a suggestion that cannot be shown. */
const NOTICE_MS = 9000

export interface OpeningTheoryProps {
  /** The raw `?theory=` value, or null for the bare address. */
  raw: string | null
  onOpened: () => void
}

/** What the bare address and `?theory=<slug>` show while the theory loads. It always ends in
 * the editor: a theory that cannot be read gives way to the default one (see `openTheory`). */
export function OpeningTheory({ raw, onOpened }: OpeningTheoryProps) {
  useEffect(() => {
    let isCancelled = false
    void openTheory(raw).then(({ document, slug, notice, isUnknown }) => {
      if (isCancelled) return
      useToCStore.getState().load(document)
      useOriginStore.getState().setOrigin(theoryOriginOf(document))
      useTheoryStore.getState().setCurrent(slug)
      // An address naming a theory that does not exist would fail the same way on every reload;
      // one that GitHub could not serve just now is kept, so a reload can still reach it.
      if (isUnknown) setPath(theoryPath(useTheoryStore.getState().index, slug), { replace: true })
      if (notice) announce(notice, NOTICE_MS)
      onOpened()
    })
    return () => {
      isCancelled = true
    }
  }, [raw, onOpened])

  return (
    <main className="toc-home">
      <p className="toc-home__opening" role="status">
        <span className="toc-spinner" aria-hidden="true" />
        Opening the theory
      </p>
    </main>
  )
}
