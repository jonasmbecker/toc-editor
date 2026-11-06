import { describe, expect, it } from 'vitest'
import statusQuoJson from '../templates/status-quo-metacrisis.json'
import { statusQuoMetacrisis } from '../templates'
import {
  mergeDocument,
  serializeMapFile,
  splitDocument,
  type MapContent,
  type MapLayout,
} from './split'
import type { ToCDocument } from '../model/schema'

const live = statusQuoJson as unknown as ToCDocument

describe('split and merge of the live template', () => {
  const { content, layout } = splitDocument(live)

  it('keeps positions out of content.json', () => {
    const text = JSON.stringify(content)
    expect(text).not.toContain('yPosition')
    expect(text).not.toContain('"width"')
    expect(text).not.toContain('curvature')
  })

  it('keys layout.json by card id, sorted, one entry per card', () => {
    const ids = Object.keys(layout.cards)
    expect(ids.length).toBe(58)
    expect(ids).toEqual([...ids].sort())
  })

  it('merges back to exactly the live template, key order included', () => {
    const merged = mergeDocument(content, layout)
    if (!merged.ok) throw new Error(merged.errors.join('; '))
    expect(serializeMapFile(merged.document)).toBe(serializeMapFile(live))
  })

  it('survives being written to text and read back', () => {
    const c = JSON.parse(serializeMapFile(content)) as MapContent
    const l = JSON.parse(serializeMapFile(layout)) as MapLayout
    const merged = mergeDocument(c, l)
    if (!merged.ok) throw new Error(merged.errors.join('; '))
    expect(serializeMapFile(merged.document)).toBe(serializeMapFile(live))
  })

  it('is byte-stable: splitting a merged map gives the same two files', () => {
    const merged = mergeDocument(content, layout)
    if (!merged.ok) throw new Error('merge failed')
    const again = splitDocument(merged.document)
    expect(serializeMapFile(again.content)).toBe(serializeMapFile(content))
    expect(serializeMapFile(again.layout)).toBe(serializeMapFile(layout))
  })

  it('merging the bundled, normalised document also round-trips', () => {
    const doc = statusQuoMetacrisis()
    const s = splitDocument(doc)
    const merged = mergeDocument(s.content, s.layout)
    if (!merged.ok) throw new Error('merge failed')
    expect(merged.document).toEqual(doc)
  })

  it('names a card that has no position', () => {
    const missing = { ...layout, cards: { ...layout.cards } }
    delete missing.cards['need-brown-felt-safety']
    const merged = mergeDocument(content, missing)
    expect(merged.ok).toBe(false)
    if (!merged.ok) expect(merged.errors[0]).toContain('need-brown-felt-safety')
  })

  it('changing a position changes layout.json only', () => {
    const moved = structuredClone(live)
    moved.sections[0].columns[0].nodes[0].yPosition += 10
    const s = splitDocument(moved)
    expect(serializeMapFile(s.content)).toBe(serializeMapFile(content))
    expect(serializeMapFile(s.layout)).not.toBe(serializeMapFile(layout))
  })

  it('writes no xPosition or layoutMode for a column map', () => {
    expect(JSON.stringify(layout)).not.toContain('xPosition')
    expect(layout.layoutMode).toBeUndefined()
  })
})

/** A small free-canvas map: two cards, each at its own x and y. */
function freeMap(): ToCDocument {
  return {
    color: '#2F2D2E',
    title: 'Loops',
    diagramType: 'status-quo',
    layoutMode: 'free',
    sections: [
      {
        title: '',
        columns: [
          {
            nodes: [
              {
                id: 'a',
                title: 'A',
                text: '',
                color: '#FFFFFF',
                width: 200,
                yPosition: 40,
                xPosition: 320,
                connections: [{ targetId: 'b' }],
              },
              {
                id: 'b',
                title: 'B',
                text: '',
                color: '#FFFFFF',
                width: 200,
                yPosition: 260,
                xPosition: -80,
                connections: [{ targetId: 'a' }],
              },
            ],
          },
        ],
      },
    ],
    columnPadding: 40,
  }
}

describe('split and merge of a free-canvas map', () => {
  const doc = freeMap()
  const { content, layout } = splitDocument(doc)

  it('puts x, y and the layout mode in layout.json, none of it in content.json', () => {
    expect(layout.layoutMode).toBe('free')
    expect(layout.cards.a).toEqual({ width: 200, yPosition: 40, xPosition: 320 })
    expect(layout.cards.b.xPosition).toBe(-80)
    const text = JSON.stringify(content)
    expect(text).not.toContain('xPosition')
    expect(text).not.toContain('layoutMode')
  })

  it('merges back to exactly the free map, key order included', () => {
    const c = JSON.parse(serializeMapFile(content)) as MapContent
    const l = JSON.parse(serializeMapFile(layout)) as MapLayout
    const merged = mergeDocument(c, l)
    if (!merged.ok) throw new Error(merged.errors.join('; '))
    expect(serializeMapFile(merged.document)).toBe(serializeMapFile(doc))
  })

  it('a horizontal move changes layout.json only', () => {
    const moved = structuredClone(doc)
    moved.sections[0].columns[0].nodes[0].xPosition = 500
    const s = splitDocument(moved)
    expect(serializeMapFile(s.content)).toBe(serializeMapFile(content))
    expect(s.layout.cards.a.xPosition).toBe(500)
  })
})
