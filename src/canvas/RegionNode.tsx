import type { Node, NodeProps } from '@xyflow/react'
import './region.css'

export interface RegionNodeData extends Record<string, unknown> {
  title: string
  count: number
  /** The section's cards, so the region can be stretched to the lowest one once measured. */
  memberIds: string[]
}

export type RegionNodeType = Node<RegionNodeData, 'region'>

/** A titled section on a free canvas: a soft dashed area around its cards, worked out from where
 * the cards are on every render and never stored. Not selectable or draggable, and it takes no
 * clicks, so a double-click inside it still reaches the canvas. A card belongs to a region by
 * its section, not by where it sits. */
export function RegionNode({ data }: NodeProps<RegionNodeType>) {
  return (
    <div className="toc-region">
      <span className="toc-region__title" title={data.title}>
        {data.title}
      </span>
      <span className="toc-region__count" aria-label={`${data.count} cards`}>
        {data.count}
      </span>
    </div>
  )
}
