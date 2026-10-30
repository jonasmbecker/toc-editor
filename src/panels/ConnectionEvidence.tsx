import type { BlockFieldLabels } from '../model/labels'
import type { Connection } from '../model/schema'
import type { ConnectionPatch } from '../state/connections'
import { EvidenceBlockRow } from './EvidenceBlockRow'
import { useEvidenceBlocks } from './useEvidenceBlocks'

export interface ConnectionEvidenceProps {
  connection: Pick<Connection, 'evidence' | 'evidenceBlocks'>
  labels: BlockFieldLabels
  /** First words of each mechanism block, in order. */
  mechanisms: string[]
  /** Mechanism number being hovered (1-based), tints the evidence that cites it. */
  hoveredMechanism: number | null
  onHoverSupports: (supports: number[] | null) => void
  onChange: (patch: ConnectionPatch) => void
}

const HINT = 'Tag evidence with the mechanism it supports, or leave it untagged for the whole link.'

/** The Evidence field of the Connection Details panel: blocks that can cite mechanism
 * numbers and carry links. Every edit rewrites the plain `evidence` string. */
export function ConnectionEvidence(props: ConnectionEvidenceProps) {
  const { labels, mechanisms, hoveredMechanism } = props
  const list = useEvidenceBlocks(props.connection, props.onChange)
  const isEmpty = list.rows.length === 0

  return (
    <section className="toc-field">
      <div className="toc-field__head">
        <span className="toc-panel__label">{labels.label}</span>
        <span className="toc-field__hint">{labels.hint}</span>
      </div>
      {isEmpty ? null : (
        <div className="toc-blocks">
          {list.rows.map((row) => (
            <EvidenceBlockRow
              key={row.rid}
              id={`conn-evidence-${row.rid}`}
              row={row}
              mechanisms={mechanisms}
              placeholder={labels.placeholder}
              highlighted={
                hoveredMechanism !== null && (row.supports ?? []).includes(hoveredMechanism)
              }
              autoFocus={list.pendingFocus === row.rid}
              onText={(text) => list.setText(row.rid, text)}
              onToggle={(n) => list.toggleSupport(row.rid, n)}
              onLinks={(links) => list.setLinks(row.rid, links)}
              onMakeLink={() => list.makeLink(row.rid)}
              onHover={props.onHoverSupports}
              onBlur={list.settle}
              onRemove={() => list.remove(row.rid)}
            />
          ))}
        </div>
      )}
      {mechanisms.length > 0 && !isEmpty ? <p className="toc-field__note">{HINT}</p> : null}
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
