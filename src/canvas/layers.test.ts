import { describe, expect, it } from 'vitest'
import { buildFlow } from './buildFlow'
import { pathHighlight } from './selection'
import { ROW_COLORS, rowOfNode } from './layers'
import { cachedLayerFirst, withLayerFirst } from '../layout/layerFirst'
import { layoutDocument, ROW_GAP } from '../layout/columns'
import { alignDocument } from '../layout/align'
import { comBMatrixDraft, statusQuoMetacrisis } from '../templates'
import { makeDocument, makeNode } from '../test/fixtures'
import { allNodes } from '../state/tree'

const link = (targetId: string) => ({ targetId })

describe('matrix view', () => {
  const doc = comBMatrixDraft()
  const rows = rowOfNode(doc)

  it('opens the bundled draft as a version 2 matrix with three rows', () => {
    expect(doc.version).toBe(2)
    expect(doc.rows?.map((r) => r.id)).toEqual(['capability', 'opportunity', 'motivation'])
    // Baked with heights measured in the browser: each row starts below the one above it.
    const tops = (doc.rows ?? []).map((row) =>
      allNodes({ ...doc, sections: doc.sections.filter((s) => s.row === row.id) }).map(
        (n) => n.yPosition,
      ),
    )
    for (let r = 1; r < tops.length; r++) {
      expect(Math.min(...tops[r])).toBeGreaterThan(Math.max(...tops[r - 1]) + ROW_GAP)
    }
  })

  it('draws one band per row and colours forward links by the layer they leave', () => {
    const graph = buildFlow(doc)
    const bands = graph.nodes.filter((n) => n.type === 'rowBand')
    expect(bands.map((b) => b.id)).toEqual(['row-capability', 'row-opportunity', 'row-motivation'])
    const fromCapability = graph.edges.filter(
      (e) => rows.get(e.source) === 'capability' && !e.data?.backward && !e.data?.isFeedbackLoop,
    )
    expect(fromCapability.length).toBeGreaterThan(0)
    expect(fromCapability.every((e) => e.data?.tint === ROW_COLORS.capability)).toBe(true)
  })

  it('marks the links from the drivers back into the left half as backward, uncoloured', () => {
    const back = buildFlow(doc).edges.filter((e) => e.data?.backward)
    // The designer counted 9 driver arrows into the left half; at least those point back.
    const intoRows = back.filter((e) => !rows.has(e.source) && rows.has(e.target))
    expect(intoRows.length).toBeGreaterThanOrEqual(9)
    expect(back.every((e) => e.data?.tint === undefined)).toBe(true)
  })

  it('with a layer chosen, shows only its links and fades the other rows', () => {
    const all = buildFlow(doc).edges
    const graph = buildFlow(doc, { activeRow: 'opportunity' })
    expect(graph.edges.length).toBeLessThan(all.length)
    for (const edge of graph.edges) {
      for (const end of [edge.source, edge.target]) {
        expect([undefined, 'opportunity']).toContain(rows.get(end))
      }
    }
    const ghosts = graph.nodes.filter((n) => n.className === 'toc-ghost').map((n) => n.id)
    expect(new Set(ghosts)).toEqual(
      new Set([...rows].filter(([, row]) => row !== 'opportunity').map(([id]) => id)),
    )
    const capability = graph.nodes.find((n) => n.id === 'row-capability')!
    expect(capability.data).toMatchObject({ active: false })
    expect((capability.data as { hidden: number }).hidden).toBeGreaterThan(0)
  })

  it('moves the chosen layer to the top and leaves the stored document alone', () => {
    const before = JSON.stringify(doc)
    const view = withLayerFirst(doc, 'motivation')
    expect(JSON.stringify(doc)).toBe(before)
    expect(layoutDocument(view).rowBands.map((b) => b.rowId)).toEqual([
      'motivation',
      'capability',
      'opportunity',
    ])
    expect(view.sections.map((s) => s.title)).toEqual(doc.sections.map((s) => s.title))
    const ids = (d: typeof doc) => allNodes(d).map((n) => n.id)
    expect(ids(view)).toEqual(ids(doc))
  })

  it('lines the spine up with the chosen layer: its straight links do not get fewer', () => {
    const straight = (d: typeof doc, layer: string) => {
      const y = new Map(allNodes(d).map((n) => [n.id, n.yPosition]))
      return allNodes(d)
        .filter((n) => rows.get(n.id) === layer)
        .flatMap((n) =>
          n.connections.filter((c) => !rows.has(c.targetId)).map((c) => [n.id, c.targetId]),
        )
        .filter(([a, b]) => y.get(a) === y.get(b)).length
    }
    const plain = withLayerFirst({ ...doc }, 'opportunity')
    const unprioritised = alignDocument({ ...plain, rows: plain.rows })
    expect(straight(plain, 'opportunity')).toBeGreaterThanOrEqual(
      straight(unprioritised, 'opportunity'),
    )
  })
})

