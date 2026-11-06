import type { Node, NodeProps } from '@xyflow/react'
import { SECTION_HEADER_HEIGHT } from '../layout/columns'
import './band.css'

export interface BandNodeData extends Record<string, unknown> {
  title: string
  count: number
  /** The band's cards, so the strip can be stretched to the lowest one once measured. */
  memberIds: string[]
}

export type BandNodeType = Node<BandNodeData, 'band'>

/** A band section: a full-width strip under the columns, headed by the same dark bar as a column
 * section. Not selectable or draggable; its cards are ordinary cards in front of it. */
export function BandNode({ data }: NodeProps<BandNodeType>) {
  return (
    <div className="toc-band-strip">
      <div
        className="toc-section-header toc-section-header--band"
        style={{ height: SECTION_HEADER_HEIGHT }}
        title={data.title}
      >
        <span className="toc-section-header__title">{data.title}</span>
        <span className="toc-section-header__count" aria-label={`${data.count} cards`}>
          {data.count}
        </span>
      </div>
      {data.count === 0 ? <p className="toc-band-strip__empty">No cards yet</p> : null}
    </div>
  )
}
