import { describe, expect, it } from 'vitest'
import { validateMap } from '../../scripts/validate-map.mjs'
import { importFromJson } from './import'
import { mergeDocument, splitDocument, type MapContent, type MapLayout } from './split'
import type { ToCDocument } from '../model/schema'
import { COM_B_DRAFT_FIXTURE, listFixtures, readFixtureText } from '../test/fixtures'

/**
 * The theory repo's map check (`scripts/validate-map.mjs`) and the editor's schema must agree:
 * a map the check passes has to open in the editor, and the matrix rules have to be refused by
 * both. The check is deliberately stricter in a few places (a link to a missing card, positions
 * in content.json), which the editor tolerates on import but a pull request should not add.
 */

type Json = Record<string, unknown>
type Pair = { content: MapContent; layout: MapLayout }

function editorOpens({ content, layout }: Pair): boolean {
  const merged = mergeDocument(structuredClone(content), structuredClone(layout))
  return merged.ok && importFromJson(merged.document).ok
}

function pairOf(name: string): Pair {
  const imported = importFromJson(JSON.parse(readFixtureText(name)))
  if (!imported.ok) throw new Error(imported.errors.join('; '))
  return JSON.parse(JSON.stringify(splitDocument(imported.document))) as Pair
}

const sectionsOf = (pair: Pair) =>
  pair.content.sections as { row?: string; columns: { nodes: Json[] }[] }[]
const firstCard = (pair: Pair) => sectionsOf(pair)[0].columns[0].nodes[0]

describe('the map check agrees with the editor', () => {
  it.each([...listFixtures(), COM_B_DRAFT_FIXTURE])('%s passes both, as version 2', (name) => {
    const pair = pairOf(name)
    expect(pair.content.version).toBe(2)
    expect(validateMap(pair.content, pair.layout)).toEqual([])
    expect(editorOpens(pair)).toBe(true)
  })

  it('still passes the version 1 theory map as stored today', () => {
    const imported = importFromJson(
      JSON.parse(readFixtureText('theory-of-metacrisis-status-quo_v2.json')),
    )
    if (!imported.ok) throw new Error('import failed')
    const v1 = { ...imported.document, schemaVersion: 1 } as Json
    delete v1.version
    const pair = splitDocument(v1 as unknown as ToCDocument)
    expect(validateMap(pair.content, pair.layout)).toEqual([])
    expect(editorOpens(pair)).toBe(true)
  })

  const broken: [string, (pair: Pair) => void][] = [
    ['an undeclared row', (p) => (sectionsOf(p)[0].row = 'volition')],
    [
      'a row section after the spine',
      (p) => (sectionsOf(p)[sectionsOf(p).length - 1].row = 'capability'),
    ],
    ['a card layer in version 2', (p) => (firstCard(p).layer = 'capability')],
    ['a newer format version', (p) => (p.content.version = 3)],
    [
      'a duplicate row',
      (p) => (p.content.rows = [...(p.content.rows as Json[]), (p.content.rows as Json[])[0]]),
    ],
    ['a duplicate card id', (p) => (sectionsOf(p)[0].columns[0].nodes[1].id = firstCard(p).id)],
    ['a colour that is not hex', (p) => (firstCard(p).color = 'red')],
    [
      'a link that is not a web address',
      (p) => (firstCard(p).links = [{ url: 'javascript:alert(1)' }]),
    ],
    ['a card without a title', (p) => delete firstCard(p).title],
    ['a confidence above 100', (p) => ((firstCard(p).connections as Json[])[0].confidence = 150)],
  ]

  it.each(broken)('both refuse %s', (_, breakIt) => {
    const pair = pairOf(COM_B_DRAFT_FIXTURE)
    breakIt(pair)
    expect(validateMap(pair.content, pair.layout)).not.toEqual([])
    expect(editorOpens(pair)).toBe(false)
  })
})
