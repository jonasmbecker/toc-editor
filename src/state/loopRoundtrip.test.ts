import { describe, expect, it } from 'vitest'
import { parseDocument, type ToCDocument } from '../model/schema'
import { addConnection, findConnection, resolveConnection } from './connections'
import { setDirection } from './direction'
import { collapseMutualLoops } from '../model/normalize'
import { toCompatibleJson } from '../files/export'
import { buildFlow } from '../canvas/buildFlow'
import { extensionKeysIn, readFixtureText } from '../test/fixtures'

/**
 * The connections slice's review check: a loop drawn from a polycrisis outcome back to an
 * unmet need survives a full export/import, and the real theoryofchangebuilder-compatible
 * export (`files/export.ts`) of it still parses with every extension key gone.
 */

function loadStatusQuo(): ToCDocument {
  const result = parseDocument(
    JSON.parse(readFixtureText('theory-of-metacrisis-status-quo_v1.json')),
  )
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

const SOURCE = 'outcome-great-power-war'
const TARGET = 'need-brown-felt-safety'

describe('loop round-trip (review task loop-roundtrip)', () => {
  const fixture = loadStatusQuo()
  const added = addConnection(fixture, SOURCE, TARGET)
  if (!added.ok) throw new Error(`refused: ${added.refused}`)
  const bothWays = setDirection(added.document, added.ref, 'both')
  if (!bothWays.ok) throw new Error(`refused: ${bothWays.refused}`)
  const withLoop = bothWays.document

  it('the fixture is already in single-connection form (collapse is a no-op) with 44 connections', () => {
    expect(collapseMutualLoops(fixture)).toBe(fixture)
    const nodes = fixture.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))
    expect(nodes.flatMap((n) => n.connections)).toHaveLength(44)
  })

  it('a dragged connection from a polycrisis outcome to an unmet need is one-way backward, routed around the cards', () => {
    expect(resolveConnection(added.document, added.ref)?.direction).toBe('backward')
    expect(findConnection(added.document, added.ref)).not.toHaveProperty('isFeedbackLoop')
    const edge = buildFlow(added.document).edges.find((e) =>
      e.id.startsWith(`${SOURCE}->${TARGET}`),
    )
    expect(edge?.type).toBe('routed')
    expect(edge?.markerStart).toBeUndefined()
  })

  it('both ways flags it and gives the loop a head at each end', () => {
    expect(findConnection(withLoop, added.ref)?.isFeedbackLoop).toBe(true)
    const edge = buildFlow(withLoop).edges.find((e) => e.id.startsWith(`${SOURCE}->${TARGET}`))
    expect(edge?.type).toBe('routed')
    expect(edge?.markerStart).toMatchObject({ color: '#C2410C' })
  })

  it('full export then import keeps the loop flag and every other field', () => {
    const reimported = parseDocument(JSON.parse(JSON.stringify(withLoop)))
    expect(reimported.ok).toBe(true)
    if (!reimported.ok) return
    expect(reimported.document).toEqual(withLoop)
    expect(findConnection(reimported.document, added.ref)?.isFeedbackLoop).toBe(true)
  })

  it('compatible export (both ways expanded to a mutual pair, extension keys stripped) still parses', () => {
    const compatible = toCompatibleJson(withLoop)
    const reimported = parseDocument(JSON.parse(JSON.stringify(compatible)))
    expect(reimported.ok).toBe(true)
    if (!reimported.ok) return
    const connection = findConnection(reimported.document, added.ref)
    expect(connection).toMatchObject({ targetId: TARGET, confidence: 50 })
    expect(connection).not.toHaveProperty('isFeedbackLoop')
    expect(extensionKeysIn(compatible)).toEqual([])
    // 50 nodes; 44 from the file, the new arrow, its twin, and the fixture's own both-ways
    // arrow (consumerism cluster <-> marketing) expanded back into two.
    const nodes = reimported.document.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))
    expect(nodes).toHaveLength(50)
    expect(nodes.flatMap((n) => n.connections)).toHaveLength(47)
  })
})
