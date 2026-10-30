import { BaseEdge, getBezierPath, getSmoothStepPath, Position, type Edge, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance, type ConnectionProvenance } from './config'
import type { ConnectionRef } from '../state/connections'

export interface ConnectionEdgeData extends Record<string, unknown> {
  confidence?: number
  provenance?: ConnectionProvenance
  isFeedbackLoop?: boolean
  /** x of the vertical run of a stepped edge, set by `buildFlow` so edges sharing a gap don't
   * overlap. */
  stepX?: number
  /** Where this edge lives in the document, so a click can open it in the details panel. The
   * same `ConnectionRef` the store and the panel use. */
  ref: ConnectionRef
}

/** Both edge components share one data shape; `type` picks the route (`LoopEdge` for an edge
 * whose target sits to the left of its source, this component for everything else). */
export type ConnectionEdgeType = Edge<ConnectionEdgeData, 'connection' | 'loop'>

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
  const geometry = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }
  // Right-angle route with one turn in the gap before the target column. Same-column (vertical)
  // edges keep the bezier; a dragged card that leaves `stepX` outside the two ends falls back to
  // the midpoint.
  const horizontal = sourcePosition === Position.Right && targetPosition === Position.Left
  const stepX = data?.stepX
  const centerX =
    stepX !== undefined && stepX > sourceX && stepX < targetX ? stepX : undefined
  const [path] = horizontal
    ? getSmoothStepPath({ ...geometry, borderRadius: 6, centerX })
    : getBezierPath(geometry)
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
