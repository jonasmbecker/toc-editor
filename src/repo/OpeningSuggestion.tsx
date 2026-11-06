import { useEffect } from 'react'
import { useToCStore } from '../state/store'
import { announce } from '../state/notice'
import { useShareStore } from '../share/shareStore'
import { setPath } from '../share/route'
import { useOriginStore } from '../suggest/originStore'
import { theoryOriginOf } from './mapSource'
import { openTheory } from './openTheory'
import { explainFailure, loadSuggestion, SuggestionError } from './suggestion'
import { useSuggestionStore } from './suggestionStore'
import { useTheoryStore } from './theoryStore'
import '../home/home.css'

/** How long the "could not show it" notice stays up: long enough to read a sentence. */
const FAILURE_NOTICE_MS = 9000

export interface OpeningSuggestionProps {
  /** The raw `?suggestion=` value. */
  raw: string
  onOpened: () => void
}

/** What a `?suggestion=` address shows while the proposal loads. On success the proposed map
 * opens read-only; on any failure the current map opens editable with a notice saying why, so
 * a stale or mistyped link still lands somewhere useful: the default theory. */
export function OpeningSuggestion({ raw, onOpened }: OpeningSuggestionProps) {
  useEffect(() => {
    let isCancelled = false
    loadSuggestion(raw).then(
      ({ info, document }) => {
        if (isCancelled) return
        useShareStore.getState().reset()
        useToCStore.getState().load(document, { readOnly: true })
        useSuggestionStore.getState().setSuggestion(info)
        // A suggestion made against `map/` is about the default theory.
        useTheoryStore.getState().setCurrent(info.theory ?? useTheoryStore.getState().index.default)
        onOpened()
      },
      async (reason: unknown) => {
        const failure = reason instanceof SuggestionError ? reason.reason : 'unreachable'
        const fallback = await openTheory(null)
        if (isCancelled) return
        useShareStore.getState().reset()
        useSuggestionStore.getState().clear()
        useToCStore.getState().load(fallback.document)
        useOriginStore.getState().setOrigin(theoryOriginOf(fallback.document))
        useTheoryStore.getState().setCurrent(fallback.slug)
        // The address would reopen the same failure on every reload.
        setPath('/', { replace: true })
        announce(explainFailure(raw, failure), FAILURE_NOTICE_MS)
        onOpened()
      },
    )
    return () => {
      isCancelled = true
    }
  }, [raw, onOpened])

  return (
    <main className="toc-home">
      <header className="toc-home__head">
        <h1>ToC editor</h1>
        <p>Opening the suggestion.</p>
      </header>
      <p className="toc-home__opening" role="status">
        <span className="toc-spinner" aria-hidden="true" />
        Loading
      </p>
    </main>
  )
}
