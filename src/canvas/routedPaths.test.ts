import { describe, expect, it } from 'vitest'
import { buildFlow } from './buildFlow'
import { CARD_ANCHOR_Y } from './anchors'
import { arcPoints, sampleSmooth, type Rect } from './edgeRouting'
import { statusQuoMetacrisis } from '../templates'
import { SECTION_HEADER_HEIGHT } from '../layout/columns'

/** Cards have no measured height outside the browser; a generous one makes the check stricter
 * for the corridor below the map and leaves the vertical runs (which don't depend on it) as is. */
const CARD_HEIGHT = 140

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

function inside(box: Rect, p: { x: number; y: number }): boolean {
  return p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h
}

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

  it('routes the column-skipping links and the Climate breakdown to Felt safety loop', () => {
    expect(routed.length).toBeGreaterThan(0)
    expect(routed.some((e) => e.source === 'outcome-climate-breakdown')).toBe(true)
  })

  it('no routed path passes through or behind a card', () => {
    for (const edge of routed) {
      const source = nodes.find((n) => n.id === edge.source)!
      const target = nodes.find((n) => n.id === edge.target)!
      const s = rect(source)
      const t = rect(target)
      const points = arcPoints(
        { x: s.x + s.w, y: s.y + CARD_ANCHOR_Y },
        { x: t.x, y: t.y + CARD_ANCHOR_Y },
        { cards, headers },
        0,
      )
      for (const p of sampleSmooth(points)) {
        // The first and last bits sit on the endpoint cards' own edges.
        const own = [s, t].some((r) => Math.abs(p.x - r.x) < 1 || Math.abs(p.x - (r.x + r.w)) < 1)
        for (const card of cards) {
          if (own && (card === s || card === t)) continue
          expect(inside(card, p), `${edge.id} crosses a card at ${p.x},${p.y}`).toBe(false)
        }
      }
    }
  })
})
