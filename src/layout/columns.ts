import type { ToCDocument } from '../model/schema'

/**
 * theoryofchangebuilder.com's model has no x coordinate: a node's horizontal position is
 * implied by which section and column it sits in. This module derives it, so x is never
 * stored on the document and free horizontal dragging (a later slice) can only move a node
 * between columns, never off the derived grid.
 */

/** Left margin before the first section. Not part of the document format; a layout choice. */
export const CANVAS_MARGIN = 24

/** Rendered height of the section header bar (`SectionHeaderNode`). Kept here, next to
 * `HEADER_CLEARANCE`, so the two can't drift apart: raising the header's height without
 * raising the clearance would tuck the first row of cards under it. */
export const SECTION_HEADER_HEIGHT = 68
const HEADER_BREATHING_ROOM = 28

/** Vertical clearance between the section header band and a column's first node
 * (`yPosition: 0`). Not part of the document format; a layout choice. */
export const HEADER_CLEARANCE = SECTION_HEADER_HEIGHT + HEADER_BREATHING_ROOM

/** Width of a column with no nodes yet, and the default width of a new node, so an empty
 * section or column still has a footprint on the canvas instead of collapsing to nothing. */
export const EMPTY_COLUMN_WIDTH = 200

export interface NodeLayout {
  nodeId: string
  sectionIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
}

export interface SectionHeaderLayout {
  sectionIndex: number
  title: string
  x: number
  /** Top of the header bar: 0 on the spine and in the first row, lower for the rows below. */
  y: number
  width: number
  /** The row the section sits in; absent on the shared spine and in a flat map. */
  row?: string
}

/** The horizontal band one row of a matrix map occupies, for its label and background. */
export interface RowBandLayout {
  rowId: string
  title: string
  question?: string
  /** Top of the row's header bars. */
  top: number
  /** Where the next row's band starts, or an allowance below the last row's lowest card. */
  bottom: number
  /** Right edge of the row's last section, where the shared spine begins. */
  right: number
}

export interface DocumentLayout {
  nodes: NodeLayout[]
  sectionHeaders: SectionHeaderLayout[]
  /** One per declared row, top to bottom; empty for a flat map. */
  rowBands: RowBandLayout[]
  /** Rightmost edge of the last section, for sizing the canvas / minimap. */
  totalWidth: number
}

/** Room left of a matrix's rows for the row labels (Capability, Opportunity, Motivation). */
export const ROW_LABEL_WIDTH = 176

/** Free space Tidy keeps between the lowest card of one row and the first card of the next
 * (in `yPosition` units): the next row's header bars plus breathing room above them. */
export const ROW_GAP = 48 + HEADER_CLEARANCE

/** How far the last row's band reaches below its lowest card's top, as no height is known here. */
const LAST_ROW_ALLOWANCE = 160

function columnWidth(nodeWidths: number[]): number {
  if (nodeWidths.length === 0) return EMPTY_COLUMN_WIDTH
  // A loop, not `Math.max(...widths)`: a spread of a very large column overflows the stack.
  let widest = 0
  for (const width of nodeWidths) if (width > widest) widest = width
  return widest
}

interface Strip {
  nodes: NodeLayout[]
  sectionHeaders: SectionHeaderLayout[]
}

/** Lays the given sections out left to right from `startX`, headers at `headerY`; returns the
 * right edge of the last one. */
function placeSections(
  doc: ToCDocument,
  sectionIndexes: number[],
  start: { x: number; headerY: number },
  out: Strip,
): number {
  const columnPadding = doc.columnPadding ?? 0
  const sectionPadding = doc.sectionPadding ?? 0
  let cursorX = start.x
  sectionIndexes.forEach((sectionIndex, i) => {
    const section = doc.sections[sectionIndex]
    const sectionStartX = cursorX
    section.columns.forEach((column, columnIndex) => {
      const width = columnWidth(column.nodes.map((node) => node.width))
      for (const node of column.nodes) {
        out.nodes.push({
          nodeId: node.id,
          sectionIndex,
          columnIndex,
          x: cursorX,
          y: HEADER_CLEARANCE + node.yPosition,
          width: node.width,
        })
      }
      const isLastColumn = columnIndex === section.columns.length - 1
      cursorX += width + (isLastColumn ? 0 : columnPadding)
    })
    out.sectionHeaders.push({
      sectionIndex,
      title: section.title,
      x: sectionStartX,
      y: start.headerY,
      width: cursorX - sectionStartX,
      ...(section.row !== undefined ? { row: section.row } : {}),
    })
    if (i < sectionIndexes.length - 1) cursorX += sectionPadding
  })
  return cursorX
}

/** Lowest and highest `yPosition` of the cards in the given sections, or null when empty. */
function yRange(doc: ToCDocument, sectionIndexes: number[]): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const index of sectionIndexes) {
    for (const column of doc.sections[index].columns) {
      for (const node of column.nodes) {
        lo = Math.min(lo, node.yPosition)
        hi = Math.max(hi, node.yPosition)
      }
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null
}

/**
 * Pure function: same document in, same layout out, every time. x comes from walking the
 * sections and columns left to right, widening each column to its widest node and spacing
 * columns and sections by the document's own `columnPadding` / `sectionPadding`. y is the
 * node's own `yPosition`, offset by a fixed header clearance so cards never sit under the
 * section bar.
 *
 * A matrix map (version 2 `rows`) lays each row's sections out in their own horizontal band,
 * after a gutter for the row labels, and the shared spine once, right of the widest row.
 * `yPosition` stays one coordinate for the whole map: a row's header bars sit just above its
 * highest card, and Tidy keeps the rows apart (`ROW_GAP`).
 */
export function layoutDocument(doc: ToCDocument): DocumentLayout {
  const out: Strip = { nodes: [], sectionHeaders: [] }
  const rows = doc.rows ?? []
  const all = doc.sections.map((_, index) => index)
  if (rows.length === 0) {
    const totalWidth = placeSections(doc, all, { x: CANVAS_MARGIN, headerY: 0 }, out)
    return { ...out, rowBands: [], totalWidth }
  }

  const rowBands: RowBandLayout[] = []
  let nextTop = 0
  for (const row of rows) {
    const indexes = all.filter((i) => doc.sections[i].row === row.id)
    const range = yRange(doc, indexes)
    const top = range ? range[0] : nextTop
    const right = placeSections(
      doc,
      indexes,
      { x: CANVAS_MARGIN + ROW_LABEL_WIDTH, headerY: top },
      out,
    )
    const previous = rowBands[rowBands.length - 1]
    if (previous) previous.bottom = top
    rowBands.push({
      rowId: row.id,
      title: row.title,
      ...(row.question !== undefined ? { question: row.question } : {}),
      top,
      bottom: (range ? range[1] : top) + HEADER_CLEARANCE + LAST_ROW_ALLOWANCE,
      right,
    })
    nextTop = (range ? range[1] : top) + ROW_GAP
  }
  const spine = all.filter((i) => doc.sections[i].row === undefined)
  const sectionPadding = doc.sectionPadding ?? 0
  const spineX = Math.max(...rowBands.map((band) => band.right)) + sectionPadding
  const totalWidth =
    spine.length > 0 ? placeSections(doc, spine, { x: spineX, headerY: 0 }, out) : spineX
  return { ...out, rowBands, totalWidth }
}
