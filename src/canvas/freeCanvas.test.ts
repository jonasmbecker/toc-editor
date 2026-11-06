import { describe, expect, it } from 'vitest'
import type { DocumentNode, ToCDocument } from '../model/schema'
import { buildFlow, freeRoute } from './buildFlow'
import { layoutDocument, FREE_PARK_GAP } from '../layout/columns'
import { moveNodeFreely, nodeAt } from '../state/nodes'
import { makeDocument, makeNode } from '../test/fixtures'
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_IN_HANDLE,
  LOOP_OUT_HANDLE,
  STACK_DOWN_IN_HANDLE,
  STACK_DOWN_OUT_HANDLE,
  STACK_UP_IN_HANDLE,
  STACK_UP_OUT_HANDLE,
} from './CardNode'

/** A card at its own x and y. */
function at(id: string, x: number, y: number, targets: string[] = []): DocumentNode {
  return {
    ...makeNode(
      id,
      targets.map((targetId) => ({ targetId })),
      { width: 200, yPosition: y },
    ),
    xPosition: x,
  }
}

/** A three-card loop: a → b → c → a, drawn as a triangle. */
function loopMap(): ToCDocument {
  return {
    ...makeDocument([at('a', 0, 0, ['b']), at('b', 600, 0, ['c'])], [at('c', 300, 400, ['a'])]),
    layoutMode: 'free',
  }
}

describe('free-canvas layout', () => {
  it('puts every card at its stored x and y, with no headers or bands', () => {
    const layout = layoutDocument(loopMap())
    const byId = new Map(layout.nodes.map((n) => [n.nodeId, n]))
    expect(byId.get('a')).toMatchObject({ x: 0, y: 0 })
    expect(byId.get('b')).toMatchObject({ x: 600, y: 0 })
    expect(byId.get('c')).toMatchObject({ x: 300, y: 400 })
    expect(layout.sectionHeaders).toEqual([])
    expect(layout.bands).toEqual([])
  })

  it('parks a card with no x in a row under the lowest placed card', () => {
    const doc = loopMap()
    doc.sections[1].columns[0].nodes.push(makeNode('new', [], { width: 200 }))
    doc.sections[1].columns[0].nodes.push(makeNode('newer', [], { width: 200 }))
    const byId = new Map(layoutDocument(doc).nodes.map((n) => [n.nodeId, n]))
    expect(byId.get('new')!.y).toBeGreaterThan(400)
    expect(byId.get('new')!.x).toBe(0)
    expect(byId.get('newer')!.x).toBe(200 + FREE_PARK_GAP)
    expect(byId.get('newer')!.y).toBe(byId.get('new')!.y)
  })

  it('a band section is just cards in free mode', () => {
    const doc = loopMap()
    doc.sections[1] = { ...doc.sections[1], display: 'band' }
    const layout = layoutDocument(doc)
    expect(layout.bands).toEqual([])
    expect(layout.nodes.find((n) => n.nodeId === 'c')).toMatchObject({ x: 300, y: 400 })
  })

  it('a stage map without layoutMode is laid out in columns as before', () => {
    const doc = loopMap()
    delete doc.layoutMode
    const layout = layoutDocument(doc)
    expect(layout.sectionHeaders).toHaveLength(2)
    // Stored x is ignored: both first-section cards share the column's x.
    const xs = layout.nodes.filter((n) => n.sectionIndex === 0).map((n) => n.x)
    expect(new Set(xs).size).toBe(1)
  })
})

