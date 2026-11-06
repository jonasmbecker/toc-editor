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
  /** The card sits in a band under the columns. Column routing leaves it out, so loops that run
   * below the map pass between the columns and the band. */
  inBand?: boolean
  /** The map is a free canvas: a link may start from any side, and lands on whichever side of
   * the target faces it (see `freeRoute` in `buildFlow.ts`). */
  free?: boolean
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
      {data.free ? <FreeHandles /> : <ColumnHandles />}
      <div className="toc-card__title">{data.title}</div>
      {data.text ? <div className="toc-card__text">{data.text}</div> : null}
      {data.provenance === 'interpreted' ? <ProvenanceBadge /> : null}
      {data.free ? null : <StackHandles />}
    </div>
  )
}

/** A column map: links are drawn out of the right edge into the left edge; the other anchors
 * are only for routed loops and stacked cards. */
function ColumnHandles() {
  return (
    <>
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
    </>
  )
}

/** The same eight anchors, with the ids `buildFlow` names, but a free canvas has no reading
 * direction: a dot on every side starts a link, and every side takes one (unseen, found by the
 * canvas's snap radius as the drag nears the card). */
const FREE_SIDES = [
  { position: Position.Right, source: FLOW_OUT_HANDLE, target: LOOP_IN_HANDLE },
  { position: Position.Left, source: LOOP_OUT_HANDLE, target: FLOW_IN_HANDLE },
  { position: Position.Top, source: STACK_UP_OUT_HANDLE, target: STACK_DOWN_IN_HANDLE },
  { position: Position.Bottom, source: STACK_DOWN_OUT_HANDLE, target: STACK_UP_IN_HANDLE },
]

function FreeHandles() {
  return (
    <>
      {FREE_SIDES.map((side) => (
        <Handle
          key={side.source}
          type="source"
          id={side.source}
          position={side.position}
          className="toc-card__handle toc-card__handle--free"
          title="Drag to connect"
        />
      ))}
      {FREE_SIDES.map((side) => (
        <Handle
          key={side.target}
          type="target"
          id={side.target}
          position={side.position}
          className="toc-card__loop-handle"
        />
      ))}
    </>
  )
}
