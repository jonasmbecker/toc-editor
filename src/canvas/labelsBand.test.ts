import { describe, expect, it } from 'vitest'
import { parseDocument, type DocumentNode, type ToCDocument } from '../model/schema'
import { buildFlow } from './buildFlow'
import { bundleLabels, labelCounts } from './linkLabels'
import {
  layoutDocument,
  HEADER_CLEARANCE,
  BAND_GAP,
  SECTION_HEADER_HEIGHT,
} from '../layout/columns'
import { alignDocument, DEFAULT_CARD_HEIGHT } from '../layout/align'
import { resolveDropTarget } from './dragSnap'
import { toCompatibleJson } from '../files/export'
import { mergeDocument, splitDocument } from '../files/split'
import { allNodes } from '../state/tree'
import { extensionKeysIn, makeDocument, makeNode, readFixtureText } from '../test/fixtures'
import { LOOP_OUT_HANDLE, STACK_DOWN_IN_HANDLE, STACK_UP_OUT_HANDLE } from './CardNode'
import { CARD_ANCHOR_Y } from './anchors'
import { routePoints, sampleLine, type Rect } from './edgeRouting'

/**
 * The labels-band slice: the real metacrisis map with a time stage in front whose two cards link
 * into every need (labelled Wichtigkeit / Dringlichkeit, as Jonas's theory will), and the
 * Structures & Incentives section drawn as a band under the columns.
 */

const BAND = 'Structures & Incentives'

function timeCard(id: string, label: string, needs: string[]): DocumentNode {
  return makeNode(
    id,
    needs.map((targetId) => ({ targetId, label })),
    { width: 240 },
  )
}

function labelledMap(): ToCDocument {
  const parsed = parseDocument(
    JSON.parse(readFixtureText('theory-of-metacrisis-status-quo_v1.json')),
  )
  if (!parsed.ok) throw new Error(parsed.errors.join('; '))
  const doc = parsed.document
  const needs = doc.sections[0].columns.flatMap((c) => c.nodes.map((n) => n.id))
  const timeStage = {
    title: 'Why needs are unmet',
    columns: [
      {
        nodes: [
          timeCard('unmet-present', 'Wichtigkeit', needs),
          { ...timeCard('unmet-past', 'Dringlichkeit', needs), yPosition: 200 },
        ],
      },
    ],
  }
  const sections = doc.sections.map((s) => (s.title.startsWith(BAND) ? { ...s, display: 'band' as const } : s))
  return alignDocument({ ...doc, sections: [timeStage, ...sections] })
}

const doc = labelledMap()
const graph = buildFlow(doc)
const bandIndex = doc.sections.findIndex((s) => s.display === 'band')
const bandIds = new Set(doc.sections[bandIndex].columns.flatMap((c) => c.nodes.map((n) => n.id)))

describe('link labels', () => {
  it('the map parses with labels and a band, and keeps both on a split/merge round trip', () => {
    expect(parseDocument(doc).ok).toBe(true)
    const { content, layout } = splitDocument(doc)
    const merged = mergeDocument(content, layout)
    expect(merged.ok && merged.document).toEqual(doc)
  })

  it('draws one pill per bundle: two pills for twenty labelled links', () => {
    const pills = graph.edges.filter((e) => e.data?.labelBundle)
    expect(pills).toHaveLength(2)
    for (const pill of pills) {
      expect(pill.data!.labelBundle!.placement).toBe('source')
      expect(pill.data!.labelBundle!.members).toHaveLength(10)
    }
    expect(pills.map((p) => p.data!.labelBundle!.label).sort()).toEqual([
      'Dringlichkeit',
      'Wichtigkeit',
    ])
  })

  it('the legend lists each label with its link count', () => {
    const labels = allNodes(doc).flatMap((n) => n.connections.map((c) => c.label))
    expect(labelCounts(labels)).toEqual([
      { label: 'Wichtigkeit', count: 10 },
      { label: 'Dringlichkeit', count: 10 },
    ])
  })

  it('bundles a fan-in at the target, and a label nobody shares sits on the midpoint', () => {
    const link = (edgeId: string, source: string, target: string, label?: string) => ({
      edgeId,
      source,
      target,
      ref: { sourceId: source, index: 0 },
      label,
    })
    const bundles = bundleLabels([
      link('a', 'x', 't', 'Feeds'),
      link('b', 'y', 't', 'Feeds'),
      link('c', 'z', 'q', 'Alone'),
      link('d', 'z', 'r'),
    ])
    expect([...bundles.values()].map((b) => [b.label, b.placement, b.members.length])).toEqual([
      ['Feeds', 'target', 2],
      ['Alone', 'mid', 1],
    ])
  })

  it('the compatible export drops labels and the band, and still parses', () => {
    const out = toCompatibleJson(doc)
    expect(extensionKeysIn(out)).toEqual([])
    expect(parseDocument(out).ok).toBe(true)
    expect(out.sections.map((s) => s.title)).toEqual(doc.sections.map((s) => s.title))
  })
})

