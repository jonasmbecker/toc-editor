import { BaseEdge, useStore, type EdgeProps, type ReactFlowState } from '@xyflow/react'
import { edgeAppearance, edgeStroke } from './config'
import {
  assignChannels,
  roundedPath,
  routePoints,
  type Lane,
  type Rect,
  type RouteScene,
} from './edgeRouting'
import type { ConnectionEdgeType } from './ConnectionEdge'

/** Only used if an edge reaches the canvas without lanes (not produced by uildFlow). */
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

/** Every card and section header as drawn now, so routes use the measured heights. */
function readScene(s: ReactFlowState): RouteScene {
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
}

/** The y of this link's channel through the skipped columns, or undefined for a link that takes
 * the corridor (a loop). Worked out for all forward skip links together,
 * because links sharing a band are spread across it. */
function channelOf(s: ReactFlowState, id: string): number | undefined {
  const links = (s.edges as ConnectionEdgeType[]).flatMap((e) =>
    e.type === 'routed' && e.data?.lane?.above && e.data.lane.ends
      ? [{ id: e.id, ...e.data.lane.ends }]
      : [],
  )
  const { cards, headers } = readScene(s)
  return assignChannels(links, cards, headers).get(id)
}

/** A connection that skips columns or points back. A forward link threads through a free channel
 * between card rows in the columns it skips; a loop, or a link with no free channel, runs along a
 * corridor outside the cards (see `edgeRouting`). Either way it never passes through or behind a
 * card. Each skip link has its own colour; with a card selected, links on its paths are drawn
 * heavier and the rest fade back (see `pathHighlight`). */
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
  const scene = useStore(readScene, sameScene)
  const channelY = useStore((s) => channelOf(s, id))
  const points = routePoints(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    scene,
    data?.lane ?? FALLBACK_LANE,
    channelY,
  )
  const appearance = edgeAppearance(data ?? {})
  const { stroke, width, opacity } = edgeStroke(data, appearance, selected)

  return (
    <BaseEdge
      id={id}
      path={roundedPath(points)}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={{
        stroke,
        strokeWidth: width,
        strokeDasharray: appearance.dashArray,
        strokeLinecap: appearance.lineCap,
        opacity,
      }}
    />
  )
}
