import { describe, expect, it } from 'vitest'
import { parseDocument, type ToCDocument } from '../model/schema'
import { toCompatibleJson, toFullJson } from '../files/export'
import { evidencePatch } from '../panels/useEvidenceBlocks'
import { updateConnection, findConnection } from './connections'
import { allNodes } from './tree'
import { extensionKeysIn, listFixtures, readFixtureText } from '../test/fixtures'

/**
 * The evidence-links slice's review check: tagged and linked evidence on two connections of
 * the real status-quo map survives a full export and re-import, and the compatible export
 * carries it as flattened text with the extension gone.
 */

function load(name: string): ToCDocument {
  const result = parseDocument(JSON.parse(readFixtureText(name)))
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

const reimport = (doc: unknown) => parseDocument(JSON.parse(JSON.stringify(doc)))

describe('evidence round-trip (review task evidence-roundtrip)', () => {
  const fixture = load('theory-of-metacrisis-status-quo_v1.json')
  const sources = allNodes(fixture).filter((n) => n.connections.length > 0)
  const refs = [sources[0], sources[1]].map((n) => ({ sourceId: n.id, index: 0 }))
  let edited = fixture
  edited = updateConnection(
    edited,
    refs[0],
    evidencePatch([
      {
        text: 'Van der Kolk, ch. 9',
        supports: [2],
        links: [{ url: 'https://a.org/b', label: 'Book' }],
      },
    ]),
  )
  edited = updateConnection(
    edited,
    refs[1],
    evidencePatch([{ text: 'A paper', supports: [1] }, { text: 'Untagged note' }]),
  )

  it('full export re-imports deep-equal, blocks included', () => {
    const full = toFullJson(edited, new Date(0))
    const back = reimport(full)
    expect(back.ok && back.document).toEqual(full)
    expect(findConnection(edited, refs[0])?.evidenceBlocks?.[0].links?.[0].url).toBe(
      'https://a.org/b',
    )
  })

  it('compatible export flattens tags and links into the evidence string and strips the key', () => {
    const compatible = toCompatibleJson(edited)
    expect(extensionKeysIn(compatible)).toEqual([])
    const back = reimport(compatible)
    if (!back.ok) throw new Error(back.errors.join('; '))
    expect(findConnection(back.document, refs[0])?.evidence).toBe(
      'Van der Kolk, ch. 9\nSupports mechanism 2\nBook: https://a.org/b',
    )
    expect(findConnection(back.document, refs[1])?.evidence).toBe(
      'A paper\nSupports mechanism 1\n\nUntagged note',
    )
  })

  it('every plain fixture still imports with no evidenceBlocks added', () => {
    for (const name of listFixtures()) {
      const doc = load(name)
      const keys = extensionKeysIn(doc).filter((k) => k.endsWith('evidenceBlocks'))
      expect(keys, name).toEqual([])
    }
  })
})
