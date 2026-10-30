import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument } from '../model/schema'
import { CANVAS_MARGIN, HEADER_CLEARANCE, layoutDocument } from './columns'

function loadStatusQuo() {
  const raw = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../fixtures/theory-of-metacrisis-status-quo_v1.json'),
      'utf8',
    ),
  )
  const result = parseDocument(raw)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

describe('layoutDocument', () => {
  const doc = loadStatusQuo()
  const layout = layoutDocument(doc)
  const byId = new Map(layout.nodes.map((n) => [n.nodeId, n]))

  it('positions every node from the document, none dropped or duplicated', () => {
    const nodeCount = doc.sections.reduce(
      (sum, s) => sum + s.columns.reduce((cs, c) => cs + c.nodes.length, 0),
      0,
    )
    expect(nodeCount).toBe(50)
    expect(layout.nodes).toHaveLength(50)
    expect(new Set(layout.nodes.map((n) => n.nodeId)).size).toBe(50)
  })

  it('starts the first column of the first section at the canvas margin', () => {
    const node = byId.get('need-brown-felt-safety')!
    expect(node.x).toBe(CANVAS_MARGIN)
    expect(node.sectionIndex).toBe(0)
    expect(node.columnIndex).toBe(0)
  })

  it("offsets the second column by the first column's widest node plus columnPadding", () => {
    // Column 0 of section 0 is all 192-wide nodes; columnPadding is 48.
    const node = byId.get('need-narm-connection')!
    expect(node.x).toBe(CANVAS_MARGIN + 192 + 48)
    expect(node.sectionIndex).toBe(0)
    expect(node.columnIndex).toBe(1)
  })

  it('keeps nodes in the same column at the same x, stacked by yPosition', () => {
    const connection = byId.get('need-narm-connection')!
    const attunement = byId.get('need-narm-attunement')!
    expect(attunement.x).toBe(connection.x)
    expect(attunement.y).toBe(HEADER_CLEARANCE + 200)
    expect(connection.y).toBe(HEADER_CLEARANCE + 40)
  })

  it("starts each later section after every prior section's full width plus sectionPadding", () => {
    // Section 0: col0 (192) + columnPadding (48) + col1 (220) = 460, from margin 24.
    const survivalStart = byId.get('strategy-numbing')!
    expect(survivalStart.x).toBe(24 + 460 + 48)

    // Section 1 is one column, widest node 220.
    const driversStart = byId.get('driver-erosion-sensemaking')!
    expect(driversStart.x).toBe(survivalStart.x + 220 + 48)

    // Section 2's widest node is the 260-wide bracketed clusters.
    const structuresStart = byId.get('structure-intergenerational-war-trauma')!
    expect(structuresStart.x).toBe(driversStart.x + 260 + 48)

    const outcomesStart = byId.get('annotation-civilizational-health')!
    expect(outcomesStart.x).toBe(structuresStart.x + 220 + 48)

    const marginaliaStart = byId.get('annotation-mate-health-crisis')!
    expect(marginaliaStart.x).toBe(outcomesStart.x + 220 + 48)
  })

  it('derives y purely from yPosition plus the fixed header clearance', () => {
    const node = byId.get('strategy-hunting-sexual-attraction')!
    expect(node.y).toBe(HEADER_CLEARANCE + 920)
  })

  it("produces one header per section, spanning that section's columns", () => {
    expect(layout.sectionHeaders).toHaveLength(6)
    const unmetNeeds = layout.sectionHeaders[0]
    expect(unmetNeeds.title).toBe('Unmet Needs (Brown & NARM)')
    expect(unmetNeeds.x).toBe(CANVAS_MARGIN)
    expect(unmetNeeds.width).toBe(192 + 48 + 220)
  })

  it('is pure: the same document produces an identical layout on a second call', () => {
    const again = layoutDocument(doc)
    expect(again).toEqual(layout)
  })
})
