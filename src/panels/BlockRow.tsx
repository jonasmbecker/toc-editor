import { useLayoutEffect, useRef } from 'react'
import type { BlockFieldLabels } from '../model/labels'

export interface BlockRowProps {
  id: string
  value: string
  labels: BlockFieldLabels
  index: number
  /** Focus on mount (a block the user just added). */
  autoFocus: boolean
  onChange: (value: string) => void
  onBlur: () => void
  onRemove: () => void
  /** Show the 1-based number as a circle (mechanism blocks that evidence can cite). */
  numbered?: boolean
  highlighted?: boolean
  onHover?: (hovering: boolean) => void
}

/** One paragraph of a block list: an auto-growing borderless textarea with a left rule and a
 * remove button that shows on hover or focus. Height follows `value`, whichever way it changed
 * (typing, undo, a block split on blur). */
export function BlockRow(props: BlockRowProps) {
  const { id, value, labels, index, autoFocus, onChange, onBlur, onRemove } = props
  const { numbered, highlighted, onHover } = props
  const textarea = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <div
      className={`toc-block${numbered ? ' toc-block--numbered' : ''}${highlighted ? ' is-tinted' : ''}`}
    >
      {numbered ? (
        <span
          className="toc-block__number"
          onMouseEnter={() => onHover?.(true)}
          onMouseLeave={() => onHover?.(false)}
        >
          {index + 1}
        </span>
      ) : null}
      <textarea
        ref={textarea}
        id={id}
        rows={1}
        value={value}
        placeholder={labels.placeholder}
        aria-label={`${labels.label} block ${index + 1}`}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <button
        type="button"
        className="toc-block__remove"
        aria-label="Remove block"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}
