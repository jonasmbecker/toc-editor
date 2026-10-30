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
export const SECTION_HEADER_HEIGHT = 36
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
  width: number
}

export interface DocumentLayout {
  nodes: NodeLayout[]
  sectionHeaders: SectionHeaderLayout[]
  /** Rightmost edge of the last section, for sizing the canvas / minimap. */
  totalWidth: number
}

function columnWidth(nodeWidths: number[]): number {
  if (nodeWidths.length === 0) return EMPTY_COLUMN_WIDTH
  // A loop, not `Math.max(...widths)`: a spread of a very large column overflows the stack.
  let widest = 0
  for (const width of nodeWidths) if (width > widest) widest = width
  return widest
}

/**
 * Pure function: same document in, same layout out, every time. x comes from walking the
 * sections and columns left to right, widening each column to its widest node and spacing
 * columns and sections by the document's own `columnPadding` / `sectionPadding`. y is the
 * node's own `yPosition`, offset by a fixed header clearance so cards never sit under the
 * section bar.
 */
export function layoutDocument(doc: ToCDocument): DocumentLayout {
  const columnPadding = doc.columnPadding ?? 0
  const sectionPadding = doc.sectionPadding ?? 0

  const nodes: NodeLayout[] = []
  const sectionHeaders: SectionHeaderLayout[] = []
  let cursorX = CANVAS_MARGIN

  doc.sections.forEach((section, sectionIndex) => {
    const sectionStartX = cursorX

    section.columns.forEach((column, columnIndex) => {
      const width = columnWidth(column.nodes.map((node) => node.width))

      for (const node of column.nodes) {
        nodes.push({
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

    sectionHeaders.push({
      sectionIndex,
      title: section.title,
      x: sectionStartX,
      width: cursorX - sectionStartX,
    })

    const isLastSection = sectionIndex === doc.sections.length - 1
    if (!isLastSection) cursorX += sectionPadding
  })

  return { nodes, sectionHeaders, totalWidth: cursorX }
}
