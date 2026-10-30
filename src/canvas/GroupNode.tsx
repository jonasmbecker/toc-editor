import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { FLOW_IN_HANDLE, FLOW_OUT_HANDLE, LOOP_IN_HANDLE, LOOP_OUT_HANDLE } from './CardNode'
import './group.css'

export interface GroupNodeData extends Record<string, unknown> {
  title: string
  text: string
  color: string
  memberIds: string[]
}

export type GroupNodeType = Node<GroupNodeData, 'group'>

/** The container drawn behind a group's cards. Its handles use the same ids as a card's, so a
 * connection to or from the whole group is built and routed like any other. */
export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div
      className={`toc-group${selected ? ' toc-group--selected' : ''}`}
      style={{ ['--toc-group-tint' as string]: data.color }}
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
      <div className="toc-group__head">
        <div className="toc-group__title">{data.title}</div>
        {data.text ? <div className="toc-group__text">{data.text}</div> : null}
      </div>
      <Handle
        type="source"
        id={FLOW_OUT_HANDLE}
        position={Position.Right}
        className="toc-card__handle"
        title="Drag to connect the whole group"
      />
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
