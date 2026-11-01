import { describe, expect, it } from 'vitest'
import { buildFlow } from './buildFlow'
import type { ToCDocument } from '../model/schema'
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_IN_HANDLE,
  LOOP_OUT_HANDLE,
  STACK_DOWN_IN_HANDLE,
  STACK_DOWN_OUT_HANDLE,
  STACK_UP_IN_HANDLE,
  STACK_UP_OUT_HANDLE,
} from './CardNode'

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

describe('buildFlow routing and heads', () => {
  const { edges } = buildFlow(doc)
  const byId = (prefix: string) => edges.find((e) => e.id.startsWith(prefix))!

  it('a one-way arrow pointing left takes the compact loop between adjacent columns in the backward colour with one head', () => {
    const back = byId('b->a')
    expect(back.type).toBe('routed')
    expect(back.sourceHandle).toBe(LOOP_OUT_HANDLE)
    expect(back.targetHandle).toBe(LOOP_IN_HANDLE)
    expect(back.markerEnd).toMatchObject({ color: '#8A8580' })
    expect(back.data?.backward).toBe(true)
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

  it('a both-ways arrow pointing left is routed around the cards with both heads', () => {
    const loop = byId('c->b')
    expect(loop.type).toBe('routed')
    expect(loop.markerStart).toMatchObject({ color: '#C2410C' })
    expect(byId('b->c').type).toBe('connection')
  })
})

describe('buildFlow same-column routing', () => {
  const stacked: ToCDocument = {
    ...doc,
    sections: [
      {
        title: 'S',
        columns: [
          {
            nodes: [
              node('top', [{ targetId: 'bottom' }]),
              { ...node('bottom', [{ targetId: 'top' }]), yPosition: 200 },
            ],
          },
        ],
      },
    ],
  }
  const { edges } = buildFlow(stacked)
  const byId = (prefix: string) => edges.find((e) => e.id.startsWith(prefix))!

  it('an edge to a lower card in the same column runs bottom edge to top edge', () => {
    const down = byId('top->bottom')
    expect(down.type).toBe('connection')
    expect(down.sourceHandle).toBe(STACK_DOWN_OUT_HANDLE)
    expect(down.targetHandle).toBe(STACK_DOWN_IN_HANDLE)
  })

  it('an edge to a higher card in the same column runs top edge to bottom edge', () => {
    const up = byId('bottom->top')
    expect(up.sourceHandle).toBe(STACK_UP_OUT_HANDLE)
    expect(up.targetHandle).toBe(STACK_UP_IN_HANDLE)
  })
})
