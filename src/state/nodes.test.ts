import { describe, expect, it } from 'vitest'
import type { DocumentNode, ToCDocument } from '../model/schema'
import {
  addNode,
  allNodeIds,
  connectionCountForNode,
  deleteNode,
  findNodeLocation,
  makeNodeId,
  moveNodeToColumn,
  moveNodeVertically,
  updateNode,
} from './nodes'

function node(id: string, overrides: Partial<DocumentNode> = {}): DocumentNode {
  return {
    id,
    title: id,
    text: '',
    color: '#E3F2FD',
    width: 200,
    yPosition: 0,
    connections: [],
    ...overrides,
  }
}

function doc(overrides: Partial<ToCDocument> = {}): ToCDocument {
  return {
    color: '#2F2D2E',
    title: 'Test',
    sections: [
      { title: 'A', columns: [{ nodes: [node('a1'), node('a2', { yPosition: 100 })] }] },
      { title: 'B', columns: [{ nodes: [node('b1', { connections: [{ targetId: 'a1' }] })] }] },
    ],
    ...overrides,
  }
}

describe('findNodeLocation / allNodeIds', () => {
  it('locates a node by section, column and index', () => {
    expect(findNodeLocation(doc(), 'a2')).toEqual({ sectionIndex: 0, columnIndex: 0, nodeIndex: 1 })
  })

  it('returns null for an id that is not in the document', () => {
    expect(findNodeLocation(doc(), 'missing')).toBeNull()
  })

  it('collects every node id across every section and column', () => {
    expect(allNodeIds(doc())).toEqual(new Set(['a1', 'a2', 'b1']))
  })
})

describe('makeNodeId', () => {
  it('slugifies the title and appends a short suffix', () => {
    const id = makeNodeId('New Node!', new Set())
    expect(id).toMatch(/^new-node-[a-z0-9]{4}$/)
  })

  it('never collides with an existing id', () => {
    // Derive the first candidate's suffix the same way makeNodeId does, so pre-seeding
    // `existing` with it is guaranteed to force a real retry rather than hoping for one.
    const firstRoll = 0.123456789
    const collidingSuffix = firstRoll.toString(36).slice(2, 6)
    const existing = new Set([`node-${collidingSuffix}`])
    const original = Math.random
    let calls = 0
    Math.random = () => {
      calls += 1
      return calls === 1 ? firstRoll : 0.987654321
    }
    try {
      const id = makeNodeId('node', existing)
      expect(calls).toBeGreaterThanOrEqual(2)
      expect(existing.has(id)).toBe(false)
    } finally {
      Math.random = original
    }
  })
})

describe('updateNode / moveNodeVertically', () => {
  it('patches title, text and colour without touching other fields', () => {
    const next = updateNode(doc(), 'a1', { title: 'Renamed', color: '#FFF3E0' })
    const a1 = next.sections[0].columns[0].nodes[0]
    expect(a1).toMatchObject({ title: 'Renamed', color: '#FFF3E0', yPosition: 0 })
  })

  it('is a no-op for an unknown node id', () => {
    const original = doc()
    expect(updateNode(original, 'missing', { title: 'x' })).toEqual(original)
  })

  it('returns the same document object when the patch changes nothing', () => {
    const original = doc()
    expect(updateNode(original, 'a1', { title: 'a1', color: '#E3F2FD' })).toBe(original)
    expect(moveNodeVertically(original, 'a1', 0)).toBe(original)
    expect(moveNodeToColumn(original, 'a1', 0, 0)).toBe(original)
  })

  it('normalises a colour to uppercase hex', () => {
    const next = updateNode(doc(), 'a1', { color: '#fff3e0' })
    expect(next.sections[0].columns[0].nodes[0].color).toBe('#FFF3E0')
  })

  it('treats a lowercase spelling of the current colour as no change', () => {
    const original = doc()
    expect(updateNode(original, 'a1', { color: '#e3f2fd' })).toBe(original)
  })

  it('refuses a colour that is not a 6-digit hex, leaving the document untouched', () => {
    const original = doc()
    for (const bad of ['red', '#FFF', '#GGGGGG', 'url(https://x)', '']) {
      expect(updateNode(original, 'a1', { title: 'Renamed', color: bad })).toBe(original)
    }
  })

  it('moves only yPosition, leaving section and column alone', () => {
    const next = moveNodeVertically(doc(), 'a1', 240)
    expect(next.sections[0].columns[0].nodes[0].yPosition).toBe(240)
  })
})

