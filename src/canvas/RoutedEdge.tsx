import { BaseEdge, useStore, type EdgeProps } from '@xyflow/react'
import { CANVAS_COLORS, edgeAppearance } from './config'
import { roundedPath, routePoints, type Lane, type Rect, type RouteScene } from './edgeRouting'
import type { ConnectionEdgeType } from './ConnectionEdge'

/** Only used if an edge reaches the canvas without lanes (not produced by uildFlow). */
const FALLBACK_LANE: Lane = {
  near: false,
  above: true,
  sourceSlot: 0,
  sourceCount: 1,
  targetSlot: 0,
  targetCount: 1,
  corridorSlot: 0,
}

function sameScene(a: RouteScene, b: RouteScene): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A connection that skips columns or points back: routed along a corridor outside the cards
 * (see `edgeRouting`), so it never passes through or behind one. */
export function RoutedEdge({
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
  const points = routePoints(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    scene,
    data?.lane ?? FALLBACK_LANE,
  )
  const { stroke, dashArray, lineCap, width } = edgeAppearance(data ?? {})
  const color = selected ? CANVAS_COLORS.select : stroke

  return (
    <BaseEdge
      path={roundedPath(points)}
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
