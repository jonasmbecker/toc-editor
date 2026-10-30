import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument, type ToCDocument } from '../model/schema'
import { layoutDocument } from '../layout/columns'
import { buildFlow } from './buildFlow'

const fixturesDir = resolve(__dirname, '../../fixtures')
const fixtureFiles = readdirSync(fixturesDir).filter((name) => name.endsWith('.json'))

function loadFixture(file: string): ToCDocument {
  const raw = JSON.parse(readFileSync(resolve(fixturesDir, file), 'utf8'))
  const result = parseDocument(raw)
  if (!result.ok) throw new Error(`${file}: ${result.errors.join('; ')}`)
  return result.document
}

function countInFile(doc: ToCDocument) {
  const nodes = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))
  return { nodes: nodes.length, connections: nodes.flatMap((n) => n.connections).length }
}

describe('buildFlow fixture parity', () => {
  it('finds the real fixtures to test against', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0)
  })

  it('status-quo map: 50 card nodes and 44 edges, as in the file', () => {
    const doc = loadFixture('theory-of-metacrisis-status-quo_v1.json')
    const { nodes, edges } = buildFlow(doc)
    expect(nodes.filter((n) => n.type === 'card')).toHaveLength(50)
    expect(edges).toHaveLength(44)
  })

  describe.each(fixtureFiles)('%s', (file) => {
    const doc = loadFixture(file)
    const { nodes, edges } = buildFlow(doc)
    const cards = nodes.filter((n) => n.type === 'card')
    const headers = nodes.filter((n) => n.type === 'sectionHeader')

    it('puts every node and every connection from the file on the canvas', () => {
      const expected = countInFile(doc)
      expect(cards).toHaveLength(expected.nodes)
      expect(edges).toHaveLength(expected.connections)
    })

    it('keeps the sections in file order, left to right, with one header each', () => {
      expect(headers).toHaveLength(doc.sections.length)
      const xs = headers.map((h) => h.position.x)
      expect(xs).toEqual([...xs].sort((a, b) => a - b))
      headers.forEach((h, i) => expect(h.data.title).toBe(doc.sections[i].title))
    })

    it('never overlaps nodes horizontally across columns (only yPosition can cause overlap)', () => {
      const layout = layoutDocument(doc)
      const columns = new Map<string, { left: number; right: number }>()
      for (const n of layout.nodes) {
        const key = `${n.sectionIndex}/${n.columnIndex}`
        const span = columns.get(key) ?? { left: n.x, right: n.x + n.width }
        span.right = Math.max(span.right, n.x + n.width)
        columns.set(key, span)
      }
      const spans = [...columns.values()].sort((a, b) => a.left - b.left)
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].left).toBeGreaterThanOrEqual(spans[i - 1].right)
      }
    })

    it('resolves every edge to two nodes that exist', () => {
      const ids = new Set(cards.map((c) => c.id))
      for (const edge of edges) {
        expect(ids.has(edge.source)).toBe(true)
        expect(ids.has(edge.target)).toBe(true)
      }
    })
  })
})

function minimalNode(
  id: string,
  overrides: Partial<ToCDocument['sections'][number]['columns'][number]['nodes'][number]> = {},
) {
  return {
    id,
    title: id,
    text: '',
    color: '#000000',
    width: 100,
    yPosition: 0,
    connections: [],
    ...overrides,
  }
}

describe('buildFlow: connections with no matching target', () => {
  it('drops the connection from edges but reports it, rather than crashing or going silent', () => {
    const doc: ToCDocument = {
      color: '#000000',
      title: 'synthetic',
      sections: [
        {
          title: 's',
          columns: [
            { nodes: [minimalNode('a', { connections: [{ targetId: 'does-not-exist' }] })] },
          ],
        },
      ],
    }
    const { nodes, edges, droppedConnections } = buildFlow(doc)
    expect(nodes.filter((n) => n.type === 'card')).toHaveLength(1)
    expect(edges).toHaveLength(0)
    expect(droppedConnections).toEqual([{ sourceId: 'a', targetId: 'does-not-exist' }])
  })
})

describe('buildFlow: edge marker colour follows edgeAppearance', () => {
  it('gives a feedback loop an arrow in the accent colour', () => {
    const doc: ToCDocument = {
      color: '#000000',
      title: 'synthetic',
      sections: [
        {
          title: 's',
          columns: [
            {
              nodes: [
                minimalNode('a', { connections: [{ targetId: 'b', isFeedbackLoop: true }] }),
                minimalNode('b'),
              ],
            },
          ],
        },
      ],
    }
    const { edges } = buildFlow(doc)
    expect(edges[0].markerEnd).toMatchObject({ color: '#C2410C' })
  })
})
