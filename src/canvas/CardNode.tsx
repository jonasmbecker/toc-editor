import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { NodeProvenance } from '../model/schema'
import { nodeColorStyle } from './config'
import { needStripeStyle, useNeedColours, type NeedSegment } from './needLook'
import './card.css'

export interface CardNodeData extends Record<string, unknown> {
  title: string
  text: string
  color: string
  provenance?: NodeProvenance
  /** Display-only need mix, empty when colour coding is off or the card has no need behind it. */
  needMix?: NeedSegment[]
}

export type CardNodeType = Node<CardNodeData, 'card'>

/** Handle ids an edge routed around the columns anchors to: it leaves the source's LEFT edge
 * and enters the target's RIGHT edge, the reverse of the ordinary right-to-left flow. Not
 * connectable; the user draws from the ordinary handles. */
export const LOOP_OUT_HANDLE = 'loop-out'
export const LOOP_IN_HANDLE = 'loop-in'

/** Handle ids of the ordinary flow: out of the source's RIGHT edge, into the target's LEFT edge.
 * Every forward edge names them, because an unnamed edge anchors to whichever handle of its type
 * React Flow finds first, and on the source side that was the left-hand loop handle. */
export const FLOW_OUT_HANDLE = 'out'
export const FLOW_IN_HANDLE = 'in'

/** Handle ids of an edge between two cards stacked in the same column: it runs vertically,
 * bottom edge to top edge when the target sits lower, top edge to bottom edge when it sits
 * higher, instead of leaving the right edge and curling back behind the column. Not
 * connectable; the user draws from the ordinary handles. */
export const STACK_DOWN_OUT_HANDLE = 'down-out'
export const STACK_DOWN_IN_HANDLE = 'down-in'
export const STACK_UP_OUT_HANDLE = 'up-out'
export const STACK_UP_IN_HANDLE = 'up-in'

/** The four hidden handles a same-column edge anchors to, shared by cards and groups. */
export function StackHandles() {
  return (
    <>
      <Handle
        type="source"
        id={STACK_DOWN_OUT_HANDLE}
        position={Position.Bottom}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
      <Handle
        type="target"
        id={STACK_DOWN_IN_HANDLE}
        position={Position.Top}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
      <Handle
        type="source"
        id={STACK_UP_OUT_HANDLE}
        position={Position.Top}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
      <Handle
        type="target"
        id={STACK_UP_IN_HANDLE}
        position={Position.Bottom}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
    </>
  )
}

function ProvenanceBadge() {
  return (
    <span className="toc-card__badge" title="Interpreted, not read verbatim from the source">
      interpreted
    </span>
  )
}

export function CardNode({ data, selected }: NodeProps<CardNodeType>) {
  const needColours = useNeedColours()
  return (
    <div
      className={`toc-card${selected ? ' toc-card--selected' : ''}`}
      style={{ ...nodeColorStyle(data.color), ...needStripeStyle(data.needMix, needColours) }}
    >
      <Handle
        type="target"
        id={FLOW_IN_HANDLE}
        position={Position.Left}
        className="toc-card__handle"
      />
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
      <Handle
        type="source"
        id={FLOW_OUT_HANDLE}
        position={Position.Right}
        className="toc-card__handle"
        title="Drag to connect"
      />
      <Handle
        type="target"
        id={LOOP_IN_HANDLE}
        position={Position.Right}
        className="toc-card__loop-handle"
        isConnectable={false}
      />
      <StackHandles />
    </div>
  )
}
