/**
 * Routing for connections that skip columns or point back, so none passes through or behind a
 * card. Pure geometry, no React Flow, so "never crosses a card" is testable.
 *
 * - A link that skips a column, or a feedback loop that skips one going back, leaves into the gap
 *   beside its source column, runs along a corridor outside the cards (above the header bars for
 *   forward links, below the lowest card for loops), and drops into the gap beside the target.
 *   A forward link first looks for a free channel between card rows through the skipped columns
 *   (`assignChannels`) and only uses the corridor when there is none.
 * - A feedback loop between ADJACENT columns stays a compact curve inside the gap between them.
 *
 * Every routed link gets its own slot in the gaps and in the corridor (`assignLanes`), so lines
 * never share a path and each can be followed from end to end.
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

/** A link as the layout sees it: `sx,sy` is where it leaves the source (right edge for the outer
 * arc, left edge for a near loop), `tx,ty` where it enters the target. `sc`/`tc` are global column
 * indices. */
export interface RouteLink {
  id: string
  sx: number
  sy: number
  tx: number
  ty: number
  sc: number
  tc: number
}

export interface Lane {
  /** Adjacent-column feedback loop: a compact curve in the gap, no corridor. */
  near: boolean
  /** Outer arc runs above the header bars (forward) or below the lowest card (loop). */
  above: boolean
  sourceSlot: number
  sourceCount: number
  targetSlot: number
  targetCount: number
  corridorSlot: number
  /** The link's ends, so a forward skip link can look for a channel through the skipped columns
   * once the cards' real heights are known (see `assignChannels`). Absent on a near loop. */
  ends?: { sx: number; sy: number; tx: number; ty: number }
}

/** Clearance between a vertical run and the nearest card edge, and the widest spacing between
 * neighbouring lines; the spacing shrinks to fit when a gap is busy. */
export const CLEAR = 11
const GAP_ROOM = 26
export const MAX_STEP = 7
/** How far outside the cards (or the header bars) the first corridor runs, and the gap between
 * corridors. */
const CORRIDOR_MARGIN = 24
const CORRIDOR_STEP = 10
/** Corner radius of the arcs. */
const RADIUS = 16

function crossesHeader(headers: Rect[], x: number): boolean {
  return headers.some((h) => x >= h.x && x <= h.x + h.w)
}

function step(count: number): number {
  return count > 1 ? Math.min(MAX_STEP, GAP_ROOM / (count - 1)) : 0
}

/** Gives every link a slot beside its source column, beside its target column and in its
 * corridor, ordered so that lines nest instead of crossing: of two lines leaving the same gap,
 * the one starting further from the corridor sits further from the cards. */
