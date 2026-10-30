import type { BlockFieldLabels } from '../model/labels'
import { BlockRow } from './BlockRow'
import { useBlockList } from './useBlockList'

export interface BlockListFieldProps {
  id: string
  labels: BlockFieldLabels
  /** The single string as stored in the file. */
  text: string | undefined
  onChange: (text: string) => void
}

/** A list of paragraphs editing one string; the list logic lives in `useBlockList`. */
export function BlockListField({ id, labels, text, onChange }: BlockListFieldProps) {
  const list = useBlockList(text, onChange)
  const isEmpty = list.blocks.length === 0

  return (
    <section className="toc-field">
      <div className="toc-field__head">
        <label
          className="toc-panel__label"
          htmlFor={isEmpty ? undefined : `${id}-${list.blocks[0].id}`}
        >
          {labels.label}
        </label>
        <span className="toc-field__hint">{labels.hint}</span>
      </div>
      {isEmpty ? null : (
        <div className="toc-blocks">
          {list.blocks.map((block, index) => (
            <BlockRow
              key={block.id}
              id={`${id}-${block.id}`}
              value={block.text}
              labels={labels}
              index={index}
              autoFocus={list.pendingFocus === block.id}
              onChange={(value) => list.update(block.id, value)}
              onBlur={list.settle}
              onRemove={() => list.remove(block.id)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        className={`toc-add${isEmpty ? ' toc-add--empty' : ''}`}
        onClick={list.add}
      >
        + {isEmpty ? labels.empty : 'Add block'}
      </button>
    </section>
  )
}
