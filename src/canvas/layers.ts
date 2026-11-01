import type { ToCDocument } from '../model/schema'
import { CANVAS_MARGIN, type DocumentLayout } from '../layout/columns'
import type { ConnectionEdgeType } from './ConnectionEdge'
import type { RowBandNodeType } from './RowBandNode'

/**
 * The matrix view of a map with rows (version 2): one band per row behind its sections, each
 * row in its own colour, and, with a layer chosen, only that layer's links. The layer colour
 * sits on the band, the row label and the links; a card's left edge keeps its need colour.
 */

/** COM-B layers in fixed colours; any other row id takes the next colour of the fallback list. */
export const ROW_COLORS: Record<string, string> = {
  capability: '#0F766E',
  opportunity: '#B45309',
  motivation: '#7C3AED',
}
const FALLBACK_ROW_COLORS = ['#0369A1', '#BE185D', '#15803D']

export function rowColor(doc: ToCDocument, rowId: string): string {
  const index = (doc.rows ?? []).findIndex((row) => row.id === rowId)
  return ROW_COLORS[rowId] ?? FALLBACK_ROW_COLORS[Math.max(0, index) % FALLBACK_ROW_COLORS.length]
}

/** The row of every node in a row section; spine nodes are absent. */
export function rowOfNode(doc: ToCDocument): Map<string, string> {
  const rows = new Map<string, string>()
  for (const section of doc.sections) {
    if (section.row === undefined) continue
    for (const column of section.columns)
      for (const node of column.nodes) rows.set(node.id, section.row)
  }
  return rows
}

/** Spine nodes reached from the layer's cards by following forward links through the spine. A
 * walk stops at other layers' cards, so one layer's view never borrows another layer's chain. */
function reachedSpine(edges: ConnectionEdgeType[], rows: Map<string, string>, layer: string) {
  const reached = new Set<string>()
  const queue = edges
    .filter((e) => rows.get(e.source) === layer && !rows.has(e.target) && !e.data?.backward)
    .map((e) => e.target)
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reached.has(id)) continue
    reached.add(id)
    for (const e of edges) {
      if (e.source === id && !rows.has(e.target) && !e.data?.backward) queue.push(e.target)
    }
  }
  return reached
}

/** Whether an edge belongs to the chosen layer's view: it touches the layer and otherwise only
 * the spine, or it runs between spine cards the layer's links reach. */
function inLayer(
  edge: ConnectionEdgeType,
  rows: Map<string, string>,
  layer: string,
  reached: Set<string>,
): boolean {
  const [a, b] = [rows.get(edge.source), rows.get(edge.target)]
  if (a === undefined && b === undefined) return reached.has(edge.source)
  return (a ?? layer) === layer && (b ?? layer) === layer
}

export interface LayerView {
  bands: RowBandNodeType[]
  edges: ConnectionEdgeType[]
  /** Cards of the other layers, drawn faded while a layer is chosen. */
  ghosts: Set<string>
}

/** Colours each forward link by the layer it leaves; with a layer chosen, keeps only that
 * layer's links and fades the other rows, each band saying how many of its links are hidden. */
export function layerView(
  doc: ToCDocument,
  layout: DocumentLayout,
  edges: ConnectionEdgeType[],
  activeRow?: string,
): LayerView {
  const rows = rowOfNode(doc)
  const coloured = edges.map((edge) => {
    const row = rows.get(edge.source)
    if (row === undefined || edge.data?.backward || edge.data?.isFeedbackLoop) return edge
    return { ...edge, data: { ...edge.data!, tint: rowColor(doc, row) } }
  })
  const reached = activeRow ? reachedSpine(coloured, rows, activeRow) : new Set<string>()
  const shown = activeRow
    ? coloured.filter((edge) => inLayer(edge, rows, activeRow, reached))
    : coloured
  const ghosts = new Set(
    activeRow ? [...rows].filter(([, row]) => row !== activeRow).map(([id]) => id) : [],
  )
  return { bands: bandNodes(doc, layout, coloured, rows, activeRow), edges: shown, ghosts }
}

function bandNodes(
  doc: ToCDocument,
  layout: DocumentLayout,
  edges: ConnectionEdgeType[],
  rows: Map<string, string>,
  activeRow?: string,
): RowBandNodeType[] {
  const spineX = Math.min(
    ...layout.sectionHeaders.filter((h) => h.row === undefined).map((h) => h.x),
    layout.totalWidth,
  )
  const padding = (doc.sectionPadding ?? 0) / 2
  return layout.rowBands.map((band) => {
    const touching = edges.filter(
      (e) => rows.get(e.source) === band.rowId || rows.get(e.target) === band.rowId,
    )
    const cards = [...rows.values()].filter((row) => row === band.rowId).length
    return {
      id: `row-${band.rowId}`,
      type: 'rowBand',
      position: { x: CANVAS_MARGIN / 2, y: band.top - padding },
      width: spineX - padding - CANVAS_MARGIN / 2,
      height: band.bottom - band.top,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        title: band.title,
        question: band.question,
        color: rowColor(doc, band.rowId),
        cards,
        links: touching.length,
        hidden: activeRow && activeRow !== band.rowId ? touching.length : 0,
        active: activeRow === band.rowId,
      },
    }
  })
}
