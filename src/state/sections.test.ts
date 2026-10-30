import { describe, expect, it } from 'vitest'
import type { DocumentNode, ToCDocument } from '../model/schema'
import {
  addColumn,
  addSectionAfter,
  deleteEmptySection,
  deleteSectionDroppingNodes,
  deleteSectionMovingNodesTo,
  removeEmptyColumn,
  renameSection,
} from './sections'

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

function doc(): ToCDocument {
  return {
    color: '#2F2D2E',
    title: 'Test',
    sections: [
      { title: 'A', columns: [{ nodes: [node('a1')] }] },
      { title: 'B', columns: [{ nodes: [node('b1', { connections: [{ targetId: 'a1' }] })] }] },
      { title: 'C', columns: [] },
    ],
  }
}

describe('addColumn / removeEmptyColumn', () => {
  it('appends an empty column to the section', () => {
    const next = addColumn(doc(), 0)
    expect(next.sections[0].columns).toHaveLength(2)
    expect(next.sections[0].columns[1].nodes).toEqual([])
  })

  it('removes an empty column', () => {
    const withColumn = addColumn(doc(), 0)
    const next = removeEmptyColumn(withColumn, 0, 1)
    expect(next.sections[0].columns).toHaveLength(1)
  })

  it('refuses to remove a column that still holds nodes', () => {
    const original = doc()
    expect(removeEmptyColumn(original, 0, 0)).toEqual(original)
  })
})

describe('renameSection / addSectionAfter', () => {
  it('renames only the targeted section', () => {
    const next = renameSection(doc(), 1, 'Renamed')
    expect(next.sections.map((s) => s.title)).toEqual(['A', 'Renamed', 'C'])
  })

  it('inserts a new section directly after the given index', () => {
    const next = addSectionAfter(doc(), 0)
    expect(next.sections.map((s) => s.title)).toEqual(['A', 'New section', 'B', 'C'])
    expect(next.sections[1].columns).toEqual([{ nodes: [] }])
  })
})

describe('deleteEmptySection', () => {
  it('removes a section that holds no nodes', () => {
    const next = deleteEmptySection(doc(), 2)
    expect(next.sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('refuses a section that still has nodes', () => {
    const original = doc()
    expect(deleteEmptySection(original, 0)).toEqual(original)
  })

  it('refuses to drop the last remaining section', () => {
    const single: ToCDocument = { ...doc(), sections: [doc().sections[2]] }
    expect(deleteEmptySection(single, 0)).toEqual(single)
  })
})

describe('deleteSectionDroppingNodes', () => {
  it('removes the section and every node in it, cascading inbound connections', () => {
    const next = deleteSectionDroppingNodes(doc(), 0)
    expect(next.sections.map((s) => s.title)).toEqual(['B', 'C'])
    expect(next.sections[0].columns[0].nodes[0].connections).toEqual([])
  })
})

describe('deleteSectionMovingNodesTo', () => {
  it("moves the section's nodes into the target section's first column, then removes it", () => {
    const next = deleteSectionMovingNodesTo(doc(), 0, 1)
    expect(next.sections.map((s) => s.title)).toEqual(['B', 'C'])
    expect(next.sections[0].columns[0].nodes.map((n) => n.id)).toEqual(['b1', 'a1'])
  })

  it('creates a first column when the target section has none', () => {
    const next = deleteSectionMovingNodesTo(doc(), 1, 2)
    expect(next.sections.map((s) => s.title)).toEqual(['A', 'C'])
    expect(next.sections[1].columns).toHaveLength(1)
    expect(next.sections[1].columns[0].nodes.map((n) => n.id)).toEqual(['b1'])
  })

  it('resolves indices correctly even when the target comes before the departing section', () => {
    const next = deleteSectionMovingNodesTo(doc(), 1, 0)
    expect(next.sections.map((s) => s.title)).toEqual(['A', 'C'])
    expect(next.sections[0].columns[0].nodes.map((n) => n.id)).toEqual(['a1', 'b1'])
  })
})
