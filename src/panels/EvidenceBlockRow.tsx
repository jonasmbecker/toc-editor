import { useLayoutEffect, useRef, useState } from 'react'
import { parseLinkUrl } from '../model/evidence'
import type { EvidenceLink } from '../model/schema'
import { LinkChip, LinkEditor } from './LinkChip'
import type { EvidenceRow } from './useEvidenceBlocks'

export interface EvidenceBlockRowProps {
  id: string
  row: EvidenceRow
  /** First words of each mechanism block, for the tag tooltips; empty hides the tag row. */
  mechanisms: string[]
  placeholder: string
  highlighted: boolean
  autoFocus: boolean
  onText: (text: string) => void
  onToggle: (n: number) => void
  onLinks: (links: EvidenceLink[]) => void
  onMakeLink: () => void
  onHover: (supports: number[] | null) => void
  onBlur: () => void
  onRemove: () => void
}

type Editing = 'new' | number | null

/** One evidence block: text, a row of "supports mechanism N" toggles, link chips with
 * hover-revealed edit/remove, and the inline add-link row. */
export function EvidenceBlockRow(props: EvidenceBlockRowProps) {
  const { row, mechanisms, onLinks, onHover } = props
  const links = row.links ?? []
  const [editing, setEditing] = useState<Editing>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [row.text])

  const pastedUrl = row.text.trim() && links.length === 0 && parseLinkUrl(row.text).ok
  const save = (link: EvidenceLink) => {
    onLinks(
      typeof editing === 'number'
        ? links.map((l, i) => (i === editing ? link : l))
        : [...links, link],
    )
    setEditing(null)
  }

  return (
    <div
      className={`toc-evidence${props.highlighted ? ' is-tinted' : ''}`}
      onMouseEnter={() => onHover(row.supports ?? [])}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.supports ?? [])}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          onHover(null)
          props.onBlur()
        }
      }}
    >
      <div className="toc-block">
        <textarea
          ref={textarea}
          id={props.id}
          rows={1}
          value={row.text}
          placeholder={props.placeholder}
          aria-label="Evidence block"
          autoFocus={props.autoFocus}
          onChange={(e) => props.onText(e.target.value)}
        />
        <button
          type="button"
          className="toc-block__remove"
          aria-label="Remove block"
          onClick={props.onRemove}
        >
          ×
        </button>
      </div>
      {pastedUrl ? (
        <button type="button" className="toc-add toc-add--inline" onClick={props.onMakeLink}>
          Make this a link
        </button>
      ) : null}
      {mechanisms.length > 0 ? (
        <div className="toc-tags" role="group" aria-label="Supports mechanism">
          {mechanisms.map((words, i) => (
            <button
              key={i}
              type="button"
              className="toc-tag"
              aria-pressed={row.supports?.includes(i + 1) ?? false}
              title={words}
              onClick={() => props.onToggle(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}
      <div className="toc-chips">
        {links.map((link, i) =>
          editing === i ? null : (
            <span key={i} className="toc-chipwrap">
              <LinkChip link={link} />
              <button type="button" aria-label="Edit link" onClick={() => setEditing(i)}>
                ✎
              </button>
              <button
                type="button"
                aria-label="Remove link"
                onClick={() => onLinks(links.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ),
        )}
        {editing === null ? (
          <button
            type="button"
            className="toc-add toc-add--inline"
            onClick={() => setEditing('new')}
          >
            + Link
          </button>
        ) : null}
      </div>
      {editing !== null ? (
        <LinkEditor
          initial={typeof editing === 'number' ? links[editing] : undefined}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
