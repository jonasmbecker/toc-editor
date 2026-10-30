import { GROUP_KIND, type Connection, type DocumentNode, type ToCDocument } from '../model/schema'
import { allNodeIds, allNodes, findNodeLocation, mapAllNodes, nodeAt } from './tree'

/**
 * Groups: a titled container around two or more cards of one column. A group is stored as an
 * ordinary node with `kind: 'group'` placed in the same column; each member carries
 * `groupId` = that node's id. Because the group is a node, a connection can start or end at it
 * (pointing at the whole cluster) exactly as at a card, and ids, undo and the node panel need no
 * special case. All functions are pure and return the input by reference when nothing changes.
 */

export function isGroupNode(node: DocumentNode): boolean {
  return node.kind === GROUP_KIND
}

function withoutGroupId(node: DocumentNode): DocumentNode {
  const copy = { ...node }
  delete copy.groupId
  return copy
}

/** Members of a group, top to bottom. */
export function membersOf(doc: ToCDocument, groupId: string): DocumentNode[] {
  return allNodes(doc)
    .filter((node) => node.groupId === groupId && !isGroupNode(node))
    .sort((a, b) => a.yPosition - b.yPosition)
}

/** Groups sitting in the given column. */
export function groupsInColumn(
  doc: ToCDocument,
  sectionIndex: number,
  columnIndex: number,
): DocumentNode[] {
  return (doc.sections[sectionIndex]?.columns[columnIndex]?.nodes ?? []).filter(isGroupNode)
}

function sameColumn(doc: ToCDocument, aId: string, bId: string): boolean {
  const a = findNodeLocation(doc, aId)
  const b = findNodeLocation(doc, bId)
  return !!a && !!b && a.sectionIndex === b.sectionIndex && a.columnIndex === b.columnIndex
}

function removeNodeById(doc: ToCDocument, nodeId: string): ToCDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        nodes: column.nodes.filter((node) => node.id !== nodeId),
      })),
    })),
  }
}

function makeGroupId(existing: Set<string>): string {
  let id: string
  do {
    id = `group-${Math.random().toString(36).slice(2, 6)}`
  } while (existing.has(id))
  return id
}

export interface CreateGroupResult {
  document: ToCDocument
  groupId: string
}

/** Groups two or more ungrouped cards that share a column. Null when that is not the case. */
export function createGroup(
  doc: ToCDocument,
  memberIds: string[],
  title = 'New group',
): CreateGroupResult | null {
  const ids = [...new Set(memberIds)]
  const members = ids.map((id) => nodeAt(doc, id))
  if (ids.length < 2 || members.some((m) => !m || isGroupNode(m) || m.groupId)) return null
  if (!ids.every((id) => sameColumn(doc, ids[0], id))) return null
  const cards = members as DocumentNode[]
  const location = findNodeLocation(doc, ids[0])!
  const groupId = makeGroupId(allNodeIds(doc))
  const group: DocumentNode = {
    id: groupId,
    title,
    text: '',
    color: cards[0].color,
    width: Math.max(...cards.map((c) => c.width)),
    yPosition: Math.min(...cards.map((c) => c.yPosition)),
    connections: [],
    kind: GROUP_KIND,
  }
  const grouped = new Set(ids)
  return {
    groupId,
    document: {
      ...doc,
      sections: doc.sections.map((section, si) =>
        si !== location.sectionIndex
          ? section
          : {
              ...section,
              columns: section.columns.map((column, ci) =>
                ci !== location.columnIndex
                  ? column
                  : {
                      ...column,
                      nodes: [
                        group,
                        ...column.nodes.map((n) => (grouped.has(n.id) ? { ...n, groupId } : n)),
                      ],
                    },
              ),
            },
      ),
    },
  }
}

/** Adds a card to an existing group in the same column. */
export function addToGroup(doc: ToCDocument, nodeId: string, groupId: string): ToCDocument {
  const node = nodeAt(doc, nodeId)
  const group = nodeAt(doc, groupId)
  if (!node || !group || !isGroupNode(group) || isGroupNode(node) || node.groupId) return doc
  if (!sameColumn(doc, nodeId, groupId)) return doc
  return mapAllNodes(doc, (n) => (n.id === nodeId ? { ...n, groupId } : n))
}

/** Points every connection aimed at `fromId` at `toId` instead, dropping the ones that would
 * become a self-loop or repeat an arrow the source already has. */
function retargetConnections(doc: ToCDocument, fromId: string, toId: string): ToCDocument {
  return mapAllNodes(doc, (node) => {
    if (!node.connections.some((c) => c.targetId === fromId)) return node
    const kept: Connection[] = []
    for (const c of node.connections) {
      if (c.targetId !== fromId) kept.push(c)
      else if (node.id !== toId && !node.connections.some((o) => o.targetId === toId)) {
        kept.push({ ...c, targetId: toId })
      }
    }
    return { ...node, connections: kept }
  })
}

/** Dissolves a group: the title node goes, the cards stay. What pointed at the group now points
 * at the first (top) member, and the group's own outgoing arrows move onto that member, so the
 * rest of the diagram keeps its meaning. This is also the flattening a compatible export needs. */
export function dissolveGroup(doc: ToCDocument, groupId: string): ToCDocument {
  const group = nodeAt(doc, groupId)
  if (!group || !isGroupNode(group)) return doc
  const members = membersOf(doc, groupId)
  const first = members[0]
  let next = doc
  if (first) {
    const moved = group.connections.filter(
      (c) => c.targetId !== first.id && !first.connections.some((o) => o.targetId === c.targetId),
    )
    next = mapAllNodes(next, (n) =>
      n.id === first.id ? { ...n, connections: [...n.connections, ...moved] } : n,
    )
    next = retargetConnections(next, groupId, first.id)
  }
  next = removeNodeById(next, groupId)
  return mapAllNodes(next, (n) => (n.groupId === groupId ? withoutGroupId(n) : n))
}

/** Takes a card out of its group; a group left with fewer than two cards dissolves. */
export function removeFromGroup(doc: ToCDocument, nodeId: string): ToCDocument {
  const node = nodeAt(doc, nodeId)
  if (!node?.groupId) return doc
  return normalizeGroups(mapAllNodes(doc, (n) => (n.id === nodeId ? withoutGroupId(n) : n)))
}

/** Repairs group data after any edit or import: a card whose group is missing or in another
 * column leaves the group, a group node never belongs to a group, and a group with fewer than
 * two cards dissolves. */
export function normalizeGroups(doc: ToCDocument): ToCDocument {
  const groupIds = new Set(
    allNodes(doc)
      .filter(isGroupNode)
      .map((n) => n.id),
  )
  let next = mapAllNodes(doc, (node) => {
    if (node.groupId === undefined) return node
    const valid =
      !isGroupNode(node) && groupIds.has(node.groupId) && sameColumn(doc, node.id, node.groupId)
    return valid ? node : withoutGroupId(node)
  })
  for (const id of groupIds) {
    if (membersOf(next, id).length < 2) next = dissolveGroup(next, id)
  }
  return next
}

/** Every group dissolved: the plain-ToCB shape. */
export function flattenGroups(doc: ToCDocument): ToCDocument {
  let next = doc
  for (const node of allNodes(doc).filter(isGroupNode)) next = dissolveGroup(next, node.id)
  return next
}
