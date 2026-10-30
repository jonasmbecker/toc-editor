import { describe, expect, it, beforeEach } from 'vitest'
import { importFromText, describePath, MAX_IMPORT_BYTES, importFromFile } from './import'
import { toCompatibleJson, toFullJson, exportFilename } from './export'
import { saveDraft, loadDraft, clearDraft, isDraftCurrent } from './draft'
import { blankTheoryOfChange, statusQuoMetacrisis, TEMPLATES } from '../templates'
import { parseDocument } from '../model/schema'
import { extensionKeysIn, listFixtures, readFixtureText } from '../test/fixtures'

const NOW = new Date('2026-10-29T12:00:00.000Z')

function withoutExportedAt(value: unknown) {
  const copy = structuredClone(value) as { _metadata?: Record<string, unknown> }
  if (copy._metadata) delete copy._metadata.exportedAt
  return copy
}

describe('fixture round trip', () => {
  const files = listFixtures()

  it('covers every file in tocs/ (the fixtures folder mirrors it)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  describe.each(files)('%s', (file) => {
    const text = readFixtureText(file)
    const input = JSON.parse(text)
    const usesExtensions = extensionKeysIn(input).length > 0

    it('imports without errors', () => {
      expect(importFromText(text).ok).toBe(true)
    })

    it('compatible export is the input apart from exportedAt, or the input minus every extension key', () => {
      const result = importFromText(text)
      if (!result.ok) throw new Error('import failed')
      const out = toCompatibleJson(result.document, NOW)
      expect(out._metadata?.exportedAt).toBe(NOW.toISOString())
      expect(extensionKeysIn(out)).toEqual([])
      if (usesExtensions) {
        expect(out.sections.map((s) => s.title)).toEqual(
          input.sections.map((s: { title: string }) => s.title),
        )
        expect(parseDocument(JSON.parse(JSON.stringify(out))).ok).toBe(true)
      } else {
        expect(withoutExportedAt(out)).toEqual(withoutExportedAt(input))
      }
    })

    it('full export keeps every field of the imported document', () => {
      const result = importFromText(text)
      if (!result.ok) throw new Error('import failed')
      const out = toFullJson(result.document, NOW)
      expect(withoutExportedAt(out)).toEqual(withoutExportedAt(result.document))
    })
  })
})

describe('import errors', () => {
  it('rejects non-JSON', () => {
    expect(importFromText('not json').ok).toBe(false)
  })
  it('lists problems per path in words', () => {
    const r = importFromText(
      JSON.stringify({ color: '#000000', title: 'x', sections: [{ title: 1, columns: [] }] }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/^At section 1, title:/)
  })
  it('summarises past fifty problems', () => {
    const sections = Array.from({ length: 60 }, () => ({ title: 1, columns: [] }))
    const r = importFromText(JSON.stringify({ color: '#000000', title: 'x', sections }))
    if (r.ok) throw new Error('expected failure')
    expect(r.errors).toHaveLength(51)
    expect(r.errors[50]).toBe('and 10 more problems')
  })
  it('describes paths', () => {
    expect(describePath(['sections', '0', 'columns', '1', 'nodes', '2', 'title'])).toBe(
      'section 1, column 2, node 3, title',
    )
    expect(describePath([])).toBe('the file')
  })
  it('keeps unknown keys', () => {
    const r = importFromText(
      JSON.stringify({ color: '#000000', title: 'x', sections: [], extra: 5 }),
    )
    expect(r.ok && (r.document as Record<string, unknown>).extra).toBe(5)
  })
  it('refuses an oversized file before reading it', async () => {
    const huge = { size: MAX_IMPORT_BYTES + 1, text: () => Promise.reject(new Error('no')) }
    const r = await importFromFile(huge as unknown as File)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/larger than 25 MB/)
  })
  it('reports a file that cannot be read (a dropped folder)', async () => {
    const folder = { size: 0, text: () => Promise.reject(new Error('NotFoundError')) }
    const r = await importFromFile(folder as unknown as File)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/could not be read/)
  })
})

describe('templates and filenames', () => {
  it('creates fresh independent documents', () => {
    for (const t of TEMPLATES) expect(t.create()).not.toBe(t.create())
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'status-quo-metacrisis',
      'blank-toc',
      'blank-status-quo',
    ])
  })
  it('bundles the status-quo fixture plus the two extension keys', () => {
    const fixture = importFromText(readFixtureText('theory-of-metacrisis-status-quo_v1.json'))
    if (!fixture.ok) throw new Error('fixture failed')
    expect(statusQuoMetacrisis()).toEqual({
      ...fixture.document,
      schemaVersion: 1,
      diagramType: 'status-quo',
    })
  })
  it('builds filenames from the title', () => {
    expect(exportFilename('Theory of the Status Quo: From A to B!')).toBe(
      'theory-of-the-status-quo-from-a-to-b.json',
    )
    expect(exportFilename('Café ???', '.tocb')).toBe('cafe.tocb.json')
    expect(exportFilename('???')).toBe('theory-of-change.json')
  })
})

describe('local draft', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDraft()
  })
  it('saves, loads and clears', () => {
    const doc = blankTheoryOfChange()
    expect(saveDraft(doc, NOW)?.savedAt).toBe(NOW.toISOString())
    expect(isDraftCurrent(doc)).toBe(true)
    expect(loadDraft()?.document.title).toBe(doc.title)
    clearDraft()
    expect(loadDraft()).toBeNull()
    expect(isDraftCurrent(doc)).toBe(false)
  })
  it('ignores a corrupt or invalid draft', () => {
    localStorage.setItem('toc-editor:draft', '{oops')
    expect(loadDraft()).toBeNull()
    localStorage.setItem('toc-editor:draft', JSON.stringify({ savedAt: 1, document: {} }))
    expect(loadDraft()).toBeNull()
  })
  it('returns null when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      const doc = blankTheoryOfChange()
      expect(saveDraft(doc)).toBeNull()
      expect(isDraftCurrent(doc)).toBe(false)
    } finally {
      Storage.prototype.setItem = setItem
    }
  })
})
