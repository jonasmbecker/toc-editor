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

function sectionSpans(doc: ToCDocument): (Span & { sectionIndex: number })[] {
  return layoutDocument(doc).sectionHeaders.map((h) => ({
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
 * placing a node into a specific empty column is the node panel's job, not drag's. */
export function resolveDropTarget(doc: ToCDocument, centerX: number): DropTarget {
  const sections = sectionSpans(doc)
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
