import { describe, expect, it } from 'vitest'
import { buildFlow } from './buildFlow'
import { CARD_ANCHOR_Y, GROUP_ANCHOR_Y } from './anchors'
import { LOOP_OUT_HANDLE } from './CardNode'
import { assignChannels, routePoints, sampleLine, type Pt, type Rect } from './edgeRouting'
import { statusQuoMetacrisis } from '../templates'
import { SECTION_HEADER_HEIGHT } from '../layout/columns'

/** Cards have no measured height outside the browser; a generous one makes the check stricter
 * for the corridor below the map and leaves the vertical runs (which don't depend on it) as is. */
const CARD_HEIGHT = 140
/** Lines keep this far from any card edge, apart from where they leave or enter their own card. */
const CLEARANCE = 10

/** The metacrisis template plus the Climate breakdown → Felt safety loop (not in the template). */
function withFeedbackLoop() {
  const doc = statusQuoMetacrisis()
  const climate = doc.sections
    .flatMap((s) => s.columns.flatMap((c) => c.nodes))
    .find((n) => n.id === 'outcome-climate-breakdown')!
  climate.connections = [
    ...climate.connections.filter((c) => c.targetId !== 'need-brown-felt-safety'),
    { targetId: 'need-brown-felt-safety', isFeedbackLoop: true },
  ]
  return doc
}

function inside(box: Rect, p: Pt, margin = 0): boolean {
  return (
    p.x > box.x - margin &&
    p.x < box.x + box.w + margin &&
    p.y > box.y - margin &&
    p.y < box.y + box.h + margin
  )
}

/** The links that skip a column and were hardest to trace on the map (skip-links slice). */
const TEST_LINKS = [
  'group-consumerism->outcome-climate-breakdown',
  'group-consumerism->outcome-pollution',
  'group-consumerism->outcome-resource-depletion',
  'driver-patriarchy-sexism->outcome-sexual-assault',
]