describe('free-canvas links', () => {
  it('draws every link as a plain curve, with no lanes and no column tint', () => {
    const graph = buildFlow(loopMap())
    expect(graph.nodes.some((n) => n.type === 'sectionHeader')).toBe(false)
    expect(graph.edges).toHaveLength(3)
    for (const e of graph.edges) {
      expect(e.type).toBe('connection')
      expect(e.data?.lane).toBeUndefined()
      expect(e.data?.tint).toBeUndefined()
    }
  })

  it('leaves and enters by the facing sides, so the loop reads as a loop', () => {
    const edges = new Map(buildFlow(loopMap()).edges.map((e) => [`${e.source}>${e.target}`, e]))
    // a → b: b is to the right.
    expect(edges.get('a>b')).toMatchObject({
      sourceHandle: FLOW_OUT_HANDLE,
      targetHandle: FLOW_IN_HANDLE,
    })
    // b → c: c is below.
    expect(edges.get('b>c')).toMatchObject({
      sourceHandle: STACK_DOWN_OUT_HANDLE,
      targetHandle: STACK_DOWN_IN_HANDLE,
    })
    // c → a: a is above.
    expect(edges.get('c>a')).toMatchObject({
      sourceHandle: STACK_UP_OUT_HANDLE,
      targetHandle: STACK_UP_IN_HANDLE,
    })
  })

  it('a target to the left is entered from its right side', () => {
    const route = freeRoute({ x: 600, y: 0, width: 200 }, { x: 0, y: 20, width: 200 })
    expect(route).toBe('free-left')
    const doc: ToCDocument = {
      ...makeDocument([at('r', 600, 0, ['l']), at('l', 0, 20)]),
      layoutMode: 'free',
    }
    const edge = buildFlow(doc).edges[0]
    expect(edge).toMatchObject({ sourceHandle: LOOP_OUT_HANDLE, targetHandle: LOOP_IN_HANDLE })
  })
})

describe('moving a card on a free canvas', () => {
  it('stores x and y, rounded to whole pixels', () => {
    const moved = moveNodeFreely(loopMap(), 'c', 120.6, 333.2)
    expect(nodeAt(moved, 'c')).toMatchObject({ xPosition: 121, yPosition: 333 })
  })

  it('a drop where the card already was returns the same document (no undo step)', () => {
    const doc = loopMap()
    expect(moveNodeFreely(doc, 'a', 0, 0)).toBe(doc)
  })

  it('the moved card is drawn where it was dropped', () => {
    const moved = moveNodeFreely(loopMap(), 'c', -250, 900)
    const card = buildFlow(moved).nodes.find((n) => n.id === 'c')!
    expect(card.position).toEqual({ x: -250, y: 900 })
  })
})

describe('free-canvas regions', () => {
  it('draws one region per titled section, around its cards', () => {
    const graph = buildFlow(loopMap())
    const regions = graph.nodes.filter((n) => n.type === 'region')
    expect(regions.map((r) => r.id)).toEqual(['region-0', 'region-1'])
    const first = regions[0]
    // Cards a (0,0) and b (600,0), each 200 wide.
    expect(first.position.x).toBeLessThan(0)
    expect(first.position.y).toBeLessThan(0)
    expect(first.position.x + first.width!).toBeGreaterThan(800)
    expect(first.data).toMatchObject({ title: 'S1', count: 2, memberIds: ['a', 'b'] })
  })

  it('draws no region for an untitled section', () => {
    const doc = loopMap()
    doc.sections[1] = { ...doc.sections[1], title: '  ' }
    const ids = buildFlow(doc)
      .nodes.filter((n) => n.type === 'region')
      .map((n) => n.id)
    expect(ids).toEqual(['region-0'])
  })

  it('draws no region when the map has one section', () => {
    const doc: ToCDocument = {
      ...makeDocument([at('a', 0, 0, ['b']), at('b', 600, 0)]),
      layoutMode: 'free',
    }
    expect(buildFlow(doc).nodes.some((n) => n.type === 'region')).toBe(false)
  })

  it('a stage map has no regions', () => {
    const doc = loopMap()
    delete doc.layoutMode
    expect(buildFlow(doc).nodes.some((n) => n.type === 'region')).toBe(false)
  })

  it('cards on a free canvas know it, so they show a link dot on every side', () => {
    const card = buildFlow(loopMap()).nodes.find((n) => n.id === 'a')!
    expect(card.data).toMatchObject({ free: true })
    const doc = loopMap()
    delete doc.layoutMode
    expect(buildFlow(doc).nodes.find((n) => n.id === 'a')!.data).not.toHaveProperty('free')
  })
})
