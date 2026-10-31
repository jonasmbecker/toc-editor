import { makeOwnCopy } from '../share/actions'
import { CopyIcon, EyeIcon } from '../share/icons'
import type { SuggestionInfo } from './suggestion'

/** The strip above a previewed suggestion, in the same place and look as the view-only banner:
 * which suggestion this is, a way to read it on GitHub, and a way to start from it. */
export function SuggestionBanner({ suggestion }: { suggestion: SuggestionInfo }) {
  return (
    <div className="toc-bar toc-bar--view" role="status">
      <EyeIcon />
      <span>
        <strong>
          Suggestion #{suggestion.number}: {suggestion.title}
        </strong>{' '}
        <span className="toc-bar__muted">
          This is the map as proposed, for reading only. It is not part of the theory unless it is
          accepted.
        </span>
      </span>
      <span className="toc-bar__spacer" />
      <a
        className="toc-topbar__btn"
        href={suggestion.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on GitHub
      </a>
      <button type="button" className="toc-topbar__btn" onClick={() => void makeOwnCopy()}>
        <CopyIcon />
        Make your own copy
      </button>
    </div>
  )
}
