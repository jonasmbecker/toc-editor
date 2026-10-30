import { describe, expect, it } from 'vitest'
import { loopGeometry } from './loopGeometry'
import { buildFlow } from './buildFlow'
import type { ToCDocument } from '../model/schema'
import { FLOW_IN_HANDLE, FLOW_OUT_HANDLE, LOOP_IN_HANDLE, LOOP_OUT_HANDLE } from './CardNode'

function node(
  id: string,
  connections: ToCDocument['sections'][0]['columns'][0]['nodes'][0]['connections'] = [],
) {
  return { id, title: id, text: '', color: '#FFFFFF', width: 100, yPosition: 0, connections }
}

/** a (section A) | b, c (section B, two columns). */
const doc: ToCDocument = {
  color: '#000000',
  title: 'synthetic',
  columnPadding: 20,
  sectionPadding: 40,
  sections: [
    { title: 'A', columns: [{ nodes: [node('a', [{ targetId: 'b', isFeedbackLoop: true }])] }] },
    {
      title: 'B',
      columns: [
        { nodes: [node('b', [{ targetId: 'a', confidence: 30 }, { targetId: 'c' }])] },
        { nodes: [node('c', [{ targetId: 'b', isFeedbackLoop: true }])] },
      ],
    },
  ],
}

describe('loopGeometry', () => {
  it('starts at the source, ends at the target, labels below the source', () => {
    const g = loopGeometry(500, 300, 400, 100)
    expect(g.path.startsWith('M500,300 C')).toBe(true)
    expect(g.path.endsWith(' 400,100')).toBe(true)
    expect(g.labelY).toBeGreaterThan(300)
  })
})

describe('buildFlow routing and heads', () => {
  const { edges } = buildFlow(doc)
  const byId = (prefix: string) => edges.find((e) => e.id.startsWith(prefix))!

  it('a one-way arrow pointing left takes the loop route in the normal colour with one head', () => {
    const back = byId('b->a')
    expect(back.type).toBe('loop')
    expect(back.sourceHandle).toBe(LOOP_OUT_HANDLE)
    expect(back.targetHandle).toBe(LOOP_IN_HANDLE)
    expect(back.markerEnd).toMatchObject({ color: '#5B5A5E' })
    expect(back.markerStart).toBeUndefined()
  })

  it('a both-ways arrow in flow order keeps the plain route, in accent, with a head at each end', () => {
    const forward = byId('a->b')
    expect(forward.type).toBe('connection')
    expect(forward.sourceHandle).toBe(FLOW_OUT_HANDLE)
    expect(forward.targetHandle).toBe(FLOW_IN_HANDLE)
    expect(forward.markerEnd).toMatchObject({ color: '#C2410C' })
    expect(forward.markerStart).toMatchObject({ color: '#C2410C', orient: 'auto-start-reverse' })
  })

  it('a both-ways arrow pointing left takes the loop route with both heads', () => {
    const loop = byId('c->b')
    expect(loop.type).toBe('loop')
    expect(loop.markerStart).toMatchObject({ color: '#C2410C' })
    expect(byId('b->c').type).toBe('connection')
  })
})
