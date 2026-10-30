import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { NodeProvenance } from '../model/schema'
import { nodeColorStyle } from './config'

export interface CardNodeData extends Record<string, unknown> {
  title: string
  text: string
  color: string
  provenance?: NodeProvenance
}

export type CardNodeType = Node<CardNodeData, 'card'>

/** Handle ids an edge routed around the columns anchors to: it leaves the source's LEFT edge
 * and enters the target's RIGHT edge, the reverse of the ordinary right-to-left flow. Not
 * connectable; the user draws from the ordinary handles. */
export const LOOP_OUT_HANDLE = 'loop-out'
export const LOOP_IN_HANDLE = 'loop-in'

function ProvenanceBadge() {
  return (
    <span className="toc-card__badge" title="Interpreted, not read verbatim from the source">
      interpreted
    </span>
  )
}

/** The id-less handles come first on purpose: React Flow anchors an edge with no
 * `sourceHandle`/`targetHandle` to the first handle of that type it finds, so the ordinary
 * right-to-left edges land on these and only edges that name a loop handle use the others. */
export function CardNode({ data, selected }: NodeProps<CardNodeType>) {
  return (
    <div
      className={`toc-card${selected ? ' toc-card--selected' : ''}`}
      style={nodeColorStyle(data.color)}
    >
      <Handle type="target" position={Position.Left} className="toc-card__handle" />
      <Handle
        type="source"
        id={LOOP_OUT_HANDLE}
        position={Position.Left}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
      <div className="toc-card__title">{data.title}</div>
      {data.text ? <div className="toc-card__text">{data.text}</div> : null}
      {data.provenance === 'interpreted' ? <ProvenanceBadge /> : null}
      <Handle type="source" position={Position.Right} className="toc-card__handle" />
      <Handle
        type="target"
        id={LOOP_IN_HANDLE}
        position={Position.Right}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
    </div>
  )
}