export function assignLanes(links: RouteLink[], headers: Rect[]): Map<string, Lane> {
  const lanes = new Map<string, Lane>()
  const outer: (RouteLink & { above: boolean })[] = []
  const near: RouteLink[] = []
  for (const l of links) {
    if (l.tc === l.sc - 1) near.push(l)
    else {
      const forward = l.tc > l.sc
      const above =
        forward && !crossesHeader(headers, l.sx + CLEAR) && !crossesHeader(headers, l.tx - CLEAR)
      outer.push({ ...l, above })
    }
  }

  const place = (
    group: typeof outer,
    key: (l: RouteLink) => number,
    y: (l: RouteLink) => number,
  ): Map<string, [number, number]> => {
    const byGap = new Map<number, typeof outer>()
    for (const l of group) byGap.set(key(l), [...(byGap.get(key(l)) ?? []), l])
    const out = new Map<string, [number, number]>()
    for (const members of byGap.values()) {
      // Upward arcs: the lower line is the outer one; downward arcs: the higher line.
      const ordered = [...members.filter((m) => m.above)].sort((a, b) => y(a) - y(b))
      ordered.push(...members.filter((m) => !m.above).sort((a, b) => y(b) - y(a)))
      ordered.forEach((m, i) => out.set(m.id, [i, ordered.length]))
    }
    return out
  }
  const fromSource = place(
    outer,
    (l) => l.sc,
    (l) => l.sy,
  )
  const intoTarget = place(
    outer,
    (l) => l.tc,
    (l) => l.ty,
  )

  for (const above of [true, false]) {
    const group = outer
      .filter((l) => l.above === above)
      .sort((a, b) => Math.abs(a.tx - a.sx) - Math.abs(b.tx - b.sx))
    group.forEach((l, corridorSlot) => {
      const [sourceSlot, sourceCount] = fromSource.get(l.id)!
      const [targetSlot, targetCount] = intoTarget.get(l.id)!
      lanes.set(l.id, {
        near: false,
        above,
        sourceSlot,
        sourceCount,
        targetSlot,
        targetCount,
        corridorSlot,
        ends: { sx: l.sx, sy: l.sy, tx: l.tx, ty: l.ty },
      })
    })
  }

  const byGap = new Map<number, RouteLink[]>()
  for (const l of near) byGap.set(l.sc, [...(byGap.get(l.sc) ?? []), l])
  for (const members of byGap.values()) {
    members.sort((a, b) => a.sy - b.sy)
    members.forEach((l, i) =>
      lanes.set(l.id, {
        near: true,
        above: false,
        sourceSlot: i,
        sourceCount: members.length,
        targetSlot: i,
        targetCount: members.length,
        corridorSlot: 0,
      }),
    )
  }
  return lanes
}

/** Orthogonal polyline with rounded corners. */
export function roundedPath(points: Pt[], radius = RADIUS): string {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const r = Math.min(
      radius,
      Math.hypot(b.x - a.x, b.y - a.y) / 2,
      Math.hypot(c.x - b.x, c.y - b.y) / 2,
    )
    const u = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }
    const v = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) }
    d += ` L${b.x - u.x * r},${b.y - u.y * r} Q${b.x},${b.y} ${b.x + v.x * r},${b.y + v.y * r}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last.x},${last.y}`
}

/** Points along the rounded path, for testing it against card boxes (corners are cut inside the
 * polyline's own bend, so the polyline itself is the conservative bound). */
export function sampleLine(points: Pt[], every = 4): Pt[] {
  const out: Pt[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / every))
    for (let k = 1; k <= n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return out
}

/** Right edge of the widest card whose right edge lies in [from, to]: the near side of a gap. */
function rightEdgeIn(cards: Rect[], from: number, to: number): number {
  let right = from
  for (const c of cards) {
    const r = c.x + c.w
    if (r >= from - 1 && r <= to) right = Math.max(right, r)
  }
  return right
}

/** Control points of the route for a link, orthogonal with corners left for `roundedPath`. For
 * the outer arc `s` is the source's right edge and `t` the target's left edge; for a near loop
 * `s` is the source's left edge and `t` the target's right edge. */
export function routePoints(s: Pt, t: Pt, scene: RouteScene, lane: Lane, channelY?: number): Pt[] {
  const { cards, headers } = scene
  if (lane.near) {
    const gapLeft = rightEdgeIn(cards, t.x, s.x - 2)
    const room = s.x - gapLeft
    const mid = gapLeft + room / 2
    const gx =
      mid +
      (lane.sourceSlot - (lane.sourceCount - 1) / 2) * Math.min(step(lane.sourceCount), room / 4)
    return [s, { x: gx, y: s.y }, { x: gx, y: t.y }, t]
  }
  const sourceRight = widestRightInColumn(cards, s.x)
  const sx = sourceRight + CLEAR + lane.sourceSlot * step(lane.sourceCount)
  const tx = t.x - CLEAR - lane.targetSlot * step(lane.targetCount)
  const top = Math.min(...cards.map((c) => c.y), ...headers.map((h) => h.y))
  const bottom = Math.max(...cards.map((c) => c.y + c.h))
  const y =
    channelY ??
    (lane.above
      ? top - CORRIDOR_MARGIN - lane.corridorSlot * CORRIDOR_STEP
      : bottom + CORRIDOR_MARGIN + lane.corridorSlot * CORRIDOR_STEP)
  return [s, { x: sx, y: s.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: t.y }, t]
}

