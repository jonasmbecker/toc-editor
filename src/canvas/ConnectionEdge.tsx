import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance, type ConnectionProvenance } from './config'
import type { ConnectionRef } from '../state/connections'

export interface ConnectionEdgeData extends Record<string, unknown> {
  confidence?: number
  provenance?: ConnectionProvenance
  isFeedbackLoop?: boolean
  /** Where this edge lives in the document, so a click can open it in the details panel. The
   * same `ConnectionRef` the store and the panel use. */
  ref: ConnectionRef
}

/** Both edge components share one data shape; `type` picks the route (`LoopEdge` for an edge
 * whose target sits to the left of its source, this component for everything else). */
export type ConnectionEdgeType = Edge<ConnectionEdgeData, 'connection' | 'loop'>

const INTERPRETED_MARKER_RADIUS = 3.5
const INTERPRETED_MARKER_STROKE_WIDTH = 1.4

/** A midpoint marker for a connection inferred with uncertainty rather than read directly off
 * an unambiguous arrow. Pairings and both-ways arrows skip it. */
function InterpretedMarker({ x, y, stroke }: { x: number; y: number; stroke: string }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={INTERPRETED_MARKER_RADIUS}
      fill={CANVAS_COLORS.background}
      stroke={stroke}
      strokeWidth={INTERPRETED_MARKER_STROKE_WIDTH}
    />
  )
}

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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const { stroke, dashArray, lineCap, width } = edgeAppearance(data ?? {})
  const color = selected ? CANVAS_COLORS.select : stroke
  const showInterpretedMarker = data?.provenance === 'interpreted' && !data?.isFeedbackLoop

  return (
    <>
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
      {showInterpretedMarker ? <InterpretedMarker x={labelX} y={labelY} stroke={color} /> : null}
    </>
  )
}
