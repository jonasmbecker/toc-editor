import { useState } from 'react'
import { linkHostname, parseLinkUrl } from '../model/evidence'
import type { EvidenceLink } from '../model/schema'

/** A link is an anchor only when the url is http(s); anything else (a hand-edited file that
 * skipped the schema) renders as inert text. Label never replaces the host: both are shown. */
export function LinkChip({ link }: { link: EvidenceLink }) {
  const valid = parseLinkUrl(link.url).ok
  const host = linkHostname(link.url)
  const body = (
    <>
      <span aria-hidden="true">↗</span>
      <span className="toc-chip__label">{link.label || host || link.url}</span>
      {link.label && host ? <span className="toc-chip__host">{host}</span> : null}
    </>
  )
  if (!valid) return <span className="toc-chip toc-chip--inert">{body}</span>
  return (
    <a
      className="toc-chip"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={link.url}
    >
      {body}
    </a>
  )
}

export interface LinkEditorProps {
  initial?: EvidenceLink
  onSave: (link: EvidenceLink) => void
  onCancel: () => void
}

/** The inline URL + optional label row. Enter adds, Escape cancels; a non-http(s) address is
 * refused with the field error and nothing is added. */
export function LinkEditor({ initial, onSave, onCancel }: LinkEditorProps) {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [error, setError] = useState('')

  function submit() {
    const result = parseLinkUrl(url)
    if (!result.ok) return setError(result.error)
    onSave(label.trim() ? { url: result.url, label: label.trim() } : { url: result.url })
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="toc-linkedit" onKeyDown={onKeyDown}>
      <input
        autoFocus
        type="url"
        value={url}
        placeholder="https://…"
        aria-label="Link address"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setUrl(e.target.value)
          setError('')
        }}
      />
      <input
        value={label}
        placeholder="Label (optional)"
        aria-label="Link label"
        onChange={(e) => setLabel(e.target.value)}
      />
      <button type="button" className="toc-linkedit__add" onClick={submit}>
        {initial ? 'Save' : 'Add'}
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {error ? (
        <p className="toc-linkedit__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