describe('path highlight (any map)', () => {
  const doc = makeDocument(
    [makeNode('a', [link('b')]), makeNode('x', [link('y')])],
    [makeNode('b', [link('c')]), makeNode('y')],
    [makeNode('c', [link('a')])],
  )
  const { edges } = buildFlow(doc)

  it('lights everything a card feeds and everything that feeds it, not side branches', () => {
    const path = pathHighlight(edges, ['b'])
    expect([...path.nodes].sort()).toEqual(['a', 'b', 'c'])
    expect(
      edges
        .filter((e) => path.edges.has(e.id))
        .map((e) => `${e.source}>${e.target}`)
        .sort(),
    ).toEqual(['a>b', 'b>c', 'c>a'])
  })

  it('does not walk through a link back: it is lit only when both ends are on the path', () => {
    const back = edges.find((e) => e.source === 'c')!
    expect(back.data?.backward).toBe(true)
    const fromA = pathHighlight(edges, ['x'])
    expect([...fromA.nodes].sort()).toEqual(['x', 'y'])
    expect(fromA.edges.has(back.id)).toBe(false)
  })

  it('works on the live status-quo map, which has no rows', () => {
    const live = buildFlow(statusQuoMetacrisis())
    const path = pathHighlight(live.edges, ['outcome-climate-breakdown'])
    expect(path.nodes.size).toBeGreaterThan(3)
    expect(path.edges.size).toBeGreaterThan(2)
    expect(live.nodes.some((n) => n.type === 'rowBand')).toBe(false)
  })
})

describe('layer view cache', () => {
  it('re-tidies on a structural change only: a title edit keeps the positions', () => {
    const doc = comBMatrixDraft()
    const first = cachedLayerFirst(doc, 'opportunity')
    const renamed = {
      ...doc,
      sections: doc.sections.map((s, si) =>
        si !== 0
          ? s
          : {
              ...s,
              columns: s.columns.map((c) => ({
                ...c,
                nodes: c.nodes.map((n) => ({ ...n, title: `${n.title}!` })),
              })),
            },
      ),
    }
    const again = cachedLayerFirst(renamed, 'opportunity')
    const ys = (d: typeof doc) => allNodes(d).map((n) => n.yPosition)
    expect(ys(again)).toEqual(ys(first))
    expect(allNodes(again)[0].title.endsWith('!')).toBe(true)
    expect(ys(first)).toEqual(ys(withLayerFirst(doc, 'opportunity')))
  })
})

describe('path highlight from a card in a group', () => {
  it('follows the links that point at its group', () => {
    const { edges } = buildFlow(statusQuoMetacrisis())
    const path = pathHighlight(edges, ['driver-race-to-bottom', 'group-multipolar-traps'])
    expect(path.nodes.has('strategy-craving-power')).toBe(true)
  })
})
