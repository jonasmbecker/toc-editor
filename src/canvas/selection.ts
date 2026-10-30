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