describe('skip links threaded through the skipped columns', () => {
  /** About what a two-line card measures in the browser. */
  const HEIGHT = 56
  const graph = buildFlow(withFeedbackLoop())
  const cards: Rect[] = graph.nodes
    .filter((n) => n.type === 'card')
    .map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: HEIGHT }))
  const forward = graph.edges.filter((e) => e.type === 'routed' && e.data?.lane?.ends)
  const links = forward
    .filter((e) => e.data!.lane!.above)
    .map((e) => ({ id: e.id, ...e.data!.lane!.ends! }))
  const channels = assignChannels(links, cards)
  const test = TEST_LINKS.map((prefix) => forward.find((e) => e.id.startsWith(prefix))!)

  it('finds the test links', () => {
    expect(test.every(Boolean)).toBe(true)
  })

  it('every test link gets a channel and its own colour', () => {
    for (const edge of test) expect(channels.has(edge.id)).toBe(true)
    const colours = test.map((e) => e.data!.tint)
    expect(colours.every(Boolean)).toBe(true)
    expect(new Set(colours).size).toBe(colours.length)
  })

  it('test links in the same band run at least 3px apart', () => {
    const ys = test.map((e) => channels.get(e.id)!).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(3)
  })

  it('a channel never runs through a card, and keeps clear of card edges', () => {
    const problems: string[] = []
    for (const edge of test) {
      const lane = edge.data!.lane!
      const { sx, sy, tx, ty } = lane.ends!
      const points = routePoints(
        { x: sx, y: sy },
        { x: tx, y: ty },
        { cards, headers: [] },
        lane,
        channels.get(edge.id),
      )
      const middle = points.slice(1, -1)
      for (let i = 1; i < middle.length; i++) {
        for (const p of sampleLine([middle[i - 1], middle[i]])) {
          for (const card of cards) {
            if (inside(card, p, 10)) problems.push(`${edge.id} too close at ${p.x},${p.y}`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('a channel keeps out of the section header bars', () => {
    const column: Rect[] = [{ x: 100, y: 100, w: 100, h: 50 }]
    const headers: Rect[] = [{ x: 100, y: 0, w: 100, h: 60 }]
    const link = { id: 'x', sx: 0, sy: 20, tx: 300, ty: 40 }
    const y = assignChannels([link], column, headers).get('x')!
    expect(y > 71 || y < -11).toBe(true)
  })
})

describe('routed connections on the metacrisis map', () => {
  const graph = buildFlow(withFeedbackLoop())
  const nodes = graph.nodes.filter((n) => n.type === 'card' || n.type === 'group')
  const rect = (n: (typeof nodes)[number]): Rect => ({
    x: n.position.x,
    y: n.position.y,
    w: n.width ?? 0,
    h: n.type === 'group' ? (n.height ?? 0) : CARD_HEIGHT,
  })
  const cards = graph.nodes.filter((n) => n.type === 'card').map((n) => rect(n as never))
  const headers = graph.nodes
    .filter((n) => n.type === 'sectionHeader')
    .map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: SECTION_HEADER_HEIGHT }))
  const routed = graph.edges.filter((e) => e.type === 'routed')

  /** Control points of one routed edge, as the canvas would draw them. */
  function pointsOf(edge: (typeof routed)[number]) {
    const source = nodes.find((n) => n.id === edge.source)!
    const target = nodes.find((n) => n.id === edge.target)!
    const s = rect(source)
    const t = rect(target)
    const anchor = (n: typeof source) => (n.type === 'group' ? GROUP_ANCHOR_Y : CARD_ANCHOR_Y)
    const near = edge.sourceHandle === LOOP_OUT_HANDLE
    return {
      source: s,
      target: t,
      points: routePoints(
        { x: near ? s.x : s.x + s.w, y: s.y + anchor(source) },
        { x: near ? t.x + t.w : t.x, y: t.y + anchor(target) },
        { cards, headers },
        edge.data!.lane!,
      ),
    }
  }

  it('routes the column-skipping links and the Climate breakdown to Felt safety loop', () => {
    expect(routed.length).toBeGreaterThan(0)
    expect(routed.some((e) => e.source === 'outcome-climate-breakdown')).toBe(true)
    expect(routed.every((e) => e.data?.lane)).toBe(true)
  })

  it('no routed path passes through or behind a card, and keeps clear of card edges', () => {
    const problems: string[] = []
    for (const edge of routed) {
      const { source, target, points } = pointsOf(edge)
      // The first and last segment join the endpoint cards, so they are allowed to touch them.
      const middle = points.slice(1, -1)
      for (let i = 1; i < middle.length; i++) {
        for (const p of sampleLine([middle[i - 1], middle[i]])) {
          for (const card of cards) {
            if (card === source || card === target) continue
            if (inside(card, p, CLEARANCE)) problems.push(`${edge.id} too close at ${p.x},${p.y}`)
          }
        }
      }
      for (const p of sampleLine(points)) {
        for (const card of cards) {
          if (card === source || card === target) continue
          if (inside(card, p)) problems.push(`${edge.id} crosses a card at ${p.x},${p.y}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('a loop between adjacent columns stays a compact curve in the gap', () => {
    const near = routed.filter((e) => e.data!.lane!.near)
    expect(near.length).toBeGreaterThan(0)
    for (const edge of near) {
      const { points } = pointsOf(edge)
      const ys = points.map((p) => p.y)
      const top = Math.min(points[0].y, points[points.length - 1].y)
      const bottom = Math.max(points[0].y, points[points.length - 1].y)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(top)
      expect(Math.max(...ys)).toBeLessThanOrEqual(bottom)
    }
  })

  it('every outer arc has its own corridor, so lines never share a path', () => {
    const outer = routed.filter((e) => !e.data!.lane!.near)
    const keys = outer.map((e) => `${e.data!.lane!.above}:${e.data!.lane!.corridorSlot}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