describe('band section', () => {
  const layout = layoutDocument(doc)

  it('is laid out as a full-width band, not a column section', () => {
    expect(layout.sectionHeaders.map((h) => h.title)).not.toContain(doc.sections[bandIndex].title)
    expect(layout.bands).toHaveLength(1)
    const [band] = layout.bands
    const columnsRight = Math.max(...layout.sectionHeaders.map((h) => h.x + h.width))
    expect(band.x).toBe(Math.min(...layout.sectionHeaders.map((h) => h.x)))
    expect(band.x + band.width).toBeGreaterThanOrEqual(columnsRight)
  })

  it('Tidy puts the band a gap below the lowest column card, and is idempotent', () => {
    const columnBottom = Math.max(
      ...layout.nodes.filter((n) => !n.inBand).map((n) => n.y + DEFAULT_CARD_HEIGHT),
    )
    expect(layout.bands[0].y).toBeGreaterThanOrEqual(columnBottom + BAND_GAP)
    for (const n of layout.nodes.filter((n) => n.inBand)) {
      expect(n.y).toBeGreaterThanOrEqual(layout.bands[0].y + HEADER_CLEARANCE)
    }
    expect(alignDocument(doc)).toBe(doc)
  })

  it('does not move column cards: Tidy places the columns as if the band were not there', () => {
    const withoutBand = {
      ...doc,
      sections: doc.sections.filter((_, i) => i !== bandIndex),
    }
    const tidied = alignDocument(withoutBand)
    const y = new Map(allNodes(tidied).map((n) => [n.id, n.yPosition]))
    for (const node of allNodes(doc)) {
      if (!bandIds.has(node.id)) expect(node.yPosition, node.id).toBe(y.get(node.id))
    }
  })

  it('band cards link normally: plain curves from their top edge, never column-routed', () => {
    const touching = graph.edges.filter((e) => bandIds.has(e.source) || bandIds.has(e.target))
    expect(touching.length).toBeGreaterThan(0)
    for (const e of touching) {
      expect(e.type).toBe('connection')
      if (bandIds.has(e.source) && !bandIds.has(e.target)) {
        expect(e.sourceHandle).toBe(STACK_UP_OUT_HANDLE)
      }
      if (bandIds.has(e.target) && !bandIds.has(e.source)) {
        expect(e.targetHandle).toBe(STACK_DOWN_IN_HANDLE)
      }
      expect(e.data?.lane).toBeUndefined()
    }
  })

  it('lays its cards side by side in rows that fit the band, without overlaps', () => {
    const cards = layout.nodes.filter((n) => n.inBand)
    const [band] = layout.bands
    const rows = new Map<number, typeof cards>()
    for (const n of cards) rows.set(n.y, [...(rows.get(n.y) ?? []), n])
    expect(rows.size).toBeLessThan(cards.length)
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x)
      sorted.slice(1).forEach((n, i) => expect(n.x).toBeGreaterThanOrEqual(sorted[i].x + sorted[i].width))
      expect(sorted.at(-1)!.x + sorted.at(-1)!.width).toBeLessThanOrEqual(band.x + band.width)
    }
  })

  it('leaves room above the band for the loops that arc below the columns', () => {
    const columnBottom = Math.max(
      ...layout.nodes.filter((n) => !n.inBand).map((n) => n.y + DEFAULT_CARD_HEIGHT),
    )
    const loops = graph.edges.filter(
      (e) => e.type === 'routed' && e.data?.lane && !e.data.lane.above && !e.data.lane.near,
    )
    expect(layout.bands[0].y - columnBottom).toBeGreaterThanOrEqual(BAND_GAP + 10 * loops.length - 10)
  })

  it('no routed line crosses the band: its header or its cards', () => {
    // Tidy and the check use the same generous card height, as routedPaths.test does.
    const HEIGHT = 140
    const heights = new Map(allNodes(doc).map((n) => [n.id, HEIGHT]))
    const tidied = alignDocument(doc, { heights })
    const g = buildFlow(tidied)
    const rect = (n: (typeof g.nodes)[number]): Rect => ({
      x: n.position.x,
      y: n.position.y,
      w: n.width ?? 0,
      h: n.type === 'group' ? (n.height ?? 0) : HEIGHT,
    })
    const boxes = new Map(g.nodes.map((n) => [n.id, rect(n)]))
    const isCard = (n: (typeof g.nodes)[number]) => n.type === 'card'
    const inBandCard = (n: (typeof g.nodes)[number]) => isCard(n) && Boolean(n.data.inBand)
    // The scene the canvas routes with: column cards and headers, never band cards.
    const scene = {
      cards: g.nodes.filter((n) => isCard(n) && !inBandCard(n)).map(rect),
      headers: g.nodes.filter((n) => n.type === 'sectionHeader').map((n) => ({ ...rect(n), h: SECTION_HEADER_HEIGHT })),
    }
    const [band] = layoutDocument(tidied).bands
    const obstacles = [
      ...g.nodes.filter(inBandCard).map(rect),
      { x: band.x, y: band.y, w: band.width, h: SECTION_HEADER_HEIGHT },
    ]
    const problems: string[] = []
    for (const edge of g.edges.filter((e) => e.type === 'routed')) {
      const s = boxes.get(edge.source)!
      const t = boxes.get(edge.target)!
      const near = edge.sourceHandle === LOOP_OUT_HANDLE
      const points = routePoints(
        { x: near ? s.x : s.x + s.w, y: s.y + CARD_ANCHOR_Y },
        { x: near ? t.x + t.w : t.x, y: t.y + CARD_ANCHOR_Y },
        scene,
        edge.data!.lane!,
      )
      for (const p of sampleLine(points)) {
        for (const o of obstacles) {
          if (p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h) {
            problems.push(`${edge.id} at ${Math.round(p.x)},${Math.round(p.y)}`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('draws one strip behind its cards', () => {
    const strips = graph.nodes.filter((n) => n.type === 'band')
    expect(strips).toHaveLength(1)
    expect(strips[0].data).toMatchObject({ count: bandIds.size })
  })

  it('a card dropped below the band header joins the band; above it, the columns', () => {
    const [band] = layout.bands
    expect(resolveDropTarget(doc, 400, band.y + 200).sectionIndex).toBe(bandIndex)
    expect(resolveDropTarget(doc, 400, band.y - 200).sectionIndex).not.toBe(bandIndex)
  })

  it('a band never tidied (cards at height 0) sits below the columns and does not take their drops', () => {
    const untidied = makeDocument([makeNode('a', [], { yPosition: 300 })], [makeNode('b')])
    untidied.sections[1].display = 'band'
    const l = layoutDocument(untidied)
    const a = l.nodes.find((n) => n.nodeId === 'a')!
    const b = l.nodes.find((n) => n.nodeId === 'b')!
    expect(l.bands[0].y).toBeGreaterThan(a.y)
    expect(b.y).toBe(l.bands[0].y + HEADER_CLEARANCE)
    expect(resolveDropTarget(untidied, a.x + 10, a.y).sectionIndex).toBe(0)
  })

  it("a group in the band's first row sits below the band header", () => {
    const group = { ...makeNode('g'), kind: 'group' }
    const members = [
      { ...makeNode('m1'), groupId: 'g' },
      { ...makeNode('m2'), groupId: 'g' },
    ]
    const withGroup = alignDocument(makeDocument([makeNode('a')], [group, ...members]))
    withGroup.sections[1].display = 'band'
    const tidied = alignDocument(withGroup)
    const l = layoutDocument(tidied)
    const frame = buildFlow(tidied).nodes.find((n) => n.id === 'g')!
    expect(frame.position.y).toBeGreaterThanOrEqual(l.bands[0].y + SECTION_HEADER_HEIGHT)
  })

  it('a document without a band lays out exactly as before', () => {
    const plain = makeDocument([makeNode('a')], [makeNode('b')])
    expect(layoutDocument(plain).bands).toEqual([])
    expect(alignDocument(plain)).toBe(alignDocument(alignDocument(plain)))
  })
})
