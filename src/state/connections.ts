import type { Connection, DocumentNode, ToCDocument } from '../model/schema'
import { allNodes, findNodeLocation, mapNode, nodeAt } from './nodes'

/**
 * Pure, immutable connection operations. A connection lives inside its source node's
 * `connections[]`, so it is addressed by `(sourceId, index)` rather than by `id`: ToCB files
 * carry no connection ids at all. The index is stable only until the document changes under
 * it; the store re-checks the selected ref on undo and redo (see `store.ts`), and the canvas
 * carries the same ref on every edge's `data.ref` (see `ConnectionEdgeData`).
 */

export interface ConnectionRef {
  sourceId: string
  index: number
}

export function sameRef(a: ConnectionRef | null, b: ConnectionRef | null): boolean {
  return a === b || (!!a && !!b && a.sourceId === b.sourceId && a.index === b.index)
}

/** One string form of a ref, for React keys and undo coalescing. */
export function connectionRefKey(ref: ConnectionRef): string {
  return `${ref.sourceId}#${ref.index}`
}

export type ConnectionRefusal = 'self' | 'duplicate' | 'missing'

export type AddConnectionResult =
  | { ok: true; document: ToCDocument; ref: ConnectionRef }
  | { ok: false; refused: ConnectionRefusal }

export const NEW_CONNECTION_CONFIDENCE = 50

/** How a connection reads between its two nodes once they are put in column order (see
 * `direction.ts`): the stored arrow points from the first to the second (`forward`), from the
 * second back to the first (`backward`), or both ways (`isFeedbackLoop`, a head at each end). */
export type Direction = 'forward' | 'backward' | 'both'

export interface ResolvedConnection {
  connection: Connection
  source: DocumentNode
  target: DocumentNode
  /** The two ends in column-flow order (section, then column, then yPosition). */
  first: DocumentNode
  second: DocumentNode
  direction: Direction
}

function allConnectionIds(doc: ToCDocument): Set<string> {
  const ids = allNodes(doc).flatMap((n) => n.connections.map((c) => c.id))
  return new Set(ids.filter((id) => id != null))
}

/** `c-` plus a 4-char base36 suffix, re-rolled on collision, so a later intervention link can
 * point at a connection and not only at a node. */
export function makeConnectionId(existingIds: Set<string>): string {
  let id: string
  do {
    id = `c-${Math.random().toString(36).slice(2, 6)}`
  } while (existingIds.has(id))
  return id
}

export function findConnection(doc: ToCDocument, ref: ConnectionRef | null): Connection | null {
  if (!ref) return null
  return nodeAt(doc, ref.sourceId)?.connections[ref.index] ?? null
}

/** Column-flow order: a node is "before" another when it sits in an earlier section, then an
 * earlier column, then higher up. Equal keys fall back to false, so the source stays first. */
export function flowsBefore(doc: ToCDocument, aId: string, bId: string): boolean {
  const a = findNodeLocation(doc, aId)
  const b = findNodeLocation(doc, bId)
  if (!a || !b) return false
  if (a.sectionIndex !== b.sectionIndex) return a.sectionIndex < b.sectionIndex
  if (a.columnIndex !== b.columnIndex) return a.columnIndex < b.columnIndex
  const ay = doc.sections[a.sectionIndex].columns[a.columnIndex].nodes[a.nodeIndex].yPosition
  const by = doc.sections[b.sectionIndex].columns[b.columnIndex].nodes[b.nodeIndex].yPosition
  return ay < by
}

/** Everything the details panel needs for one ref; null when the ref no longer resolves (the
 * connection or either node was deleted under it). */
export function resolveConnection(
  doc: ToCDocument,
  ref: ConnectionRef | null,
): ResolvedConnection | null {
  const connection = findConnection(doc, ref)
  if (!connection || !ref) return null
  const source = nodeAt(doc, ref.sourceId)
  const target = nodeAt(doc, connection.targetId)
  if (!source || !target) return null
  const isTargetFirst = flowsBefore(doc, target.id, source.id)
  const oneWay: Direction = isTargetFirst ? 'backward' : 'forward'
  return {
    connection,
    source,
    target,
    first: isTargetFirst ? target : source,
    second: isTargetFirst ? source : target,
    direction: connection.isFeedbackLoop ? 'both' : oneWay,
  }
}

/** Appends a new connection to the source node, pointing the way the user dragged and never
 * both ways (the popup's direction control is where that is chosen). Refuses a self-loop and an
 * exact duplicate (same source and target); the reverse direction is allowed as a second,
 * separate one-way arrow. */
export function addConnection(
  doc: ToCDocument,
  sourceId: string,
  targetId: string,
): AddConnectionResult {
  if (sourceId === targetId) return { ok: false, refused: 'self' }
  const source = nodeAt(doc, sourceId)
  if (!source || !nodeAt(doc, targetId)) return { ok: false, refused: 'missing' }
  if (source.connections.some((c) => c.targetId === targetId)) {
    return { ok: false, refused: 'duplicate' }
  }
  const connection: Connection = {
    id: makeConnectionId(allConnectionIds(doc)),
    targetId,
    confidence: NEW_CONNECTION_CONFIDENCE,
    assumptions: '',
    evidence: '',
  }
  const document = mapNode(doc, sourceId, (node) => ({
    ...node,
    connections: [...node.connections, connection],
  }))
  return { ok: true, document, ref: { sourceId, index: source.connections.length } }
}

/** `Pick` for the same reason `nodes.ts` uses it: the schema's passthrough index signature
 * keeps a plain patch literal from satisfying `Partial<Connection>`. A key set to `undefined`
 * is removed from the connection (how "Clear rating" takes `confidence` back out so an
 * untouched ToCB file still round-trips byte-for-byte). */
export type ConnectionPatch = Partial<
  Pick<Connection, 'confidence' | 'assumptions' | 'evidence' | 'evidenceBlocks' | 'isFeedbackLoop'>
>

function applyPatch(connection: Connection, patch: ConnectionPatch): Connection {
  const next: Connection = { ...connection }
  for (const key of Object.keys(patch) as (keyof ConnectionPatch)[]) {
    const value = patch[key]
    if (value === undefined) delete next[key]
    else Object.assign(next, { [key]: value })
  }
  return next
}

function patchChangesNothing(connection: Connection, patch: ConnectionPatch): boolean {
  return (Object.keys(patch) as (keyof ConnectionPatch)[]).every(
    (key) => patch[key] === connection[key],
  )
}

/** Returns the same document by reference when nothing changes, so the store records no undo
 * step for it (same contract as `nodes.ts`). */
export function updateConnection(
  doc: ToCDocument,
  ref: ConnectionRef,
  patch: ConnectionPatch,
): ToCDocument {
  const current = findConnection(doc, ref)
  if (!current || patchChangesNothing(current, patch)) return doc
  return mapNode(doc, ref.sourceId, (node) => ({
    ...node,
    connections: node.connections.map((c, i) => (i !== ref.index ? c : applyPatch(c, patch))),
  }))
}

export function deleteConnection(doc: ToCDocument, ref: ConnectionRef): ToCDocument {
  if (!findConnection(doc, ref)) return doc
  return mapNode(doc, ref.sourceId, (node) => ({
    ...node,
    connections: node.connections.filter((_, i) => i !== ref.index),
  }))
}
