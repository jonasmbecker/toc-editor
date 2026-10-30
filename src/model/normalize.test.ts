import { describe, expect, it } from 'vitest'
import type { ToCDocument } from './schema'
import { collapseMutualLoops, expandBothWays } from './normalize'

type Connections = ToCDocument['sections'][0]['columns'][0]['nodes'][0]['connections']

function node(id: string, connections: Connections = []) {
  return { id, title: id, text: '', color: '#FFFFFF', width: 100, yPosition: 0, connections }
}

function withPair(): ToCDocument {
  return {
    color: '#000000',
    title: 'pair',
    sections: [
      {
        title: 'S',
        columns: [
          {
            nodes: [
              node('a', [
                { targetId: 'b', isFeedbackLoop: true, evidence: 'Seen as two-headed.', id: 'c-1' },
                { targetId: 'c' },
              ]),
              node('b', [{ targetId: 'a', isFeedbackLoop: true, evidence: 'Other half.' }]),
              node('c'),
            ],
          },
        ],
      },
    ],
  }
}

describe('collapseMutualLoops', () => {
  it("keeps the first node's connection, appends the twin's text, drops the twin", () => {
    const collapsed = collapseMutualLoops(withPair())
    const [a, b] = collapsed.sections[0].columns[0].nodes
    expect(a.connections).toHaveLength(2)
    expect(a.connections[0]).toMatchObject({
      targetId: 'b',
      isFeedbackLoop: true,
      id: 'c-1',
      evidence: 'Seen as two-headed.\n\nOther half.',
    })
    expect(b.connections).toHaveLength(0)
  })

  it('is a no-op by reference when nothing is mutual, and idempotent', () => {
    const once = collapseMutualLoops(withPair())
    expect(collapseMutualLoops(once)).toBe(once)
    const plain: ToCDocument = { color: '#000000', title: 'x', sections: [] }
    expect(collapseMutualLoops(plain)).toBe(plain)
  })
})

describe('expandBothWays', () => {
  it('adds the twin back for a compatible export, without an id, and skips an existing reverse', () => {
    const single = collapseMutualLoops(withPair())
    const expanded = expandBothWays(single)
    const [a, b] = expanded.sections[0].columns[0].nodes
    expect(b.connections).toEqual([
      { targetId: 'a', isFeedbackLoop: true, evidence: 'Seen as two-headed.\n\nOther half.' },
    ])
    expect(a.connections).toHaveLength(2)
    expect(expandBothWays(expanded)).toBe(expanded)
    expect(collapseMutualLoops(expanded)).toEqual(single)
  })
})
