import type { Node, NodeProps } from '@xyflow/react'

export interface RowBandData extends Record<string, unknown> {
  title: string
  question?: string
  /** The layer's colour: the band's tint and its label's accent. */
  color: string
  cards: number
  /** Links that leave or enter this row's cards. */
  links: number
  /** Links not drawn because another layer is chosen; 0 when nothing is hidden. */
  hidden: number
  active: boolean
}

export type RowBandNodeType = Node<RowBandData, 'rowBand'>

/** The background band behind one row of a matrix map, with its label in the left gutter. Not
 * selectable or draggable: it only says which layer the cards in front of it belong to. */
export function RowBandNode({ data }: NodeProps<RowBandNodeType>) {
  const counts = `${data.cards} card${data.cards === 1 ? '' : 's'}, ${data.links} link${data.links === 1 ? '' : 's'}`
  return (
    <div
      className={`toc-row-band${data.active ? ' toc-row-band--active' : ''}`}
      style={{ ['--toc-row-color' as string]: data.color }}
    >
      <div className="toc-row-band__label">
        <span className="toc-row-band__title">{data.title}</span>
        {data.question ? <span className="toc-row-band__question">{data.question}</span> : null}
        <span className="toc-row-band__count">{counts}</span>
        {data.hidden > 0 ? (
          <span className="toc-row-band__hidden">
            {data.hidden} link{data.hidden === 1 ? '' : 's'} hidden
          </span>
        ) : null}
      </div>
    </div>
  )
}
