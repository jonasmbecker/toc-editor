import type { ToCDocument } from '../model/schema'

/**
 * The theory repo keeps the map in two files so a proposal's diff shows what changed in the
 * theory, not which cards moved: `content.json` holds everything but positions, `layout.json`
 * holds only positions. `splitDocument` and `mergeDocument` are exact inverses, so merging the
 * two files of a split reproduces the original document, key order included.
 */

export interface CardLayout {
  width: number
  yPosition: number
}

export interface MapLayout {
  textSize?: number
  curvature?: number
  columnPadding?: number
  sectionPadding?: number
  /** Positions keyed by card id, keys sorted so a moved card is a one-line diff. */
  cards: Record<string, CardLayout>
}

/** A document without the positional fields; same shape otherwise, so it round-trips as JSON. */
export type MapContent = Record<string, unknown>

const DOCUMENT_LAYOUT_KEYS = ['textSize', 'curvature', 'columnPadding', 'sectionPadding'] as const
const CARD_LAYOUT_KEYS = ['width', 'yPosition'] as const

export function splitDocument(doc: ToCDocument): { content: MapContent; layout: MapLayout } {
  const cards: Record<string, CardLayout> = {}
  const sections = doc.sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      nodes: column.nodes.map((node) => {
        const { width, yPosition, ...rest } = node
        cards[node.id] = { width, yPosition }
        return rest
      }),
    })),
  }))

  const content: MapContent = {}
  const layout: MapLayout = { cards: {} }
  for (const [key, value] of Object.entries(doc)) {
    if ((DOCUMENT_LAYOUT_KEYS as readonly string[]).includes(key)) {
      ;(layout as unknown as Record<string, unknown>)[key] = value
    } else {
      content[key] = key === 'sections' ? sections : value
    }
  }
  layout.cards = Object.fromEntries(Object.entries(cards).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { content, layout }
}

export type MergeResult = { ok: true; document: ToCDocument } | { ok: false; errors: string[] }

/** Puts `entries` after `anchor` in `source`'s key order (or at the end if the anchor is absent). */
function insertAfter(
  source: Record<string, unknown>,
  anchor: string,
  entries: [string, unknown][],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    out[key] = value
    if (key === anchor) for (const [k, v] of entries) out[k] = v
  }
  if (!(anchor in source)) for (const [k, v] of entries) out[k] = v
  return out
}

export function mergeDocument(content: MapContent, layout: MapLayout): MergeResult {
  const errors: string[] = []
  const sourceSections = Array.isArray(content.sections) ? content.sections : null
  if (!sourceSections) return { ok: false, errors: ['content.json has no sections list.'] }

  const sections = sourceSections.map((section: Record<string, unknown>) => ({
    ...section,
    columns: (section.columns as Record<string, unknown>[]).map((column) => ({
      ...column,
      // `Omit` over the passthrough node type collapses to an index signature, so name the one
      // field read here instead.
      nodes: (column.nodes as (Record<string, unknown> & { id: string })[]).map((node) => {
        const place = layout.cards[node.id]
        if (!place) {
          errors.push(`layout.json has no position for card "${node.id}".`)
          return node
        }
        return insertAfter(
          node,
          'color',
          CARD_LAYOUT_KEYS.map((k): [string, unknown] => [k, place[k]]),
        )
      }),
    })),
  }))
  if (errors.length > 0) return { ok: false, errors }

  const numbers = DOCUMENT_LAYOUT_KEYS.filter((k) => layout[k] !== undefined).map(
    (k): [string, unknown] => [k, layout[k]],
  )
  const withSections = { ...content, sections }
  return {
    ok: true,
    document: insertAfter(withSections, 'sections', numbers) as unknown as ToCDocument,
  }
}

/** The exact text written to a map file: 2-space JSON and a final newline. */
export function serializeMapFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
