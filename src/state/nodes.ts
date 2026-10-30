import type { Column, DocumentNode, ToCDocument } from '../model/schema'
import { normalizeHexColor } from '../model/color'
import { EMPTY_COLUMN_WIDTH } from '../layout/columns'
import {
  allNodeIds,
  allNodes,
  findNodeLocation,
  mapAllNodes,
  mapNode,
  type NodeLocation,
} from './tree'

/**
 * Pure, immutable node operations on a `ToCDocument`. None of these mutate their input or touch
 * React state directly — callers (the store's `transform`, panels, drag handlers) decide when a
 * result becomes "the" document. Walking and rebuilding the tree itself lives in `tree.ts`.
 */

export { allNodeIds, allNodes, findNodeLocation, mapAllNodes, mapNode, nodeAt } from './tree'
export type { NodeLocation } from './tree'

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'node'
}

/** A new id is a slug of the title plus a short random suffix, re-rolled on the rare collision
 * with an id already in the document (another node with the same title, or an imported file
 * that already used this slug). */
export function makeNodeId(title: string, existingIds: Set<string>): string {
  const base = slugify(title)
  let id: string
  do {
    id = `${base}-${Math.random().toString(36).slice(2, 6)}`
  } while (existingIds.has(id))
  return id
}

/** `Pick`, not `Partial<DocumentNode>` directly: the schema's `.passthrough()` gives
 * `DocumentNode` a `[x: string]: unknown` index signature, which a plain patch object literal
 * (no index signature of its own) can't satisfy. `Pick` drops the index signature along with
 * every field this module doesn't touch. */
type NodePatch = Partial<Pick<DocumentNode, 'title' | 'text' | 'color' | 'yPosition'>>

function patchChangesNothing(node: DocumentNode, patch: NodePatch): boolean {
  return (Object.keys(patch) as (keyof NodePatch)[]).every((key) => patch[key] === node[key])
}

/** Returns the *same* document object when the patch would change nothing (every patched field
 * already holds that value), so the store can recognise a no-op by reference and not record an
 * undo step for it — a drag dropped back where it started, or a select re-picking the current
 * column, must not cost the user a Ctrl+Z. */
function patchNode(doc: ToCDocument, nodeId: string, patch: NodePatch): ToCDocument {
  return mapNode(doc, nodeId, (node) =>
    patchChangesNothing(node, patch) ? node : { ...node, ...patch },
  )
}

export type NodeEdit = Partial<Pick<DocumentNode, 'title' | 'text' | 'color'>>

/** Title/text/colour edits. A colour is validated and normalised here, in the model, not only
 * in the panel's hex field: an edit with anything but a 6-digit hex is refused as a no-op, so
 * no caller (a future keyboard shortcut, an import fix-up, a test) can put a value in the
 * document that the schema would then reject on reload. */
export function updateNode(doc: ToCDocument, nodeId: string, edit: NodeEdit): ToCDocument {
  if (edit.color === undefined) return patchNode(doc, nodeId, edit)
  const color = normalizeHexColor(edit.color)
  if (color === null) return doc
  return patchNode(doc, nodeId, { ...edit, color })
}

export function moveNodeVertically(
  doc: ToCDocument,
  nodeId: string,
  yPosition: number,
): ToCDocument {
  return patchNode(doc, nodeId, { yPosition })
}

function withoutNodeAt(doc: ToCDocument, location: NodeLocation): ToCDocument {
  return {
    ...doc,
    sections: doc.sections.map((section, si) =>
      si !== location.sectionIndex
        ? section
        : {
            ...section,
            columns: section.columns.map((column, ci) =>
              ci !== location.columnIndex
                ? column
                : { ...column, nodes: column.nodes.filter((_, ni) => ni !== location.nodeIndex) },
            ),
          },
    ),
  }
}

function withNodeInserted(
  doc: ToCDocument,
  node: DocumentNode,
  sectionIndex: number,
  columnIndex: number,
): ToCDocument {
  return {
    ...doc,
    sections: doc.sections.map((section, si) => {
      if (si !== sectionIndex) return section
      const columns = [...section.columns]
      while (columns.length <= columnIndex) columns.push({ nodes: [] })
      columns[columnIndex] = {
        ...columns[columnIndex],
        nodes: [...columns[columnIndex].nodes, node],
      }
      return { ...section, columns }
    }),
  }
}

