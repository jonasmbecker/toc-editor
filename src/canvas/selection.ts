import { MarkerType, type EdgeMarkerType } from '@xyflow/react'
import { sameRef, type ConnectionRef } from '../state/connections'
import { CANVAS_COLORS } from './config'
import type { ConnectionEdgeType } from './ConnectionEdge'

/** Pure helpers behind the canvas's selection sync, kept out of the hook so they are testable
 * without React Flow. */

export function isSelectedEdge(edge: ConnectionEdgeType, ref: ConnectionRef | null): boolean {
  return ref !== null && sameRef(edge.data?.ref ?? null, ref)
}

export function refOfEdge(edge: ConnectionEdgeType): ConnectionRef | null {
  return edge.data?.ref ?? null
}

/** The two cards a selected edge joins, so they can carry the selection ring too. */
export function endpointIds(edges: ConnectionEdgeType[], ref: ConnectionRef | null): Set<string> {
  const edge = edges.find((e) => isSelectedEdge(e, ref))
  return new Set(edge ? [edge.source, edge.target] : [])
}

function recolour(marker: EdgeMarkerType | undefined): EdgeMarkerType | undefined {
  if (!marker || typeof marker === 'string') return marker
  return { ...marker, type: MarkerType.ArrowClosed, color: CANVAS_COLORS.select }
}

/** The selected edge's line turns the selection colour in its component; its arrowheads are
 * markers built in `buildFlow`, so they are recoloured here, where `selected` is known. */
export function withSelection(
  edge: ConnectionEdgeType,
  ref: ConnectionRef | null,
): ConnectionEdgeType {
  if (!isSelectedEdge(edge, ref)) return { ...edge, selected: false }
  return {
    ...edge,
    selected: true,
    markerEnd: recolour(edge.markerEnd),
    markerStart: recolour(edge.markerStart),
  }
}

export interface PathHighlight {
  /** Every card on a path through the selected one, the selected card included. */
  nodes: Set<string>
  /** Ids of the edges on those paths. */
  edges: Set<string>
}

/** Cards a walk reaches from `starts` over `next`. */
function reach(starts: string[], next: Map<string, string[]>): Set<string> {
  const seen = new Set(starts)
  const queue = [...starts]
  while (queue.length > 0) {
    for (const id of next.get(queue.pop()!) ?? []) {
      if (!seen.has(id)) {
        seen.add(id)
        queue.push(id)
      }
    }
  }
  return seen
}

/**
 * Every path a card is part of: all it feeds, downstream, and all that feeds it, upstream,
 * following forward links only, so a loop or a link back cannot pull the whole map in. A loop or
 * back link is still lit when both its ends are on the paths. Works on any map (Jonas,
 * 2026-11-01: "super useful in general"). `selected` is the card, plus the group it sits in when
 * it has one, because a link to a group reaches every card in it.
 */
export function pathHighlight(edges: ConnectionEdgeType[], selected: string[]): PathHighlight {
  const forward = new Map<string, string[]>()
  const backward = new Map<string, string[]>()
  const add = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from)
    if (list) list.push(to)
    else map.set(from, [to])
  }
  for (const edge of edges) {
    if (edge.data?.backward || edge.data?.isFeedbackLoop) continue
    add(forward, edge.source, edge.target)
    add(backward, edge.target, edge.source)
  }
  const down = reach(selected, forward)
  const up = reach(selected, backward)
  const nodes = new Set([...down, ...up])
  const onPath = (edge: ConnectionEdgeType) => {
    if (edge.data?.backward || edge.data?.isFeedbackLoop) {
      return nodes.has(edge.source) && nodes.has(edge.target)
    }
    return (
      (down.has(edge.source) && down.has(edge.target)) ||
      (up.has(edge.source) && up.has(edge.target))
    )
  }
  return { nodes, edges: new Set(edges.filter(onPath).map((edge) => edge.id)) }
}
