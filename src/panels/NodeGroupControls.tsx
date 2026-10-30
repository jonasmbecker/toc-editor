import type { DocumentNode, ToCDocument } from '../model/schema'
import {
  addToGroup,
  createGroup,
  dissolveGroup,
  groupsInColumn,
  isGroupNode,
  membersOf,
  removeFromGroup,
} from '../state/groups'
import { nodeAt } from '../state/tree'

export interface NodeGroupControlsProps {
  document: ToCDocument
  node: DocumentNode
  sectionIndex: number
  columnIndex: number
  onChange: (label: string, updater: (document: ToCDocument) => ToCDocument) => void
  /** Selects a node by id, so a freshly made group opens in the panel. */
  onSelect: (nodeId: string | null) => void
}

function GroupHeader({ document, group }: { document: ToCDocument; group: DocumentNode }) {
  const count = membersOf(document, group.id).length
  return <p className="toc-panel__hint">Group of {count} cards. Each card keeps its own arrows.</p>
}

type Change = NodeGroupControlsProps['onChange']

function GroupOwnControls(props: NodeGroupControlsProps) {
  const { document, node, onChange, onSelect } = props
  return (
    <div className="toc-panel__position-group">
      <span className="toc-panel__label">Group</span>
      <GroupHeader document={document} group={node} />
      <button
        type="button"
        className="toc-button toc-button--block"
        onClick={() => {
          onChange('ungroup', (d) => dissolveGroup(d, node.id))
          onSelect(null)
        }}
      >
        Ungroup (keep the cards)
      </button>
    </div>
  )
}

function MemberControls({ document, node, onChange }: NodeGroupControlsProps) {
  const group = node.groupId ? nodeAt(document, node.groupId) : null
  return (
    <div className="toc-panel__position-group">
      <span className="toc-panel__label">Group</span>
      <p className="toc-panel__hint">In “{group?.title ?? 'group'}”.</p>
      <button
        type="button"
        className="toc-button toc-button--block"
        onClick={() => onChange('remove from group', (d) => removeFromGroup(d, node.id))}
      >
        Remove from group
      </button>
    </div>
  )
}

function AddToGroupSelect({
  groups,
  nodeId,
  onChange,
}: {
  groups: DocumentNode[]
  nodeId: string
  onChange: Change
}) {
  return (
    <select
      id="node-group"
      value=""
      aria-label="Add to group"
      onChange={(event) => {
        const groupId = event.target.value
        if (groupId) onChange('add to group', (d) => addToGroup(d, nodeId, groupId))
      }}
    >
      <option value="">Add to group…</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {group.title}
        </option>
      ))}
    </select>
  )
}

function UngroupedControls(props: NodeGroupControlsProps) {
  const { document, node, sectionIndex, columnIndex, onChange, onSelect } = props
  const groups = groupsInColumn(document, sectionIndex, columnIndex)
  const partners = (document.sections[sectionIndex]?.columns[columnIndex]?.nodes ?? []).filter(
    (other) => other.id !== node.id && !isGroupNode(other) && !other.groupId,
  )
  return (
    <div className="toc-panel__position-group">
      <label className="toc-panel__label" htmlFor="node-group">
        Group
      </label>
      <div className="toc-panel__position">
        {groups.length > 0 ? (
          <AddToGroupSelect groups={groups} nodeId={node.id} onChange={onChange} />
        ) : null}
        <select
          value=""
          aria-label="Group with another card"
          onChange={(event) => {
            const made = createGroup(document, [node.id, event.target.value])
            if (!made) return
            onChange('group cards', () => made.document)
            onSelect(made.groupId)
          }}
        >
          <option value="">Group with…</option>
          {partners.map((other) => (
            <option key={other.id} value={other.id}>
              {other.title}
            </option>
          ))}
        </select>
      </div>
      <p className="toc-panel__hint">Groups hold cards from one column under a shared title.</p>
    </div>
  )
}

/** Group, add to a group, remove from one, ungroup. Everything is a pure document transform
 * through `onChange`, so each action is one undo step. */
export function NodeGroupControls(props: NodeGroupControlsProps) {
  if (isGroupNode(props.node)) return <GroupOwnControls {...props} />
  if (props.node.groupId) return <MemberControls {...props} />
  return <UngroupedControls {...props} />
}
