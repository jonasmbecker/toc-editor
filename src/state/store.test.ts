import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from './store'
import { moveNodeToColumn, updateNode } from './nodes'

function fixture(): ToCDocument {
  return {
    color: '#2F2D2E',
    title: 'Test',
    sections: [
      {
        title: 'A',
        columns: [
          {
            nodes: [
              {
                id: 'a1',
                title: 'a1',
                text: '',
                color: '#E3F2FD',
                width: 200,
                yPosition: 0,
                connections: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

function store() {
  return useToCStore.getState()
}

describe('store history', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    store().load(fixture())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records one undo step per distinct edit and reports its label', () => {
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'Renamed' }))
    expect(store().past).toHaveLength(1)
    expect(store().isDirty).toBe(true)
    expect(store().undo()).toBe('rename node')
    expect(store().document).toEqual(fixture())
    expect(store().redo()).toBe('rename node')
    expect(store().document.sections[0].columns[0].nodes[0].title).toBe('Renamed')
  })

  it('does not record a no-op transform, leave the document dirty, or clear redo', () => {
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'Renamed' }))
    store().undo()
    expect(store().future).toHaveLength(1)

    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'a1' }))
    store().transform('move node', (doc) => moveNodeToColumn(doc, 'a1', 0, 0))
    store().transform('recolour node', (doc) => updateNode(doc, 'a1', { color: 'not a colour' }))
    store().transform('touch unknown', (doc) => updateNode(doc, 'missing', { title: 'x' }))

    expect(store().past).toHaveLength(0)
    expect(store().future).toHaveLength(1)
    expect(store().undo()).toBeNull()
  })

  it('coalesces keystrokes sharing a key inside the window into one undo step', () => {
    for (const title of ['R', 'Re', 'Ren']) {
      store().transform('rename node', (doc) => updateNode(doc, 'a1', { title }), {
        coalesceKey: 'title:a1',
      })
      vi.advanceTimersByTime(100)
    }
    expect(store().past).toHaveLength(1)
    expect(store().undo()).toBe('rename node')
    expect(store().document).toEqual(fixture())
  })

  it('starts a new undo step once the coalesce window has passed', () => {
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'R' }), {
      coalesceKey: 'title:a1',
    })
    vi.advanceTimersByTime(601)
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'Re' }), {
      coalesceKey: 'title:a1',
    })
    expect(store().past).toHaveLength(2)
  })

  it('does not let a no-op keystroke extend the coalesce window', () => {
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'R' }), {
      coalesceKey: 'title:a1',
    })
    vi.advanceTimersByTime(500)
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'R' }), {
      coalesceKey: 'title:a1',
    })
    vi.advanceTimersByTime(500)
    store().transform('rename node', (doc) => updateNode(doc, 'a1', { title: 'Re' }), {
      coalesceKey: 'title:a1',
    })
    expect(store().past).toHaveLength(2)
  })
})
