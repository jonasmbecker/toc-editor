import { BaseEdge, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance } from './config'
import { loopGeometry } from './loopGeometry'
import type { ConnectionEdgeType } from './ConnectionEdge'

/**
 * Any edge whose target sits to the left of its source: routed around the columns. A one-way
 * arrow pointing back is drawn in the normal colour with the one head `buildFlow` gave it; a
 * both-ways arrow in accent with a head at each end and the "FEEDBACK LOOP" label below-left of
 * the source. `buildFlow` anchors it to the card's loop handles (source left, target right), so
 * `sourceX`/`targetX` here are already the left and right edges.
 */
export function LoopEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<ConnectionEdgeType>) {
  const { path, labelX, labelY } = loopGeometry(sourceX, sourceY, targetX, targetY)
  const { stroke, dashArray, lineCap, width, bothWays } = edgeAppearance(data ?? {})
  const color = selected ? CANVAS_COLORS.select : stroke

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
      {bothWays ? (
        <text x={labelX} y={labelY} className="toc-loop-label" style={{ fill: color }}>
          FEEDBACK LOOP
        </text>
      ) : null}
    </>
  )
}
