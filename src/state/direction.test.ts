import { describe, expect, it } from 'vitest'
import type { ToCDocument } from '../model/schema'
import { findConnection, resolveConnection } from './connections'
import { setDirection } from './direction'

type Connections = ToCDocument['sections'][0]['columns'][0]['nodes'][0]['connections']

function node(id: string, yPosition: number, connections: Connections = []) {
  return { id, title: id, text: '', color: '#FFFFFF', width: 100, yPosition, connections }
}

/** a (section A) -> b (section B); b2 sits under b in the same column; c in the second column. */
function doc(): ToCDocument {
  return {
    color: '#000000',
    title: 'synthetic',
    sections: [
      {
        title: 'A',
        columns: [{ nodes: [node('a', 0, [{ targetId: 'b', confidence: 60, id: 'c-1' }])] }],
      },
      {
        title: 'B',
        columns: [
          {
            nodes: [
              node('b', 0, [{ targetId: 'a', isFeedbackLoop: true, id: 'c-2' }]),
              node('b2', 100),
            ],
          },
          { nodes: [node('c', 0, [{ targetId: 'b2', id: 'c-3' }])] },
        ],
      },
    ],
  }
}

describe('resolveConnection direction', () => {
  it('orders the ends by section, column, then yPosition and reads the direction', () => {
    const d = doc()
    expect(resolveConnection(d, { sourceId: 'a', index: 0 })).toMatchObject({
      first: { id: 'a' },
      second: { id: 'b' },
      direction: 'forward',
    })
    expect(resolveConnection(d, { sourceId: 'b', index: 0 })?.direction).toBe('both')
    expect(resolveConnection(d, { sourceId: 'c', index: 0 })).toMatchObject({
      first: { id: 'b2' },
      second: { id: 'c' },
      direction: 'backward',
    })
  })
})

describe('setDirection', () => {
  const forwardRef = { sourceId: 'a', index: 0 }

  it('is a no-op by reference for the current direction', () => {
    const d = doc()
    expect(setDirection(d, forwardRef, 'forward')).toMatchObject({ ok: true, document: d })
  })

  it('both ways flags the connection in place; forward again clears it', () => {
    const d = doc()
    const both = setDirection(d, forwardRef, 'both')
    if (!both.ok) throw new Error('refused')
    expect(findConnection(both.document, both.ref)?.isFeedbackLoop).toBe(true)
    expect(both.ref).toEqual(forwardRef)
    const back = setDirection(both.document, both.ref, 'forward')
    if (!back.ok) throw new Error('refused')
    expect(findConnection(back.document, back.ref)).not.toHaveProperty('isFeedbackLoop')
  })

  it('backward moves the connection to the other node, keeping id and text', () => {
    const d = doc()
    const ref = { sourceId: 'c', index: 0 } // c -> b2 reads as backward (b2 is first)
    const result = setDirection(d, ref, 'forward')
    if (!result.ok) throw new Error('refused')
    expect(result.ref).toEqual({ sourceId: 'b2', index: 0 })
    expect(findConnection(result.document, result.ref)).toMatchObject({ targetId: 'c', id: 'c-3' })
    expect(findConnection(result.document, ref)).toBeNull()
    expect(resolveConnection(result.document, result.ref)?.direction).toBe('forward')
  })

  it('refuses a move when the other node already has its own arrow back', () => {
    // a -> b exists and b -> a exists; turning a -> b backward would duplicate b -> a.
    expect(setDirection(doc(), forwardRef, 'backward')).toEqual({ ok: false, refused: 'duplicate' })
  })
})