/** Moves a node to a section/column. `columnIndex` may equal (or exceed) the section's current
 * column count — the gap is filled with empty columns, which is how "new column" and "dropping
 * on an empty section" both resolve to the same call. Keeps `yPosition` unchanged, per the
 * node-panel design: changing section parks the node at the top of its new column at whatever
 * height it already had. */
export function moveNodeToColumn(
  doc: ToCDocument,
  nodeId: string,
  sectionIndex: number,
  columnIndex: number,
): ToCDocument {
  const location = findNodeLocation(doc, nodeId)
  if (!location) return doc
  if (location.sectionIndex === sectionIndex && location.columnIndex === columnIndex) return doc
  const node =
    doc.sections[location.sectionIndex].columns[location.columnIndex].nodes[location.nodeIndex]
  return withNodeInserted(withoutNodeAt(doc, location), node, sectionIndex, columnIndex)
}

/** Deletes a node and cascades: strips any connection elsewhere in the document that targeted
 * it, so export never carries a dangling `targetId`. */
export function deleteNode(doc: ToCDocument, nodeId: string): ToCDocument {
  const location = findNodeLocation(doc, nodeId)
  if (!location) return doc
  return mapAllNodes(withoutNodeAt(doc, location), (node) =>
    node.connections.some((c) => c.targetId === nodeId)
      ? { ...node, connections: node.connections.filter((c) => c.targetId !== nodeId) }
      : node,
  )
}

/** Inbound plus outbound connection count, for the delete-confirm row's "removes its N
 * connections" line. */
export function connectionCountForNode(doc: ToCDocument, nodeId: string): number {
  let count = 0
  for (const section of doc.sections) {
    for (const column of section.columns) {
      for (const node of column.nodes) {
        count +=
          node.id === nodeId
            ? node.connections.length
            : node.connections.filter((c) => c.targetId === nodeId).length
      }
    }
  }
  return count
}

const DEFAULT_PALETTE = ['#E3F2FD', '#FFF3E0', '#FFE0B2', '#F0F4C3', '#FCE4EC', '#E8F5E9'] as const

function mostUsedColor(nodes: DocumentNode[]): string | null {
  const counts = new Map<string, number>()
  for (const node of nodes) counts.set(node.color, (counts.get(node.color) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color
      bestCount = count
    }
  }
  return best
}

function defaultColorForSection(doc: ToCDocument, sectionIndex: number): string {
  const sectionNodes = doc.sections[sectionIndex].columns.flatMap((c) => c.nodes)
  const used = mostUsedColor(sectionNodes)
  if (used) return used
  const everyColor = new Set(allNodes(doc).map((n) => n.color))
  return DEFAULT_PALETTE.find((c) => !everyColor.has(c)) ?? DEFAULT_PALETTE[0]
}

function defaultWidthForColumn(column: Column): number {
  return column.nodes.length > 0
    ? Math.max(...column.nodes.map((n) => n.width))
    : EMPTY_COLUMN_WIDTH
}

/** A freshly dropped card clears the column's lowest node by an estimated card height plus a
 * gap, since the document format has no stored node height to measure against. */
const ESTIMATED_CARD_HEIGHT = 80
const NEW_NODE_GAP = 24

function defaultYPosition(column: Column): number {
  if (column.nodes.length === 0) return 0
  return Math.max(...column.nodes.map((n) => n.yPosition)) + ESTIMATED_CARD_HEIGHT + NEW_NODE_GAP
}

export interface AddNodeResult {
  document: ToCDocument
  nodeId: string
}

export function addNode(
  doc: ToCDocument,
  sectionIndex: number,
  columnIndex: number,
): AddNodeResult {
  const column = doc.sections[sectionIndex].columns[columnIndex] ?? { nodes: [] }
  const nodeId = makeNodeId('New node', allNodeIds(doc))
  const newNode: DocumentNode = {
    id: nodeId,
    title: 'New node',
    text: '',
    color: defaultColorForSection(doc, sectionIndex),
    width: defaultWidthForColumn(column),
    yPosition: defaultYPosition(column),
    connections: [],
  }
  return { document: withNodeInserted(doc, newNode, sectionIndex, columnIndex), nodeId }
}
