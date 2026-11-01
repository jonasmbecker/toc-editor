import { describe, expect, it } from 'vitest'
import { COM_B_ROWS, migrateDocument } from '../model/migrate'
import { parseDocument, type ToCDocument } from '../model/schema'
import { importFromJson } from './import'
import { toCompatibleJson, toFullJson } from './export'
import { mergeDocument, splitDocument } from './split'
import { allNodes } from '../state/tree'
import {
  COM_B_DRAFT_FIXTURE,
  extensionKeysIn,
  listFixtures,
  makeDocument,
  makeNode,
  readFixtureText,
} from '../test/fixtures'

type Json = Record<string, unknown>
const NOW = new Date('2026-11-01T12:00:00.000Z')

function migrated(raw: unknown): Json {
  const result = migrateDocument(raw)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value as Json
}

function imported(raw: unknown): ToCDocument {
  const result = importFromJson(raw)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

/** Every card of a raw file by id, `layer` removed (it is the only field migration moves). */
function cardsById(doc: Json): Map<string, Json> {
  const sections = doc.sections as { columns: { nodes: Json[] }[] }[]
  const out = new Map<string, Json>()
  for (const node of sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))) {
    const copy = { ...node }
    delete copy.layer
    out.set(node.id as string, copy)
  }
  return out
}

describe('version 1 → 2 migration', () => {
  describe.each(listFixtures())('%s', (file) => {
    const input = JSON.parse(readFixtureText(file)) as Json

    it('only gains the version: sections, cards and every other field are unchanged', () => {
      const out = migrated(input)
      expect(out.version).toBe(2)
      expect('schemaVersion' in out).toBe(false)
      expect(out.rows).toBeUndefined()
      const rest = { ...out }
      delete rest.version
      const before = { ...input }
      delete before.schemaVersion
      expect(rest).toEqual(before)
    })

    it('does not mutate the input', () => {
      const text = JSON.stringify(input)
      migrated(input)
      expect(JSON.stringify(input)).toBe(text)
    })
  })

  describe('the COM-B draft (cards carry layer)', () => {
    const input = JSON.parse(readFixtureText(COM_B_DRAFT_FIXTURE)) as Json
    const out = migrated(input)
    const sections = out.sections as { title: string; row?: string; columns: { nodes: Json[] }[] }[]

    it('declares the three COM-B rows', () => {
      expect(out.rows).toEqual(COM_B_ROWS)
      expect(out.version).toBe(2)
    })

    it('keeps every card and its layer as the row of its section', () => {
      const layerBefore = new Map<string, unknown>()
      for (const node of (input.sections as { columns: { nodes: Json[] }[] }[]).flatMap((s) =>
        s.columns.flatMap((c) => c.nodes),
      )) {
        layerBefore.set(node.id as string, node.layer)
      }
      const rowAfter = new Map<string, unknown>()
      for (const section of sections) {
        for (const node of section.columns.flatMap((c) => c.nodes)) {
          expect('layer' in node).toBe(false)
          rowAfter.set(node.id as string, section.row)
        }
      }
      expect(rowAfter).toEqual(layerBefore)
      expect(cardsById(out)).toEqual(cardsById(input))
    })

    it('puts row sections first, in row order, then the shared spine in its original order', () => {
      expect(sections.map((s) => [s.row ?? 'spine', s.title])).toEqual([
        ['capability', 'Unmet Needs (Brown & NARM)'],
        ['capability', 'Survival Strategies (Coping Mechanisms)'],
        ['capability', 'Structures & Incentives'],
        ['opportunity', 'Structures & Incentives'],
        ['motivation', 'Reflective Motivation'],
        ['spine', 'Metacrisis Drivers'],
        ['spine', 'Polycrisis outcomes (civilizational health)'],
        ['spine', 'Marginal Notes'],
      ])
    })

    it('imports, and survives full export → reimport and split → merge → import', () => {
      const doc = imported(input)
      expect(parseDocument(JSON.parse(JSON.stringify(doc))).ok).toBe(true)
      const again = imported(JSON.parse(JSON.stringify(toFullJson(doc, NOW))))
      expect(toFullJson(again, NOW)).toEqual(toFullJson(doc, NOW))
      const { content, layout } = splitDocument(doc)
      const merged = mergeDocument(
        JSON.parse(JSON.stringify(content)),
        JSON.parse(JSON.stringify(layout)),
      )
      if (!merged.ok) throw new Error(merged.errors.join('; '))
      expect(imported(merged.document)).toEqual(doc)
      expect(allNodes(doc).map((n) => n.yPosition)).toEqual(allNodes(again).map((n) => n.yPosition))
    })

    it('compatible export flattens the matrix: no row, rows, version, note or layer', () => {
      const out = toCompatibleJson(imported(input), NOW)
      expect(extensionKeysIn(out)).toEqual([])
      expect(JSON.stringify(out)).not.toMatch(/"layer"|"row"|"rows"|"version"/)
    })
  })

  it('leaves a version 2 document alone (same object)', () => {
    const doc = { ...makeDocument([makeNode('a')]), version: 2 }
    expect(migrateDocument(doc)).toEqual({ ok: true, value: doc })
    expect((migrateDocument(doc) as { value: unknown }).value).toBe(doc)
  })

  it('refuses a file from a newer editor', () => {
    const result = migrateDocument({ ...makeDocument([]), version: 3 })
    expect(result.ok).toBe(false)
  })

  it('refuses an unknown layer', () => {
    const doc = makeDocument([{ ...makeNode('a'), layer: 'volition' } as never])
    const result = migrateDocument(doc)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('volition')
  })

  it('refuses a group split across layers', () => {
    const group = { ...makeNode('g'), kind: 'group', layer: 'capability' }
    const member = { ...makeNode('m'), groupId: 'g', layer: 'opportunity' }
    const result = migrateDocument(makeDocument([group, member] as never))
    expect(result.ok).toBe(false)
  })

  it('passes something that is not a map through, so the schema can describe it', () => {
    expect(migrateDocument('nope')).toEqual({ ok: true, value: 'nope' })
    expect(migrateDocument({ title: 'x' })).toEqual({ ok: true, value: { title: 'x' } })
  })
})

describe('version 2 rules', () => {
  const rows = [{ id: 'capability', title: 'Capability' }]
  const base = (): Json => ({ ...makeDocument([makeNode('a')], [makeNode('b')]), version: 2, rows })

  it('accepts a row section before a shared one', () => {
    const doc = base() as unknown as ToCDocument
    doc.sections[0].row = 'capability'
    expect(parseDocument(doc).ok).toBe(true)
  })

  it('rejects an undeclared row, a row after the spine, a duplicate row and a card layer', () => {
    const undeclared = base() as unknown as ToCDocument
    undeclared.sections[0].row = 'opportunity'
    expect(parseDocument(undeclared).ok).toBe(false)

    const late = base() as unknown as ToCDocument
    late.sections[1].row = 'capability'
    expect(parseDocument(late).ok).toBe(false)

    expect(parseDocument({ ...base(), rows: [...rows, ...rows] }).ok).toBe(false)

    const layered = base() as unknown as ToCDocument
    ;(layered.sections[0].columns[0].nodes[0] as Json).layer = 'capability'
    expect(parseDocument(layered).ok).toBe(false)
  })
})
