/**
 * Routing for connections that skip columns or point back: the line leaves into the gap beside
 * its source column, runs along a corridor outside the cards, and drops into the gap beside
 * the target column. Pure geometry, no React Flow, so "never crosses a card" is testable.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Pt {
  x: number
  y: number
}

export interface RouteScene {
  /** Every card box. */
  cards: Rect[]
  /** Section header bars, which a corridor above the cards must not run through. */
  headers: Rect[]
}

/** Horizontal run at each end before the line turns toward the corridor. */
const STUB = 20
/** Clearance between a vertical run and the card edge it leaves behind. */
const LANE_OFFSET = 16
const LANE_STEP = 3
/** How far outside the cards (or the header bars) the corridor runs, and the gap between lanes. */
const CORRIDOR_MARGIN = 20
const CORRIDOR_STEP = 8
export const LANE_COUNT = 5

/** Smooth curve through the points (Catmull-Rom converted to cubic beziers). */
export function smoothPath(points: Pt[]): string {
  let d = `M${points[0].x},${points[0].y}`
  for (const [, c1, c2, p2] of smoothSegments(points)) {
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  }
  return d
}

type Segment = [Pt, Pt, Pt, Pt]

function smoothSegments(points: Pt[]): Segment[] {
  const t = 0.5 / 3
  const out: Segment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    out.push([
      p1,
      { x: p1.x + (p2.x - p0.x) * t, y: p1.y + (p2.y - p0.y) * t },
      { x: p2.x - (p3.x - p1.x) * t, y: p2.y - (p3.y - p1.y) * t },
      p2,
    ])
  }
  return out
}

/** Points along the smoothed curve, for testing it against card boxes. */
export function sampleSmooth(points: Pt[], perSegment = 12): Pt[] {
  const out: Pt[] = [points[0]]
  for (const [p1, c1, c2, p2] of smoothSegments(points)) {
    for (let i = 1; i <= perSegment; i++) {
      const u = i / perSegment
      const v = 1 - u
      out.push({
        x: v ** 3 * p1.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u ** 3 * p2.x,
        y: v ** 3 * p1.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u ** 3 * p2.y,
      })
    }
  }
  return out
}

/** Right edge of the column the source card sits in (the widest card sharing its left edge),
 * so the line leaves into the gap even when the source card is narrower than its column. */
function columnRight(cards: Rect[], sourceRight: number): number {
  const source = cards.find((c) => Math.abs(c.x + c.w - sourceRight) < 1)
  if (!source) return sourceRight
  let right = sourceRight
  for (const c of cards) if (Math.abs(c.x - source.x) < 1) right = Math.max(right, c.x + c.w)
  return right
}

function crossesHeader(headers: Rect[], x: number): boolean {
  return headers.some((h) => x >= h.x && x <= h.x + h.w)
}

/** Control points of the arc for a link from `s` (a card's right edge) to `t` (a card's left
 * edge). A feedback loop (target left of source) runs below the lowest card; a forward link
 * runs above the header bars, unless a vertical run would cut through one, then below too.
 * `lane` (0..LANE_COUNT-1) staggers the corridor and the vertical runs so links don't overlap. */
export function arcPoints(s: Pt, t: Pt, scene: RouteScene, lane: number): Pt[] {
  const { cards, headers } = scene
  const sx = columnRight(cards, s.x) + LANE_OFFSET + lane * LANE_STEP
  const tx = t.x - LANE_OFFSET - lane * LANE_STEP
  const forward = t.x > s.x
  const top = Math.min(...cards.map((c) => c.y), ...headers.map((h) => h.y))
  const bottom = Math.max(...cards.map((c) => c.y + c.h))
  const above = forward && !crossesHeader(headers, sx) && !crossesHeader(headers, tx)
  const y = above
    ? top - CORRIDOR_MARGIN - lane * CORRIDOR_STEP
    : bottom + CORRIDOR_MARGIN + lane * CORRIDOR_STEP
  return [
    s,
    { x: s.x + STUB * 0.5, y: s.y },
    { x: sx, y: s.y + (y - s.y) * 0.15 },
    { x: sx + 6, y: y - (y - s.y) * 0.1 },
    { x: sx + 18, y },
    { x: tx - 18, y },
    { x: tx - 6, y: y - (y - t.y) * 0.1 },
    { x: tx, y: t.y + (y - t.y) * 0.15 },
    { x: t.x - STUB * 0.5, y: t.y },
    t,
  ]
}
