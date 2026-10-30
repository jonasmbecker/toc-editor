import { describe, expect, it } from 'vitest'
import type { ToCDocument } from '../model/schema'
import { setDiagramType } from './document'

const base: ToCDocument = { color: '#000000', title: 't', sections: [] }

describe('setDiagramType', () => {
  it('writes the type and is a no-op by reference when unchanged', () => {
    const statusQuo = setDiagramType(base, 'status-quo')
    expect(statusQuo.diagramType).toBe('status-quo')
    expect(setDiagramType(statusQuo, 'status-quo')).toBe(statusQuo)
    expect(base.diagramType).toBeUndefined()
  })

  it('adds only the diagramType key, never changing another', () => {
    expect(Object.keys(setDiagramType(base, 'status-quo'))).toEqual([
      ...Object.keys(base),
      'diagramType',
    ])
  })
})
