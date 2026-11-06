import { isBandSection, type ToCDocument } from '../model/schema'

/**
 * theoryofchangebuilder.com's model has no x coordinate: a node's horizontal position is
 * implied by which section and column it sits in. This module derives it, so x is never
 * stored on the document and free horizontal dragging (a later slice) can only move a node
 * between columns, never off the derived grid.
 *
 * A band section (`display: "band"`) is laid out under the columns instead of beside them: a
 * full-width strip whose own columns run left to right inside it. Its cards keep their stored
 * `yPosition` like any other card, so where the band sits follows from where its cards are; Tidy
 * puts them below the lowest column card (see `layout/align.ts`).
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

/** Room between the band's edge and its cards, left and right. */
export const BAND_INSET = 24
/** Space between the lowest column card and a band's header. */
export const BAND_GAP = 64
/** Card height assumed where layout needs one and has no measurement (an empty band's top). */
const ESTIMATED_CARD_HEIGHT = 100

export interface NodeLayout {
  nodeId: string
  sectionIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
  /** The card sits in a band section, not in the columns. */
  inBand?: boolean
}

export interface SectionHeaderLayout {
  sectionIndex: number
  title: string
  x: number
  width: number
}

/** A band section: its header's top-left corner and width. The strip around its cards is sized
 * on the canvas from their measured heights. */
export interface BandLayout {
  sectionIndex: number
  title: string
  x: number
  y: number
  width: number
}

export interface DocumentLayout {
  nodes: NodeLayout[]
  /** Column sections only; a band's header is in `bands`. */
  sectionHeaders: SectionHeaderLayout[]
  bands: BandLayout[]
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
  const columnSections = doc.sections
    .map((section, sectionIndex) => ({ section, sectionIndex }))
    .filter(({ section }) => !isBandSection(section))

  columnSections.forEach(({ section, sectionIndex }, order) => {
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

    const isLastSection = order === columnSections.length - 1
    if (!isLastSection) cursorX += sectionPadding
  })

  const bands = layoutBands(doc, nodes, cursorX)
  const bandRight = Math.max(cursorX, ...bands.map((b) => b.x + b.width))
  return { nodes, sectionHeaders, bands, totalWidth: bandRight }
}

/** How a band's cards sit side by side: each card (a group with its cards counts as one) takes
 * the next slot, left to right in document order, wrapping to a new row when the band is full.
 * Shared with Tidy, which stacks the rows (see `layout/align.ts`). */
export interface BandSlots {
  /** Slot of every card id in the band, members of a group sharing the group's slot. */
  slotOf: Map<string, number>
  perRow: number
  slotWidth: number
}

export function bandSlots(
  section: ToCDocument['sections'][number],
  columnPadding: number,
  bandWidth: number,
): BandSlots {
  const nodes = section.columns.flatMap((column) => column.nodes)
  const slotWidth = columnWidth(nodes.map((node) => node.width))
  const keys: string[] = []
  const slotOf = new Map<string, number>()
  for (const node of nodes) {
    const key = node.groupId ?? node.id
    if (!keys.includes(key)) keys.push(key)
    slotOf.set(node.id, keys.indexOf(key))
  }
  const room = bandWidth - 2 * BAND_INSET + columnPadding
  const perRow = Math.max(1, Math.floor(room / (slotWidth + columnPadding)))
  return { slotOf, perRow, slotWidth }
}

/** The x a band card's slot starts at. */
export function bandSlotX(slots: BandSlots, slot: number, columnPadding: number): number {
  return CANVAS_MARGIN + BAND_INSET + (slot % slots.perRow) * (slots.slotWidth + columnPadding)
}

/** Width of every band: the columns' full width, so Tidy and layout agree on where rows wrap. */
export function bandWidth(columnsRight: number): number {
  return Math.max(columnsRight - CANVAS_MARGIN, EMPTY_COLUMN_WIDTH + 2 * BAND_INSET)
}

/** Appends every band's cards to `nodes` and returns the bands, top to bottom in document order. */
function layoutBands(doc: ToCDocument, nodes: NodeLayout[], columnsRight: number): BandLayout[] {
  const columnPadding = doc.columnPadding ?? 0
  const width = bandWidth(columnsRight)
  const bands: BandLayout[] = []
  let floor = -Infinity
  for (const node of nodes) floor = Math.max(floor, node.y + ESTIMATED_CARD_HEIGHT)
  if (!Number.isFinite(floor)) floor = HEADER_CLEARANCE

  doc.sections.forEach((section, sectionIndex) => {
    if (!isBandSection(section)) return
    const first = nodes.length
    const slots = bandSlots(section, columnPadding, width)
    section.columns.forEach((column, columnIndex) => {
      for (const node of column.nodes) {
        nodes.push({
          nodeId: node.id,
          sectionIndex,
          columnIndex,
          x: bandSlotX(slots, slots.slotOf.get(node.id)!, columnPadding),
          y: HEADER_CLEARANCE + node.yPosition,
          width: node.width,
          inBand: true,
        })
      }
    })
    const cards = nodes.slice(first)
    // The header sits a header-clearance above the band's highest card, the same distance as a
    // column header above `yPosition: 0`; an empty band takes the next free place.
    const y =
      cards.length > 0 ? Math.min(...cards.map((n) => n.y)) - HEADER_CLEARANCE : floor + BAND_GAP
    bands.push({ sectionIndex, title: section.title, x: CANVAS_MARGIN, y, width })
    for (const n of cards) floor = Math.max(floor, n.y + ESTIMATED_CARD_HEIGHT)
    if (cards.length === 0) floor = y + HEADER_CLEARANCE
  })
  return bands
}
