import { BaseEdge, useStore, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance } from './config'
import { arcPoints, LANE_COUNT, smoothPath, type Rect, type RouteScene } from './edgeRouting'
import type { ConnectionEdgeType } from './ConnectionEdge'

function sameScene(a: RouteScene, b: RouteScene): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Stable 0..LANE_COUNT-1 from the edge id, so two links don't share a corridor lane. */
function laneFor(id: string): number {
  let sum = 0
  for (const ch of id) sum = (sum * 31 + ch.charCodeAt(0)) >>> 0
  return sum % LANE_COUNT
}

/** A connection that skips columns or points back: routed along a corridor outside the cards
 * (see `edgeRouting`), so it never passes through or behind one. */
export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<ConnectionEdgeType>) {
  const scene = useStore((s) => {
    const cards: Rect[] = []
    const headers: Rect[] = []
    for (const n of s.nodeLookup.values()) {
      if (n.type !== 'card' && n.type !== 'sectionHeader') continue
      const pos = n.internals.positionAbsolute
      const box = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        w: n.measured.width ?? n.width ?? 0,
        h: n.measured.height ?? n.height ?? 0,
      }
      ;(n.type === 'card' ? cards : headers).push(box)
    }
    return { cards, headers }
  }, sameScene)
  const points = arcPoints(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    scene,
    laneFor(id),
  )
  const { stroke, dashArray, lineCap, width } = edgeAppearance(data ?? {})
  const color = selected ? CANVAS_COLORS.select : stroke

  return (
    <BaseEdge
      path={smoothPath(points)}
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
