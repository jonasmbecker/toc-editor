import { describe, expect, it } from 'vitest'
import type { ToCDocument } from '../model/schema'
import {
  addConnection,
  deleteConnection,
  findConnection,
  flowsBefore,
  makeConnectionId,
  updateConnection,
} from './connections'

function node(
  id: string,
  connections: ToCDocument['sections'][0]['columns'][0]['nodes'][0]['connections'] = [],
) {
  return { id, title: id, text: '', color: '#FFFFFF', width: 100, yPosition: 0, connections }
}

function doc(): ToCDocument {
  return {
    color: '#000000',
    title: 'synthetic',
    sections: [
      { title: 'A', columns: [{ nodes: [node('a1', [{ targetId: 'b1', confidence: 20 }])] }] },
      { title: 'B', columns: [{ nodes: [node('b1')] }, { nodes: [node('b2')] }] },
    ],
  }
}

describe('addConnection', () => {
  it('appends a connection with the planned defaults and a fresh id', () => {
    const result = addConnection(doc(), 'b1', 'b2')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = findConnection(result.document, result.ref)
    expect(added).toMatchObject({ targetId: 'b2', confidence: 50, assumptions: '', evidence: '' })
    expect(added?.id).toMatch(/^c-[a-z0-9]{4}$/)
    expect(result.ref).toEqual({ sourceId: 'b1', index: 0 })
  })

  it('never marks a new connection as both ways, whichever way it was dragged', () => {
    const back = addConnection(doc(), 'b1', 'a1')
    const forward = addConnection(doc(), 'a1', 'b2')
    expect(back.ok && findConnection(back.document, back.ref)).not.toHaveProperty('isFeedbackLoop')
    expect(forward.ok && findConnection(forward.document, forward.ref)).not.toHaveProperty(
      'isFeedbackLoop',
    )
    expect(flowsBefore(doc(), 'a1', 'b1')).toBe(true)
    expect(flowsBefore(doc(), 'b1', 'b2')).toBe(true)
    expect(flowsBefore(doc(), 'b2', 'b1')).toBe(false)
  })

  it('refuses a self-loop and an exact duplicate, but allows the reverse direction', () => {
    expect(addConnection(doc(), 'a1', 'a1')).toEqual({ ok: false, refused: 'self' })
    expect(addConnection(doc(), 'a1', 'b1')).toEqual({ ok: false, refused: 'duplicate' })
    expect(addConnection(doc(), 'b1', 'a1').ok).toBe(true)
  })

  it('does not touch the original document', () => {
    const before = doc()
    const snapshot = JSON.stringify(before)
    addConnection(before, 'b1', 'b2')
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('updateConnection', () => {
  const ref = { sourceId: 'a1', index: 0 }

  it('patches fields and returns the same document for a no-op', () => {
    const before = doc()
    const after = updateConnection(before, ref, { confidence: 80, assumptions: 'x' })
    expect(findConnection(after, ref)).toMatchObject({ confidence: 80, assumptions: 'x' })
    expect(updateConnection(after, ref, { confidence: 80 })).toBe(after)
    expect(updateConnection(before, { sourceId: 'nope', index: 0 }, { confidence: 1 })).toBe(before)
  })

  it('removes a key set to undefined, so "Clear rating" leaves no confidence behind', () => {
    const after = updateConnection(doc(), ref, { confidence: undefined })
    expect('confidence' in (findConnection(after, ref) ?? {})).toBe(false)
  })
})

describe('deleteConnection', () => {
  it('removes exactly that connection and is a no-op for a missing one', () => {
    const before = doc()
    const after = deleteConnection(before, { sourceId: 'a1', index: 0 })
    expect(findConnection(after, { sourceId: 'a1', index: 0 })).toBeNull()
    expect(deleteConnection(before, { sourceId: 'a1', index: 5 })).toBe(before)
  })
})

describe('makeConnectionId', () => {
  it('re-rolls on collision', () => {
    const first = makeConnectionId(new Set())
    expect(makeConnectionId(new Set([first]))).not.toBe(first)
  })
})
