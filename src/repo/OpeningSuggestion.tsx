import { useEffect } from 'react'
import { useToCStore } from '../state/store'
import { announce } from '../state/notice'
import { useShareStore } from '../share/shareStore'
import { setPath } from '../share/route'
import { loadDefaultMap } from '../templates'
import { explainFailure, loadSuggestion, SuggestionError } from './suggestion'
import { useSuggestionStore } from './suggestionStore'
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
 * a stale or mistyped link still lands somewhere useful. */
export function OpeningSuggestion({ raw, onOpened }: OpeningSuggestionProps) {
  useEffect(() => {
    let isCancelled = false
    loadSuggestion(raw).then(
      ({ info, document }) => {
        if (isCancelled) return
        useShareStore.getState().reset()
        useToCStore.getState().load(document, { readOnly: true })
        useSuggestionStore.getState().setSuggestion(info)
        onOpened()
      },
      async (reason: unknown) => {
        const failure = reason instanceof SuggestionError ? reason.reason : 'unreachable'
        const fallback = await loadDefaultMap()
        if (isCancelled) return
        useShareStore.getState().reset()
        useSuggestionStore.getState().clear()
        useToCStore.getState().load(fallback)
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