describe('moveNodeToColumn', () => {
  it('moves a node into a new column, padding with empty columns as needed', () => {
    const next = moveNodeToColumn(doc(), 'a1', 0, 2)
    expect(next.sections[0].columns).toHaveLength(3)
    expect(next.sections[0].columns[2].nodes.map((n) => n.id)).toEqual(['a1'])
    expect(next.sections[0].columns[0].nodes.map((n) => n.id)).toEqual(['a2'])
  })

  it('moves a node across sections, creating the first column if the target has none', () => {
    const withEmptySection = doc({
      sections: [...doc().sections, { title: 'C', columns: [] }],
    })
    const next = moveNodeToColumn(withEmptySection, 'a1', 2, 0)
    expect(next.sections[2].columns).toHaveLength(1)
    expect(next.sections[2].columns[0].nodes.map((n) => n.id)).toEqual(['a1'])
    expect(next.sections[0].columns[0].nodes.map((n) => n.id)).toEqual(['a2'])
  })

  it('is a no-op when the target is where the node already is', () => {
    const original = doc()
    expect(moveNodeToColumn(original, 'a1', 0, 0)).toEqual(original)
  })
})

describe('deleteNode', () => {
  it('removes the node and cascades its inbound connection from other nodes', () => {
    const next = deleteNode(doc(), 'a1')
    expect(findNodeLocation(next, 'a1')).toBeNull()
    expect(next.sections[1].columns[0].nodes[0].connections).toEqual([])
  })

  it("drops the node's own outbound connections along with it", () => {
    const withOutbound = doc({
      sections: [
        { title: 'A', columns: [{ nodes: [node('a1', { connections: [{ targetId: 'b1' }] })] }] },
        { title: 'B', columns: [{ nodes: [node('b1')] }] },
      ],
    })
    const next = deleteNode(withOutbound, 'a1')
    expect(next.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))).toHaveLength(1)
  })
})

describe('connectionCountForNode', () => {
  it('counts inbound and outbound connections together', () => {
    const withBoth = doc({
      sections: [
        {
          title: 'A',
          columns: [
            { nodes: [node('a1', { connections: [{ targetId: 'a2' }, { targetId: 'b1' }] })] },
          ],
        },
        { title: 'B', columns: [{ nodes: [node('b1', { connections: [{ targetId: 'a1' }] })] }] },
      ],
    })
    expect(connectionCountForNode(withBoth, 'a1')).toBe(3) // 2 outbound + 1 inbound
  })
})

describe('addNode', () => {
  it('appends a new node to the target column with a derived id, width and yPosition', () => {
    const { document, nodeId } = addNode(doc(), 0, 0)
    const column = document.sections[0].columns[0]
    expect(column.nodes.map((n) => n.id)).toEqual(['a1', 'a2', nodeId])
    const added = column.nodes[2]
    expect(added.title).toBe('New node')
    expect(added.width).toBe(200) // matches the existing nodes in that column
    expect(added.yPosition).toBeGreaterThan(100) // clears a2's yPosition of 100
  })

  it("defaults colour to the section's most common colour", () => {
    const colourful = doc({
      sections: [
        {
          title: 'A',
          columns: [
            {
              nodes: [
                node('a1', { color: '#FFE0B2' }),
                node('a2', { color: '#FFE0B2' }),
                node('a3', { color: '#E3F2FD' }),
              ],
            },
          ],
        },
      ],
    })
    const { document, nodeId } = addNode(colourful, 0, 0)
    const added = document.sections[0].columns[0].nodes.find((n) => n.id === nodeId)!
    expect(added.color).toBe('#FFE0B2')
  })

  it('falls back to an unused palette colour for a section with no nodes yet', () => {
    const empty = doc({ sections: [{ title: 'A', columns: [{ nodes: [] }] }] })
    const { document, nodeId } = addNode(empty, 0, 0)
    const added = document.sections[0].columns[0].nodes.find((n) => n.id === nodeId)!
    expect(added.color).toMatch(/^#[0-9A-F]{6}$/)
  })
})
