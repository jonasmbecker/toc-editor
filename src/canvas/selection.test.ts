import { describe, expect, it } from 'vitest'
import { MarkerType } from '@xyflow/react'
import { endpointIds, isSelectedEdge, refOfEdge, withSelection } from './selection'
import { CANVAS_COLORS } from './config'
import type { ConnectionEdgeType } from './ConnectionEdge'

const edge: ConnectionEdgeType = {
  id: 'a->b#0',
  source: 'a',
  target: 'b',
  type: 'connection',
  markerEnd: { type: MarkerType.ArrowClosed, color: CANVAS_COLORS.edge },
  data: { ref: { sourceId: 'a', index: 0 } },
}
const other: ConnectionEdgeType = {
  ...edge,
  id: 'a->c#1',
  target: 'c',
  data: { ref: { sourceId: 'a', index: 1 } },
}

describe('selection helpers', () => {
  it('matches an edge to a ref by value and reads the ref back', () => {
    expect(isSelectedEdge(edge, { sourceId: 'a', index: 0 })).toBe(true)
    expect(isSelectedEdge(edge, { sourceId: 'a', index: 1 })).toBe(false)
    expect(isSelectedEdge(edge, null)).toBe(false)
    expect(refOfEdge(edge)).toEqual({ sourceId: 'a', index: 0 })
  })

  it('names both endpoint cards of the selected edge, none when nothing is selected', () => {
    expect([...endpointIds([edge, other], { sourceId: 'a', index: 1 })]).toEqual(['a', 'c'])
    expect(endpointIds([edge, other], null).size).toBe(0)
  })

  it('recolours the selected edge markers and leaves the others alone', () => {
    const selected = withSelection(edge, { sourceId: 'a', index: 0 })
    expect(selected.selected).toBe(true)
    expect(selected.markerEnd).toMatchObject({ color: CANVAS_COLORS.select })
    const unselected = withSelection(other, { sourceId: 'a', index: 0 })
    expect(unselected.selected).toBe(false)
    expect(unselected.markerEnd).toMatchObject({ color: CANVAS_COLORS.edge })
  })
})
