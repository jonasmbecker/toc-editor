import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { documentSchema } from '../model/schema'
import { computeNeedMixes, NEED_PALETTE } from './needMix'
import { makeNode } from '../test/fixtures'
import type { ToCDocument } from '../model/schema'

function doc(): ToCDocument {
  const c = (targetId: string) => ({ targetId, confidence: 50, assumptions: '', evidence: '' })
  return {
    color: '#000000',
    title: 't',
    diagramType: 'status-quo',
    sections: [
      {
        title: 'Needs',
        columns: [
          { nodes: [makeNode('n1', [], { yPosition: 0 }), makeNode('n2', [], { yPosition: 100 })] },
          {
            nodes: [
              makeNode('m1', [c('s1')], { yPosition: 0 }),
              makeNode('m2', [c('s2'), c('s3')], { yPosition: 100 }),
            ],
          },
        ],
      },
      {
        title: 'Strategies',
        columns: [
          {
            nodes: [
              makeNode('s1', [c('d1')]),
              makeNode('s2', [c('d1')]),
              makeNode('s3', []),
              makeNode('s4'),
            ],
          },
        ],
      },
      {
        title: 'Drivers',
        columns: [{ nodes: [makeNode('d1', [c('s1')])] }],
      },
    ],
  } as ToCDocument
}

describe('computeNeedMixes', () => {
  it('seeds needs and their row-mates with a single colour', () => {
    const { mixes, needs } = computeNeedMixes(doc())
    expect(needs.map((n) => n.color)).toEqual([NEED_PALETTE[0], NEED_PALETTE[1]])
    expect(mixes.get('n2')).toEqual([0, 1])
    expect(mixes.get('m1')).toEqual([1, 0])
  })

  it('passes a need to its strategy and averages where two needs meet', () => {
    const { mixes } = computeNeedMixes(doc())
    expect(mixes.get('s1')).toEqual([1, 0])
    expect(mixes.get('s2')).toEqual([0, 1])
    expect(mixes.get('d1')).toEqual([0.5, 0.5])
  })

  it('leaves a card without a parent need uncoloured and ignores backward arrows', () => {
    const { mixes } = computeNeedMixes(doc())
    expect(mixes.has('s4')).toBe(false)
    expect(mixes.get('s1')).toEqual([1, 0])
  })

  it('does nothing for a plain theory of change', () => {
    const plain = { ...doc(), diagramType: 'theory-of-change' } as ToCDocument
    expect(computeNeedMixes(plain).mixes.size).toBe(0)
  })

  it('follows the metacrisis template: five needs, shares sum to one', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../templates/status-quo-metacrisis.json'), 'utf8'),
    )
    const { needs, mixes } = computeNeedMixes(documentSchema.parse(raw))
    expect(needs).toHaveLength(5)
    for (const mix of mixes.values()) {
      expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    }
    expect(mixes.has('strategy-craving-seen')).toBe(false)
    expect(mixes.get('strategy-numbing')).toEqual([1, 0, 0, 0, 0])
  })
})
