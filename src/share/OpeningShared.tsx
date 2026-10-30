import { useEffect, useState } from 'react'
import { ShareError } from './api'
import { openRoute } from './actions'
import type { ShareRoute } from './route'
import '../home/home.css'

function messageFor(error: unknown): string {
  if (!(error instanceof ShareError))
    return 'The diagram could not be opened. Try again in a moment.'
  if (error.kind === 'network') return 'No connection. Check the network, then reload this page.'
  if (error.kind === 'unreadable') {
    return 'The stored diagram is damaged and cannot be shown. Ask the owner for a JSON export.'
  }
  if (error.status === 404)
    return 'This link does not open a diagram. Check that it was copied whole.'
  return 'The diagram could not be opened. Try again in a moment.'
}

export interface OpeningSharedProps {
  route: ShareRoute
  onOpened: () => void
  onHome: () => void
}

/** What a share link shows while its diagram loads, or why it could not. */
export function OpeningShared({ route, onOpened, onHome }: OpeningSharedProps) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    openRoute(route).then(
      () => !isCancelled && onOpened(),
      (reason: unknown) => !isCancelled && setError(messageFor(reason)),
    )
    return () => {
      isCancelled = true
    }
  }, [route, onOpened])

  return (
    <main className="toc-home">
      <header className="toc-home__head">
        <h1>ToC editor</h1>
        <p>{error ? 'This link could not be opened.' : 'Opening the shared diagram.'}</p>
      </header>
      {error ? (
        <section className="toc-home__errors" role="alert">
          <p>{error}</p>
          <button type="button" className="toc-home__btn" onClick={onHome}>
            Go to the start page
          </button>
        </section>
      ) : (
        <p className="toc-home__opening" role="status">
          <span className="toc-spinner" aria-hidden="true" />
          Loading
        </p>
      )}
    </main>
  )
}
