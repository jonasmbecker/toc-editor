import { describe, expect, it } from 'vitest'
import { alignDocument } from './align'
import {
  CANVAS_MARGIN,
  HEADER_CLEARANCE,
  ROW_GAP,
  ROW_LABEL_WIDTH,
  layoutDocument,
} from './columns'
import { importFromJson } from '../files/import'
import { buildFlow } from '../canvas/buildFlow'
import { assignChannels, routePoints, sampleLine, type Rect } from '../canvas/edgeRouting'
import { resolveDropTarget } from '../canvas/dragSnap'
import type { ToCDocument } from '../model/schema'
import { statusQuoMetacrisis } from '../templates'
import { allNodes } from '../state/tree'
import { COM_B_DRAFT_FIXTURE, readFixtureText } from '../test/fixtures'

/** The matrix map: three COM-B rows against one shared spine. */

function draft(): ToCDocument {
  const result = importFromJson(JSON.parse(readFixtureText(COM_B_DRAFT_FIXTURE)))
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

/** Card heights as a browser might measure them (48-128px), as in align.test. */
const heightOf = (id: string) => 48 + ([...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 6) * 16
const heights = (doc: ToCDocument) => new Map(allNodes(doc).map((n) => [n.id, heightOf(n.id)]))
const tidy = (doc: ToCDocument) => alignDocument(doc, { heights: heights(doc) })

const rowCards = (doc: ToCDocument, row: string) =>
  doc.sections.filter((s) => s.row === row).flatMap((s) => s.columns.flatMap((c) => c.nodes))

describe('matrix layout', () => {
  it('starts every row after the label gutter and the spine right of the widest row', () => {
    const layout = layoutDocument(draft())
    const rowHeaders = layout.sectionHeaders.filter((h) => h.row !== undefined)
    const spineHeaders = layout.sectionHeaders.filter((h) => h.row === undefined)
    for (const row of ['capability', 'opportunity', 'motivation']) {
      const first = rowHeaders.find((h) => h.row === row)!
      expect(first.x).toBe(CANVAS_MARGIN + ROW_LABEL_WIDTH)
    }
    const widestRow = Math.max(...layout.rowBands.map((b) => b.right))
    expect(spineHeaders[0].x).toBeGreaterThan(widestRow)
    expect(spineHeaders.every((h) => h.y === 0)).toBe(true)
    expect(layout.rowBands.map((b) => b.rowId)).toEqual(['capability', 'opportunity', 'motivation'])
  })

  it('lays a flat map out exactly as before: no bands, headers on top', () => {
    const layout = layoutDocument(statusQuoMetacrisis())
    expect(layout.rowBands).toEqual([])
    expect(layout.sectionHeaders.every((h) => h.y === 0 && h.row === undefined)).toBe(true)
    expect(layout.sectionHeaders[0].x).toBe(CANVAS_MARGIN)
  })

  describe('after Tidy', () => {
    const doc = tidy(draft())

    it('stacks the rows without overlap, with room for the next row header', () => {
      const bottoms: number[] = []
      for (const row of ['capability', 'opportunity', 'motivation']) {
        const cards = rowCards(doc, row)
        const top = Math.min(...cards.map((n) => n.yPosition))
        if (bottoms.length > 0)
          expect(top).toBeGreaterThanOrEqual(bottoms[bottoms.length - 1] + ROW_GAP)
        bottoms.push(Math.max(...cards.map((n) => n.yPosition + heightOf(n.id))))
      }
    })

    it('puts each row header above its own first card and below the row before it', () => {
      const layout = layoutDocument(doc)
      for (const band of layout.rowBands) {
        const firstCardY = Math.min(...rowCards(doc, band.rowId).map((n) => n.yPosition))
        expect(band.top + HEADER_CLEARANCE).toBe(HEADER_CLEARANCE + firstCardY)
      }
    })

    it('is a fixed point', () => {
      expect(tidy(doc)).toBe(doc)
    })

    it('keeps every card in its section and row', () => {
      const before = draft()
      const where = (d: ToCDocument) =>
        d.sections.map((s) => [s.row, s.columns.map((c) => c.nodes.map((n) => n.id))])
      expect(where(doc)).toEqual(where(before))
    })

    it('routes forward skip links through channels that cross no card', () => {
      const graph = buildFlow(doc)
      const cards: Rect[] = graph.nodes
        .filter((n) => n.type === 'card')
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: heightOf(n.id) }))
      const headers: Rect[] = graph.nodes
        .filter((n) => n.type === 'sectionHeader')
        .map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }))
      const forward = graph.edges.filter((e) => e.type === 'routed' && e.data?.lane?.above)
      const channels = assignChannels(
        forward.map((e) => ({ id: e.id, ...e.data!.lane!.ends! })),
        cards,
        headers,
      )
      expect(forward.length).toBeGreaterThan(0)
      expect(forward.filter((e) => !channels.has(e.id)).map((e) => e.id)).toEqual([])
      const problems: string[] = []
      for (const edge of forward) {
        const lane = edge.data!.lane!
        const { sx, sy, tx, ty } = lane.ends!
        const points = routePoints(
          { x: sx, y: sy },
          { x: tx, y: ty },
          { cards, headers },
          lane,
          channels.get(edge.id),
        )
        const middle = points.slice(1, -1)
        for (let i = 1; i < middle.length; i++)
          for (const p of sampleLine([middle[i - 1], middle[i]]))
            for (const c of [...cards, ...headers])
              if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h)
                problems.push(`${edge.id} at ${Math.round(p.x)},${Math.round(p.y)}`)
      }
      expect(problems).toEqual([])
    })
  })

  it('drops a card into the row under the pointer, not the first row at that x', () => {
    const doc = tidy(draft())
    const layout = layoutDocument(doc)
    const opportunity = layout.rowBands.find((b) => b.rowId === 'opportunity')!
    const x = CANVAS_MARGIN + ROW_LABEL_WIDTH + 20
    const target = resolveDropTarget(doc, x, opportunity.top + HEADER_CLEARANCE + 10)
    expect(doc.sections[target.sectionIndex].row).toBe('opportunity')
    const capability = layout.rowBands[0]
    const top = resolveDropTarget(doc, x, capability.top + HEADER_CLEARANCE + 10)
    expect(doc.sections[top.sectionIndex].row).toBe('capability')
  })
})

