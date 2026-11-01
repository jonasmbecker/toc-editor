import type { ToCDocument } from '../model/schema'
import { layoutDocument } from '../layout/columns'

export interface DropTarget {
  sectionIndex: number
  /** May equal (or exceed) the section's current column count — see `resolveDropTarget`. */
  columnIndex: number
}

interface Span {
  left: number
  right: number
}

/** The sections a drop at height `y` can land in: in a matrix, the sections of the row whose band
 * holds `y` plus the shared spine; in a flat map, all of them. */
function sectionSpans(doc: ToCDocument, y?: number): (Span & { sectionIndex: number })[] {
  const layout = layoutDocument(doc)
  const band =
    y === undefined
      ? undefined
      : (layout.rowBands.find((b) => y < b.bottom) ?? layout.rowBands[layout.rowBands.length - 1])
  const headers = band
    ? layout.sectionHeaders.filter((h) => h.row === undefined || h.row === band.rowId)
    : layout.sectionHeaders
  return headers.map((h) => ({
    sectionIndex: h.sectionIndex,
    left: h.x,
    right: h.x + h.width,
  }))
}

function columnSpansInSection(
  doc: ToCDocument,
  sectionIndex: number,
): (Span & { columnIndex: number })[] {
  const spans = new Map<number, Span>()
  for (const node of layoutDocument(doc).nodes) {
    if (node.sectionIndex !== sectionIndex) continue
    const span = spans.get(node.columnIndex)
    if (span) {
      span.left = Math.min(span.left, node.x)
      span.right = Math.max(span.right, node.x + node.width)
    } else {
      spans.set(node.columnIndex, { left: node.x, right: node.x + node.width })
    }
  }
  return [...spans.entries()]
    .map(([columnIndex, span]) => ({ columnIndex, ...span }))
    .sort((a, b) => a.columnIndex - b.columnIndex)
}

function nearestSpan<T extends Span>(spans: T[], x: number): T {
  const hit = spans.find((s) => x >= s.left && x < s.right)
  if (hit) return hit
  return x < spans[0].left ? spans[0] : spans[spans.length - 1]
}

/** Picks the section and column a card was dropped over, from its post-drag centre x. A column
 * with no nodes has no visual footprint (`layoutDocument` gives it zero width), so a drop over
 * one resolves to "append a new column" rather than guessing which invisible column was meant —
 * placing a node into a specific empty column is the node panel's job, not drag's. In a matrix
 * map `top`, the card's top edge, picks the row: a card stays in or moves to the row it is over. */
export function resolveDropTarget(doc: ToCDocument, centerX: number, top?: number): DropTarget {
  const sections = sectionSpans(doc, top)
  if (sections.length === 0) return { sectionIndex: 0, columnIndex: 0 }
  const section = nearestSpan(sections, centerX)

  const columns = columnSpansInSection(doc, section.sectionIndex)
  if (columns.length === 0) {
    return {
      sectionIndex: section.sectionIndex,
      columnIndex: doc.sections[section.sectionIndex].columns.length,
    }
  }
  return {
    sectionIndex: section.sectionIndex,
    columnIndex: nearestSpan(columns, centerX).columnIndex,
  }
}

/** Rounds a dropped node's raw y to the nearest 8px grid step, never negative. */
export function snapYPosition(rawY: number, step = 8): number {
  return Math.max(0, Math.round(rawY / step) * step)
}
