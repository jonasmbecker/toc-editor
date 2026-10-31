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
})
