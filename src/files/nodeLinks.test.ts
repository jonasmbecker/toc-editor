import { describe, expect, it } from 'vitest'
import { toCompatibleJson, toFullJson } from './export'
import { parseDocument } from '../model/schema'
import { blankTheoryOfChange } from '../templates'

const NOW = new Date('2026-10-31T00:00:00Z')

function withLink() {
  const doc = blankTheoryOfChange()
  doc.sections[0].columns[0].nodes.push({
    id: 'a',
    title: 'A',
    text: 'About A.',
    color: '#E3F2FD',
    width: 232,
    yPosition: 0,
    connections: [],
    links: [{ url: 'https://example.org/a', label: 'Example' }],
  })
  return doc
}

describe('node links', () => {
  it('survive the full export and a re-parse', () => {
    const parsed = parseDocument(JSON.parse(JSON.stringify(toFullJson(withLink(), NOW))))
    if (!parsed.ok) throw new Error('parse failed')
    expect(parsed.document.sections[0].columns[0].nodes[0].links).toEqual([
      { url: 'https://example.org/a', label: 'Example' },
    ])
  })
  it('are folded into the text of the compatible export', () => {
    const node = toCompatibleJson(withLink(), NOW).sections[0].columns[0].nodes[0]
    expect(node.links).toBeUndefined()
    expect(node.text).toBe('About A.\nExample: https://example.org/a')
  })
  it('refuse a non-web address', () => {
    const doc = JSON.parse(JSON.stringify(withLink()))
    doc.sections[0].columns[0].nodes[0].links = [{ url: 'javascript:alert(1)' }]
    expect(parseDocument(doc).ok).toBe(false)
  })
})
