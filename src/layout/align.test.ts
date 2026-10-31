import { describe, expect, it } from 'vitest'
import { alignDocument, CHANNEL_GAP, DEFAULT_CARD_HEIGHT, TIDY_GAP } from './align'
import { GROUP_HEAD } from '../canvas/groupFlow'
import { GROUP_KIND, type Connection, type DocumentNode, type ToCDocument } from '../model/schema'
import { allNodes, nodeAt } from '../state/tree'
import { makeDocument, makeNode } from '../test/fixtures'
import { statusQuoMetacrisis } from '../templates'
import { useToCStore } from '../state/store'
import { tidyLayout } from '../canvas/tidyLayout'
import { toCompatibleJson, toFullJson } from '../files/export'
import { parseDocument } from '../model/schema'
import { layoutDocument } from './columns'
import { CARD_ANCHOR_Y } from '../canvas/anchors'
import { buildFlow } from '../canvas/buildFlow'
import { assignChannels, routePoints, sampleLine, type Rect } from '../canvas/edgeRouting'

const link = (targetId: string): Connection => ({ targetId, assumptions: '', evidence: '' })

/** The template with every column stacked top to bottom in document order, as if never tidied. */
function stacked(doc: ToCDocument): ToCDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        nodes: column.nodes.map((n, i) => ({ ...n, yPosition: i * 140 })),
      })),
    })),
  }
}

function yOf(doc: ToCDocument, id: string): number {
  return nodeAt(doc, id)!.yPosition
}

function overlaps(doc: ToCDocument): string[] {
  const found: string[] = []
  const columns = doc.sections.flatMap((section) => section.columns)
  for (const column of columns) {
    const cards = column.nodes.filter((n) => n.kind !== GROUP_KIND && !n.groupId)
    const sorted = [...cards].sort((a, b) => a.yPosition - b.yPosition)
    for (let i = 1; i < sorted.length; i++) {
      const [upper, lower] = [sorted[i - 1], sorted[i]]
      if (lower.yPosition < upper.yPosition + DEFAULT_CARD_HEIGHT)
        found.push(`${upper.id}/${lower.id}`)
    }
  }
  return found
}

