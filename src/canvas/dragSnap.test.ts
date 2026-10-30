import { describe, expect, it } from 'vitest'
import type { DocumentNode, ToCDocument } from '../model/schema'
import { layoutDocument } from '../layout/columns'
import { resolveDropTarget, snapYPosition } from './dragSnap'

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

// Section A: two columns of 200-wide nodes, columnPadding 20 -> col0 [24,224), col1 [244,444).
// Section B: sectionPadding 40 after A (at 444+40=484), one empty column (no footprint).
function doc(): ToCDocument {
  return {
    color: '#2F2D2E',
    title: 'Test',
    columnPadding: 20,
    sectionPadding: 40,
    sections: [
      {
        title: 'A',
        columns: [{ nodes: [node('a1')] }, { nodes: [node('a2')] }],
      },
      { title: 'B', columns: [{ nodes: [] }] },
    ],
  }
}

describe('resolveDropTarget', () => {
  it('resolves to the column under the centre x', () => {
    expect(resolveDropTarget(doc(), 100)).toEqual({ sectionIndex: 0, columnIndex: 0 })
    expect(resolveDropTarget(doc(), 300)).toEqual({ sectionIndex: 0, columnIndex: 1 })
  })

  it('clamps to the first column when x falls left of everything', () => {
    expect(resolveDropTarget(doc(), -500)).toEqual({ sectionIndex: 0, columnIndex: 0 })
  })

  it('clamps to the last section when x falls right of everything, appending a column there', () => {
    // Section B is last and has only an empty (zero-width) column, so it has no span of its
    // own to land inside; the "beyond everything" fallback still resolves to it over A, which
    // is what a drop far past the real content should do.
    expect(resolveDropTarget(doc(), 100_000)).toEqual({ sectionIndex: 1, columnIndex: 1 })
  })

  it('appends a new column when the section has none with any visible width', () => {
    // Section B's only column is empty, so it has zero width and no span to land on.
    expect(resolveDropTarget(doc(), 500)).toEqual({ sectionIndex: 1, columnIndex: 1 })
  })

  it('appends column 0 for a section with no columns at all', () => {
    const noColumns: ToCDocument = {
      ...doc(),
      sections: [...doc().sections, { title: 'C', columns: [] }],
    }
    const header = layoutDocument(noColumns).sectionHeaders[2]
    const sectionCX = header.x + header.width / 2 // inside C's (empty-section) span
    expect(resolveDropTarget(noColumns, sectionCX)).toEqual({ sectionIndex: 2, columnIndex: 0 })
  })
})

describe('snapYPosition', () => {
  it('rounds to the nearest 8px step', () => {
    expect(snapYPosition(10)).toBe(8)
    expect(snapYPosition(13)).toBe(16)
    expect(snapYPosition(0)).toBe(0)
  })

  it('never goes negative', () => {
    expect(snapYPosition(-100)).toBe(0)
  })
})