/** The ends of a forward skip link, as `assignChannels` needs them. */
export interface ChannelLink {
  id: string
  sx: number
  sy: number
  tx: number
  ty: number
}

/** A free band between card rows must be at least this tall to carry a line. */
export const CHANNEL_MIN = 14
/** A line keeps this far inside its band, off the cards on either side. */
const CHANNEL_EDGE = 6

/** Gives every forward skip link a horizontal channel through the columns it skips: a free band
 * between card rows, as near the middle of the link as one exists, so the link stays short and
 * straight instead of climbing to the corridor above the map. Links that land in the same band
 * are spread across it in target order, so their lines run side by side and never overlap. Card
 * rows and section header bars both block a band. */
export function assignChannels(
  links: ChannelLink[],
  cards: Rect[],
  headers: Rect[] = [],
): Map<string, number> {
  const obstacles = [...cards, ...headers]
  const chosen = new Map<string, { link: ChannelLink; lo: number; hi: number; mid: number }[]>()
  for (const link of links) {
    const from = widestRightInColumn(cards, link.sx) + CLEAR
    const to = link.tx - CLEAR
    const blocked = obstacles
      .filter((c) => c.x < to && c.x + c.w > from)
      .map((c) => [c.y - CLEAR, c.y + c.h + CLEAR] as const)
      .sort((a, b) => a[0] - b[0])
    const bands: [number, number][] = []
    let cursor = -Infinity
    for (const [top, bottom] of blocked) {
      if (top > cursor) bands.push([cursor, top])
      cursor = Math.max(cursor, bottom)
    }
    bands.push([cursor, Infinity])
    const mid = (link.sy + link.ty) / 2
    const fits = bands
      .filter(([a, b]) => b - a >= CHANNEL_MIN)
      .map(([a, b]) => ({ lo: a + CHANNEL_EDGE, hi: b - CHANNEL_EDGE }))
      .map((band) => ({ ...band, y: Math.min(band.hi, Math.max(band.lo, mid)) }))
      .sort((p, q) => Math.abs(p.y - mid) - Math.abs(q.y - mid))
    if (fits.length === 0) continue
    const key = `${fits[0].lo}|${fits[0].hi}`
    chosen.set(key, [...(chosen.get(key) ?? []), { link, lo: fits[0].lo, hi: fits[0].hi, mid }])
  }

  const channels = new Map<string, number>()
  for (const members of chosen.values()) {
    members.sort((a, b) => a.link.ty - b.link.ty || a.link.sy - b.link.sy)
    const { lo, hi } = members[0]
    const n = members.length
    const spacing = n > 1 ? Math.min(MAX_STEP, (hi - lo) / (n - 1)) : 0
    const centre = members.reduce((sum, m) => sum + m.mid, 0) / n
    const span = (n - 1) * spacing
    const first = Math.min(hi - span, Math.max(lo, centre - span / 2))
    members.forEach((m, i) => channels.set(m.link.id, first + i * spacing))
  }
  return channels
}

/** Right edge of the column a source card sits in (the widest card sharing its left edge), so a
 * line leaves into the gap even when the card is narrower than its column. */
function widestRightInColumn(cards: Rect[], sourceRight: number): number {
  const source = cards.find((c) => Math.abs(c.x + c.w - sourceRight) < 1)
  if (!source) return sourceRight
  let right = sourceRight
  for (const c of cards) if (Math.abs(c.x - source.x) < 1) right = Math.max(right, c.x + c.w)
  return right
}
