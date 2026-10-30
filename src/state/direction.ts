import type { Connection, ToCDocument } from '../model/schema'
import { mapNode, nodeAt } from './nodes'
import {
  resolveConnection,
  updateConnection,
  type ConnectionRef,
  type Direction,
} from './connections'

export type SetDirectionResult =
  { ok: true; document: ToCDocument; ref: ConnectionRef } | { ok: false; refused: 'duplicate' }

/**
 * Moves a connection from one node's `connections[]` to the other's, pointing back at the node
 * it came from. Everything else on it (id, confidence, text, provenance) travels with it; the
 * both-ways flag is cleared because a moved arrow is one-way by definition.
 */
function swapEnds(
  doc: ToCDocument,
  ref: ConnectionRef,
  connection: Connection,
  newSourceId: string,
): SetDirectionResult {
  const newSource = nodeAt(doc, newSourceId)
  if (!newSource) return { ok: true, document: doc, ref }
  if (newSource.connections.some((c) => c.targetId === ref.sourceId)) {
    return { ok: false, refused: 'duplicate' }
  }
  const moved: Connection = { ...connection, targetId: ref.sourceId }
  delete moved.isFeedbackLoop
  const removed = mapNode(doc, ref.sourceId, (node) => ({
    ...node,
    connections: node.connections.filter((_, i) => i !== ref.index),
  }))
  const document = mapNode(removed, newSourceId, (node) => ({
    ...node,
    connections: [...node.connections, moved],
  }))
  return { ok: true, document, ref: { sourceId: newSourceId, index: newSource.connections.length } }
}

/**
 * Sets a connection's direction as read in column order (see `resolveConnection`). `both` flags
 * the current object; `forward`/`backward` clear the flag and, when the arrow has to point the
 * other way, move it to the other node. A move is refused when that node already has its own
 * arrow back, since the two would then be duplicates. Returns the input document by reference
 * when nothing changes.
 */
export function setDirection(
  doc: ToCDocument,
  ref: ConnectionRef,
  direction: Direction,
): SetDirectionResult {
  const resolved = resolveConnection(doc, ref)
  if (!resolved || resolved.direction === direction) return { ok: true, document: doc, ref }
  if (direction === 'both') {
    return { ok: true, document: updateConnection(doc, ref, { isFeedbackLoop: true }), ref }
  }
  const wantedSource = direction === 'forward' ? resolved.first : resolved.second
  if (wantedSource.id === resolved.source.id) {
    return { ok: true, document: updateConnection(doc, ref, { isFeedbackLoop: undefined }), ref }
  }
  return swapEnds(doc, ref, resolved.connection, wantedSource.id)
}