describe('an empty row', () => {
  it('keeps its header band clear of the rows above and below after Tidy', () => {
    const doc = draft()
    const emptied = {
      ...doc,
      sections: doc.sections.map((s) =>
        s.row === 'opportunity' ? { ...s, columns: [{ nodes: [] }] } : s,
      ),
    }
    // Links into the removed cards would dangle; drop them so the map stays valid.
    const ids = new Set(allNodes(emptied).map((n) => n.id))
    const clean = {
      ...emptied,
      sections: emptied.sections.map((s) => ({
        ...s,
        columns: s.columns.map((c) => ({
          ...c,
          nodes: c.nodes.map((n) => ({
            ...n,
            connections: n.connections.filter((x) => ids.has(x.targetId)),
          })),
        })),
      })),
    }
    const tidied = tidy(clean)
    const bands = layoutDocument(tidied).rowBands
    const capabilityBottom = Math.max(
      ...rowCards(tidied, 'capability').map((n) => HEADER_CLEARANCE + n.yPosition + heightOf(n.id)),
    )
    const motivationTop = Math.min(...rowCards(tidied, 'motivation').map((n) => n.yPosition))
    expect(bands[1].top).toBeGreaterThan(capabilityBottom - HEADER_CLEARANCE)
    expect(motivationTop).toBeGreaterThanOrEqual(bands[1].top + ROW_GAP)
    expect(tidy(tidied)).toBe(tidied)
  })
})
