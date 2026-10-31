import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance, type ConnectionProvenance } from './config'
import type { ConnectionRef } from '../state/connections'
import type { Lane } from './edgeRouting'

export interface ConnectionEdgeData extends Record<string, unknown> {
  confidence?: number
  provenance?: ConnectionProvenance
  isFeedbackLoop?: boolean
  /** Slots of a routed edge in the gaps and the corridor, assigned in `buildFlow`. */
  lane?: Lane
  /** Colour of a column-skipping link, so it can be told apart from the lines beside it. */
  tint?: string
  /** Where this edge lives in the document, so a click can open it in the details panel. The
   * same `ConnectionRef` the store and the panel use. */
  ref: ConnectionRef
}

/** Both edge components share one data shape; `type` picks the route (`RoutedEdge` for an edge
 * that skips a column or points back, this component for everything else). */
export type ConnectionEdgeType = Edge<ConnectionEdgeData, 'connection' | 'routed'>

/** Whether a connection was interpreted rather than read verbatim is shown in its Connection
 * Details header, not on the canvas: a midpoint circle on every inferred edge cluttered the map
 * (Jonas, 2026-10-30). */
export function ConnectionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<ConnectionEdgeType>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const { stroke, dashArray, lineCap, width } = edgeAppearance(data ?? {})
  const color = selected ? CANVAS_COLORS.select : stroke

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={{
        stroke: color,
        strokeWidth: selected ? width + 1 : width,
        strokeDasharray: dashArray,
        strokeLinecap: lineCap,
      }}
    />
  )
}
