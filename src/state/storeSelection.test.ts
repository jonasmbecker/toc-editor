import { beforeEach, describe, expect, it } from 'vitest'
import { useToCStore } from './store'
import { addConnection, deleteConnection } from './connections'
import { makeDocument, makeNode } from '../test/fixtures'

describe('store selection', () => {
  beforeEach(() => {
    useToCStore
      .getState()
      .load(
        makeDocument(
          [makeNode('a', [{ targetId: 'b' }, { targetId: 'c' }])],
          [makeNode('b'), makeNode('c')],
        ),
      )
  })

  it('node and connection selection are exclusive', () => {
    const store = useToCStore.getState()
    store.select('a')
    store.selectConnection({ sourceId: 'a', index: 0 })
    expect(useToCStore.getState().selectedNodeId).toBeNull()
    store.select('b')
    expect(useToCStore.getState().selectedConnection).toBeNull()
  })

  it('keeps the same ref object for a value-equal selection', () => {
    const store = useToCStore.getState()
    const ref = { sourceId: 'a', index: 1 }
    store.selectConnection(ref)
    store.selectConnection({ ...ref })
    expect(useToCStore.getState().selectedConnection).toBe(ref)
  })

  it('drops the selection when undo makes the index point at a different connection', () => {
    const store = useToCStore.getState()
    // Delete a -> b (index 0); a -> c moves to index 0 and gets selected; undo brings a -> b
    // back at index 0, so the selected index would now denote the wrong connection.
    store.transform('delete', (d) => deleteConnection(d, { sourceId: 'a', index: 0 }))
    store.selectConnection({ sourceId: 'a', index: 0 })
    store.undo()
    expect(useToCStore.getState().selectedConnection).toBeNull()
  })

  it('keeps the selection when undo leaves the same connection at the index', () => {
    const store = useToCStore.getState()
    const ref = { sourceId: 'a', index: 1 }
    store.selectConnection(ref)
    store.transform('add', (d) => {
      const r = addConnection(d, 'b', 'c')
      return r.ok ? r.document : d
    })
    store.undo()
    expect(useToCStore.getState().selectedConnection).toBe(ref)
  })
})
