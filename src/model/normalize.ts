import type { Connection, ToCDocument } from './schema'
import { allNodes, mapAllNodes } from '../state/nodes'

/**
 * A both-ways connection ("feedback loop") is stored once, on one node, with
 * `isFeedbackLoop: true`. Older files (and theoryofchangebuilder.com, which knows only one-way
 * arrows) hold the same thing as a mutual pair: A -> B and B -> A, each flagged. These two
 * functions convert between the forms: collapse on the way in, expand for a compatible export.
 * Both return the input by reference when there is nothing to do.
 */

function appendBlock(text: string | undefined, extra: string | undefined): string | undefined {
  if (!extra?.trim()) return text
  if (!text?.trim()) return extra
  return text.includes(extra) ? text : `${text}\n\n${extra}`
}

function mergeTwin(keep: Connection, twin: Connection): Connection {
  const merged: Connection = { ...keep }
  const assumptions = appendBlock(keep.assumptions, twin.assumptions)
  const evidence = appendBlock(keep.evidence, twin.evidence)
  if (assumptions !== undefined) merged.assumptions = assumptions
  if (evidence !== undefined) merged.evidence = evidence
  return merged
}

/** Collapses every mutual flagged pair into one both-ways connection on the node that comes
 * first in document order, appending the twin's text as further blocks. */
export function collapseMutualLoops(doc: ToCDocument): ToCDocument {
  const byId = new Map(allNodes(doc).map((n) => [n.id, n]))
  const drop = new Set<string>()
  const merged = new Map<string, Connection>()
  for (const node of byId.values()) {
    node.connections.forEach((connection, index) => {
      if (!connection.isFeedbackLoop || drop.has(`${node.id}#${index}`)) return
      const twinNode = byId.get(connection.targetId)
      const twinIndex =
        twinNode?.connections.findIndex((c) => c.targetId === node.id && c.isFeedbackLoop) ?? -1
      if (!twinNode || twinIndex < 0) return
      drop.add(`${twinNode.id}#${twinIndex}`)
      merged.set(`${node.id}#${index}`, mergeTwin(connection, twinNode.connections[twinIndex]))
    })
  }
  if (drop.size === 0) return doc
  return mapAllNodes(doc, (node) => {
    const touched = node.connections.some(
      (_, i) => merged.has(`${node.id}#${i}`) || drop.has(`${node.id}#${i}`),
    )
    if (!touched) return node
    return {
      ...node,
      connections: node.connections
        .map((c, i) => merged.get(`${node.id}#${i}`) ?? c)
        .filter((_, i) => !drop.has(`${node.id}#${i}`)),
    }
  })
}

/** Expands every both-ways connection into a mutual pair so a one-way-only tool draws both
 * arrows. The twin carries the same text and confidence but no `id` (ids are unique). */
export function expandBothWays(doc: ToCDocument): ToCDocument {
  const twins = new Map<string, Connection[]>()
  for (const node of allNodes(doc)) {
    for (const connection of node.connections) {
      if (!connection.isFeedbackLoop) continue
      const twin: Connection = { ...connection, targetId: node.id }
      delete twin.id
      twins.set(connection.targetId, [...(twins.get(connection.targetId) ?? []), twin])
    }
  }
  return mapAllNodes(doc, (node) => {
    const extra = (twins.get(node.id) ?? []).filter(
      (twin) => !node.connections.some((c) => c.targetId === twin.targetId),
    )
    return extra.length === 0 ? node : { ...node, connections: [...node.connections, ...extra] }
  })
}
