import { describe, expect, it } from 'vitest'
import statusQuoJson from '../templates/status-quo-metacrisis.json'
import type { ToCDocument } from '../model/schema'
import { hasChanges, layoutLine, summarizeChanges, summaryTitle } from './changeSummary'

const live = statusQuoJson as unknown as ToCDocument

function edited(change: (doc: ToCDocument) => void): ToCDocument {
  const doc = structuredClone(live)
  change(doc)
  return doc
}

function card(doc: ToCDocument, id: string) {
  const found = doc.sections
    .flatMap((section) => section.columns.flatMap((column) => column.nodes))
    .find((node) => node.id === id)
  if (!found) throw new Error(`no card ${id}`)
  return found
}

const TRAUMA = 'structure-intergenerational-war-trauma'
const FREEZE = 'structure-collective-freeze'

describe('summarizeChanges', () => {
  it('reports nothing for identical maps', () => {
    const summary = summarizeChanges(live, structuredClone(live))
    expect(summary).toEqual({
      lines: [],
      cardsAdded: 0,
      cardsRemoved: 0,
      moved: 0,
      layoutChanged: false,
    })
    expect(hasChanges(summary)).toBe(false)
    expect(summaryTitle(summary)).toBe('No changes')
  })

  it('names an added link in the words of the plan', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).connections.push({ targetId: FREEZE, confidence: 50 })
    })
    const summary = summarizeChanges(live, next)
    expect(summary.lines).toEqual([
      `Added link: "Intergenerational war trauma" → "Collective 'freeze'"`,
    ])
    expect(summaryTitle(summary)).toBe(summary.lines[0])
  })

  it('names a removed link, and lists links into a removed card but not out of it', () => {
    const target = card(live, TRAUMA).connections[0].targetId
    const removedLink = edited((doc) => {
      card(doc, TRAUMA).connections = []
    })
    expect(summarizeChanges(live, removedLink).lines).toEqual([
      `Removed link: "Intergenerational war trauma" → "${card(live, target).title}"`,
    ])

    // Deleting a card in the editor also deletes the links that point at it.
    const withoutTarget = edited((doc) => {
      for (const column of doc.sections.flatMap((section) => section.columns)) {
        column.nodes = column.nodes.filter((node) => node.id !== target)
        for (const node of column.nodes) {
          node.connections = node.connections.filter((link) => link.targetId !== target)
        }
      }
    })
    const lines = summarizeChanges(live, withoutTarget).lines
    expect(lines[0]).toBe(`Removed card: "${card(live, target).title}"`)
    expect(lines).toContain(
      `Removed link: "Intergenerational war trauma" → "${card(live, target).title}"`,
    )
    // The removed card's own outgoing links vanish with it and are not listed one by one.
    expect(
      lines.filter((line) => line.startsWith('Removed link: "' + card(live, target).title)),
    ).toEqual([])
  })

  it('names added, removed and renamed cards and changed descriptions', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).title = 'Inherited war trauma'
      card(doc, FREEZE).text = 'A new description.'
      const column = doc.sections[0].columns[0]
      column.nodes.push({
        id: 'new-card',
        title: 'Fresh idea',
        text: 'x',
        color: '#E3F2FD',
        width: 300,
        yPosition: 0,
        connections: [],
      })
      column.nodes.shift()
    })
    const summary = summarizeChanges(live, next)
    expect(summary.lines).toEqual([
      'Added card: "Fresh idea"',
      'Removed card: "Felt safety"',
      'Renamed card: "Intergenerational war trauma" → "Inherited war trauma"',
      'Changed the description of "Collective \'freeze\'"',
    ])
    expect(summary.cardsAdded).toBe(1)
    expect(summary.cardsRemoved).toBe(1)
  })

  it('names a changed confidence, reasoning and feedback-loop flag of a link', () => {
    const next = edited((doc) => {
      const link = card(doc, TRAUMA).connections[0]
      link.confidence = 90
      link.assumptions = 'A new assumption.'
      link.isFeedbackLoop = true
    })
    const label = `"Intergenerational war trauma" → "${card(live, card(live, TRAUMA).connections[0].targetId).title}"`
    expect(summarizeChanges(live, next).lines).toEqual([
      `Changed the confidence of the link ${label} from not set to 90`,
      `Changed the reasoning behind the link ${label}`,
      `Marked the link ${label} as a feedback loop`,
    ])
  })

  it('names added and removed web addresses on a card', () => {
    const had = card(live, 'need-brown-felt-safety').links ?? []
    const next = edited((doc) => {
      card(doc, 'need-brown-felt-safety').links = [
        { url: 'https://example.org/a', label: 'Example' },
      ]
    })
    const lines = summarizeChanges(live, next).lines
    expect(lines[0]).toBe('Added a web address to "Felt safety": Example (https://example.org/a)')
    expect(lines).toHaveLength(1 + had.length)
    expect(
      lines.slice(1).every((line) => line.startsWith('Removed a web address from "Felt safety"')),
    ).toBe(true)
  })

  it('names group moves', () => {
    const groupId = card(live, 'need-narm-thinking').groupId
    expect(groupId).toBeTruthy()
    const out = edited((doc) => {
      delete card(doc, 'need-narm-thinking').groupId
    })
    expect(summarizeChanges(live, out).lines).toEqual([
      'Took "Thinking" out of the group "Connection"',
    ])
    const into = edited((doc) => {
      card(doc, 'need-brown-attunement').groupId = groupId
    })
    expect(summarizeChanges(live, into).lines).toEqual([
      'Put "Attunement" into the group "Connection"',
    ])
  })

  it('names other changed details of a card without printing their values', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).color = '#FFFFFF'
    })
    expect(summarizeChanges(live, next).lines).toEqual([
      'Changed other details of "Intergenerational war trauma" (color)',
    ])
  })

  it('names a renamed map and a moved column', () => {
    const next = edited((doc) => {
      doc.title = 'Another title'
      const [first, second] = doc.sections[0].columns
      ;[first.nodes, second.nodes] = [second.nodes, first.nodes]
    })
    // The old title is longer than the 60 characters a line shows, so it is cut with an ellipsis.
    expect(live.title.length).toBeGreaterThan(60)
    expect(summarizeChanges(live, next).lines).toEqual([
      `Renamed the map: "${live.title.slice(0, 59)}…" → "Another title"`,
      'Rearranged cards or sections',
    ])
  })

  it('counts moved cards separately and keeps them out of the lines', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).yPosition += 40
      card(doc, FREEZE).width += 10
    })
    const summary = summarizeChanges(live, next)
    expect(summary.lines).toEqual([])
    expect(summary.moved).toBe(2)
    expect(summary.layoutChanged).toBe(true)
    expect(hasChanges(summary)).toBe(true)
    expect(layoutLine(summary)).toBe('Moved 2 cards on the map')
    expect(summaryTitle(summary)).toBe('Moved 2 cards on the map')
  })

  it('reports a spacing change when no card moved', () => {
    const next = edited((doc) => {
      doc.curvature = (doc.curvature ?? 0) + 0.1
    })
    const summary = summarizeChanges(live, next)
    expect(summary.moved).toBe(0)
    expect(layoutLine(summary)).toBe("Changed the map's spacing or text size")
  })

  it('shortens long titles and flattens line breaks', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).title = `Line one\nline two ${'x'.repeat(200)}`
    })
    const [line] = summarizeChanges(live, next).lines
    expect(line).not.toContain('\n')
    expect(line).toContain('…')
    expect(line.length).toBeLessThan(200)
  })

  it('headlines the first change and counts the rest, within 100 characters', () => {
    const next = edited((doc) => {
      card(doc, TRAUMA).title = 'y'.repeat(300)
      card(doc, FREEZE).text = 'changed'
    })
    const title = summaryTitle(summarizeChanges(live, next))
    expect(title.length).toBeLessThanOrEqual(100)
    expect(title.endsWith(' and 1 other change')).toBe(true)
  })
})
