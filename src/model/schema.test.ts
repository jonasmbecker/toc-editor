import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument } from './schema'

const fixturesDir = resolve(__dirname, '../../fixtures')
const fixtureFiles = readdirSync(fixturesDir).filter((name) => name.endsWith('.json'))

describe('parseDocument', () => {
  it('finds the real fixtures to test against', () => {
    expect(fixtureFiles.length).toBeGreaterThan(0)
  })

  it.each(fixtureFiles)('parses %s without error', (file) => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, file), 'utf8'))
    const result = parseDocument(raw)
    expect(result.ok).toBe(true)
  })

  it('counts nodes and connections on the status-quo fixture', () => {
    const raw = JSON.parse(
      readFileSync(resolve(fixturesDir, 'theory-of-metacrisis-status-quo_v1.json'), 'utf8'),
    )
    const result = parseDocument(raw)
    if (!result.ok) throw new Error(result.errors.join('; '))
    const nodes = result.document.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))
    const connections = nodes.flatMap((n) => n.connections)
    expect(nodes).toHaveLength(50)
    // 44 since the one two-headed whiteboard arrow is stored once (`isFeedbackLoop`), not as a pair.
    expect(connections).toHaveLength(44)
  })

  it('preserves unknown keys via passthrough', () => {
    const result = parseDocument({
      color: '#000000',
      title: 'Minimal doc',
      sections: [],
      somethingFromTheFuture: { nested: true },
    })
    if (!result.ok) throw new Error(result.errors.join('; '))
    expect((result.document as Record<string, unknown>).somethingFromTheFuture).toEqual({
      nested: true,
    })
  })

  it('returns readable errors for an invalid document', () => {
    const result = parseDocument({ title: 'Missing color and sections' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.startsWith('color'))).toBe(true)
  })

  it.each(fixtureFiles)('round-trips %s structurally unchanged', (file) => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, file), 'utf8'))
    const result = parseDocument(raw)
    if (!result.ok) throw new Error(result.errors.join('; '))
    // Deep-equal, not byte-identical: zod emits known keys before passthrough keys, so key
    // order can differ even though every value is the same. That's the round-trip guarantee
    // this schema actually makes (see the file-level comment); a byte-identical guarantee
    // would mean patching the original raw object instead of re-serialising the parsed one.
    expect(result.document).toEqual(raw)
  })

  it('rejects a colour that is not 6-digit hex', () => {
    const result = parseDocument({ color: 'red', title: 'x', sections: [] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.includes('color') && e.includes('hex'))).toBe(true)
  })

  it('rejects two nodes sharing an id', () => {
    const node = {
      id: 'dup',
      title: 'A',
      text: '',
      color: '#000000',
      width: 100,
      yPosition: 0,
      connections: [],
    }
    const result = parseDocument({
      color: '#000000',
      title: 'x',
      sections: [{ title: 's', columns: [{ nodes: [node, { ...node, title: 'B' }] }] }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.includes('duplicate node id "dup"'))).toBe(true)
  })
})