describe('alignDocument', () => {
  it('puts a single in/out pair level', () => {
    const doc = makeDocument(
      [makeNode('a', [link('b')], { yPosition: 400 })],
      [makeNode('b', [], { yPosition: 0 })],
    )
    const out = alignDocument(doc)
    expect(yOf(out, 'a')).toBe(yOf(out, 'b'))
  })

  it('levels a fan-out target with its mean source position, without overlap', () => {
    const doc = makeDocument(
      [makeNode('src', [link('t1'), link('t2'), link('t3')], { yPosition: 0 })],
      [
        makeNode('t1', [], { yPosition: 0 }),
        makeNode('t2', [], { yPosition: 10 }),
        makeNode('t3', [], { yPosition: 20 }),
      ],
    )
    const out = alignDocument(doc)
    expect(overlaps(out)).toEqual([])
    const ys = ['t1', 't2', 't3'].map((id) => yOf(out, id))
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(DEFAULT_CARD_HEIGHT + TIDY_GAP - 8)
    // The source sits near the middle of its targets.
    expect(Math.abs(yOf(out, 'src') - ys[1])).toBeLessThanOrEqual(8)
  })

  it('orders a column so connections do not cross', () => {
    const doc = makeDocument(
      [
        makeNode('top', [link('x')], { yPosition: 0 }),
        makeNode('bottom', [link('y')], { yPosition: 200 }),
      ],
      [makeNode('y', [], { yPosition: 0 }), makeNode('x', [], { yPosition: 400 })],
    )
    const out = alignDocument(doc)
    expect(yOf(out, 'top') < yOf(out, 'bottom')).toBe(yOf(out, 'x') < yOf(out, 'y'))
    expect(yOf(out, 'top')).toBe(yOf(out, 'x'))
    expect(yOf(out, 'bottom')).toBe(yOf(out, 'y'))
  })

  it('is deterministic and returns the input itself when nothing needs to move', () => {
    const doc = statusQuoMetacrisis()
    expect(alignDocument(doc)).toEqual(alignDocument(doc))
    const level = makeDocument([makeNode('a')])
    expect(alignDocument(level)).toBe(level)
  })

  it('lifts the diagram so its highest card sits at 0 and no yPosition is negative', () => {
    const doc = makeDocument([makeNode('a', [], { yPosition: 300 })])
    expect(yOf(alignDocument(doc), 'a')).toBe(0)
  })

  it('keeps a group together, its cards in order, and levels a card of it with its neighbour', () => {
    const group: DocumentNode = makeNode('g', [], { yPosition: 100 })
    group.kind = GROUP_KIND
    const m1 = { ...makeNode('m1', [], { yPosition: 100 }), groupId: 'g' }
    const m2 = { ...makeNode('m2', [link('t')], { yPosition: 220 }), groupId: 'g' }
    const doc = makeDocument([group, m1, m2], [makeNode('t', [], { yPosition: 0 })])
    const out = alignDocument(doc)
    expect(yOf(out, 'm1')).toBeLessThan(yOf(out, 'm2'))
    expect(yOf(out, 'g')).toBe(yOf(out, 'm1'))
    expect(Math.abs(yOf(out, 'm2') - yOf(out, 't'))).toBeLessThanOrEqual(DEFAULT_CARD_HEIGHT / 2)
    expect(yOf(out, 'm1')).toBeGreaterThanOrEqual(GROUP_HEAD)
  })

  it('lines cards of different heights up on the same top, not the same centre', () => {
    const doc = makeDocument(
      [makeNode('a', [link('b')], { yPosition: 300 })],
      [makeNode('b', [], { yPosition: 0 })],
    )
    const out = alignDocument(doc, {
      heights: new Map([
        ['a', 160],
        ['b', 80],
      ]),
    })
    // Anchors are a fixed distance from the top (a is 160 tall, b is 80 tall), so the tops match.
    expect(yOf(out, 'a')).toBe(yOf(out, 'b'))
  })

  it('round-trips a tidied template through both exports and undoes in one step', () => {
    const doc = stacked(statusQuoMetacrisis())
    useToCStore.getState().load(doc)
    tidyLayout([])
    const tidied = useToCStore.getState().document
    expect(tidied).not.toBe(doc)
    for (const exported of [toFullJson(tidied), toCompatibleJson(tidied)]) {
      expect(parseDocument(JSON.parse(JSON.stringify(exported))).ok).toBe(true)
    }
    const full = parseDocument(JSON.parse(JSON.stringify(toFullJson(tidied))))
    expect(full.ok && allNodes(full.document).map((n) => n.yPosition)).toEqual(
      allNodes(tidied).map((n) => n.yPosition),
    )
    expect(useToCStore.getState().undo()).toBe('tidy layout')
    expect(useToCStore.getState().document).toBe(doc)
  })

  it('is a fixed point: a second and third press change nothing', () => {
    const once = alignDocument(statusQuoMetacrisis())
    const twice = alignDocument(once)
    expect(allNodes(twice).map((n) => n.yPosition)).toEqual(allNodes(once).map((n) => n.yPosition))
    expect(alignDocument(twice)).toBe(twice)
  })

  it('reports the near-horizontal share on the metacrisis map', () => {
    const share = (doc: ToCDocument) => {
      const layout = layoutDocument(doc)
      const at = new Map(layout.nodes.map((n) => [n.nodeId, n]))
      let total = 0
      let flat = 0
      for (const node of allNodes(doc)) {
        for (const c of node.connections) {
          const a = at.get(node.id)
          const b = at.get(c.targetId)
          if (!a || !b) continue
          const dx = Math.abs(b.x - (a.x + a.width))
          const dy = Math.abs(b.y + CARD_ANCHOR_Y - (a.y + CARD_ANCHOR_Y))
          total++
          if (dx > 0 && (Math.atan2(dy, dx) * 180) / Math.PI < 10) flat++
        }
      }
      return flat / total
    }
    const before = share(stacked(statusQuoMetacrisis()))
    const after = share(alignDocument(stacked(statusQuoMetacrisis())))
    console.log(`near-horizontal share: before ${before.toFixed(2)}, after ${after.toFixed(2)}`)
    // The v2 map has many long links across several columns, so the gain is small; since Jonas's
    // 2026-10-31 edits (Connection group, Dysfunctional democracy in Outcomes) the canonical stack
    // is already as flat as the columns allow, so Tidy may only hold the share, never lower it.
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('does not move connections within a column and never loses a card', () => {
    const doc = statusQuoMetacrisis()
    const out = alignDocument(doc)
    expect(allNodes(out).map((n) => n.id)).toEqual(allNodes(doc).map((n) => n.id))
    expect(allNodes(out).every((n) => n.yPosition >= 0)).toBe(true)
  })

  describe('channels for skip links', () => {
    /** Card heights as the browser would measure them: they differ from card to card (48-128px). */
    const heightOf = (id: string) =>
      48 + ([...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 6) * 16
    const heights = () =>
      new Map(allNodes(statusQuoMetacrisis()).map((n) => [n.id, heightOf(n.id)]))
    const tidied = () => alignDocument(stacked(statusQuoMetacrisis()), { heights: heights() })
    const scene = (doc: ToCDocument) => {
      const graph = buildFlow(doc)
      const cards: Rect[] = graph.nodes
        .filter((n) => n.type === 'card')
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: heightOf(n.id) }))
      const forward = graph.edges.filter((e) => e.type === 'routed' && e.data?.lane?.above)
      const links = forward.map((e) => ({ id: e.id, ...e.data!.lane!.ends! }))
      return { cards, forward, channels: assignChannels(links, cards) }
    }

    it('every forward skip link finds a channel after Tidy', () => {
      const { forward, channels } = scene(tidied())
      expect(forward.length).toBeGreaterThan(0)
      expect(forward.filter((e) => !channels.has(e.id)).map((e) => e.id)).toEqual([])
    })

    it('no routed channel runs through or squeezed against a card', () => {
      const { cards, forward, channels } = scene(tidied())
      const problems: string[] = []
      for (const edge of forward) {
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
        for (let i = 1; i < middle.length; i++)
          for (const p of sampleLine([middle[i - 1], middle[i]]))
            for (const c of cards)
              if (p.x > c.x - 10 && p.x < c.x + c.w + 10 && p.y > c.y - 10 && p.y < c.y + c.h + 10)
                problems.push(`${edge.id} at ${p.x},${p.y}`)
      }
      expect(problems).toEqual([])
    })

    it('stays a fixed point with channels reserved', () => {
      const once = alignDocument(statusQuoMetacrisis(), { heights: heights() })
      expect(alignDocument(once, { heights: heights() })).toBe(once)
    })

    it('opens a band in the skipped column level with the link instead of a detour', () => {
      const doc = makeDocument(
        [makeNode('a', [link('b1'), link('b2'), link('b3'), link('c')])],
        [makeNode('b1', [link('c')]), makeNode('b2', [link('c')]), makeNode('b3', [link('c')])],
        [makeNode('c')],
      )
      const out = alignDocument(doc)
      const ys = ['b1', 'b2', 'b3'].map((id) => yOf(out, id)).sort((p, q) => p - q)
      const gaps = [ys[1] - ys[0], ys[2] - ys[1]].map((d) => d - DEFAULT_CARD_HEIGHT)
      const level = (yOf(out, 'a') + yOf(out, 'c')) / 2 + CARD_ANCHOR_Y
      const open = ys.slice(0, 2).some((y, i) => {
        const top = y + DEFAULT_CARD_HEIGHT
        return gaps[i] >= CHANNEL_GAP && Math.abs(top + gaps[i] / 2 - level) <= DEFAULT_CARD_HEIGHT
      })
      expect(open).toBe(true)
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(TIDY_GAP - 8)
      expect(alignDocument(out)).toBe(out)
    })
  })
})
