import type { ToCDocument } from '../model/schema'
import { alignDocument } from './align'
import { allNodes, mapAllNodes } from '../state/tree'

/**
 * The document as a single-layer view draws it: the chosen row moved to the top and the map
 * tidied with that row's links into the spine given priority, so they run straight and read as
 * "from here to there" (Jonas, 2026-11-01). Only `rows` order and card heights change; sections
 * keep their indexes, so the view can be built from it while every edit still goes to the stored
 * document. Nothing here is saved.
 */
export function withLayerFirst(
  doc: ToCDocument,
  rowId: string,
  heights?: ReadonlyMap<string, number>,
): ToCDocument {
  const rows = doc.rows ?? []
  const active = rows.find((row) => row.id === rowId)
  if (!active) return doc
  const reordered = { ...doc, rows: [active, ...rows.filter((row) => row !== active)] }
  return alignDocument(reordered, { heights, priorityRow: rowId })
}

/** What a layer view's positions depend on: rows, sections, cards, groups and links, not text. */
function structureKey(doc: ToCDocument, rowId: string, heights?: ReadonlyMap<string, number>) {
  const sections = doc.sections.map((section) => [
    section.row,
    section.columns.map((column) =>
      column.nodes.map((n) => [n.id, n.groupId, n.kind, n.connections.map((c) => c.targetId)]),
    ),
  ])
  const sized = heights ? [...heights].sort(([a], [b]) => (a < b ? -1 : 1)) : []
  return JSON.stringify([rowId, doc.rows?.map((row) => row.id), sections, sized])
}

let cached: { key: string; view: ToCDocument } | null = null

/**
 * `withLayerFirst`, re-tidied only when the map's structure changes: typing a card's title or
 * text in a layer view keeps the cached positions and lays them onto the edited document, rather
 * than running Tidy on every keystroke. One entry is enough, as one canvas is open at a time.
 */
export function cachedLayerFirst(
  doc: ToCDocument,
  rowId: string,
  heights?: ReadonlyMap<string, number>,
): ToCDocument {
  const key = structureKey(doc, rowId, heights)
  if (cached?.key !== key) cached = { key, view: withLayerFirst(doc, rowId, heights) }
  const y = new Map(allNodes(cached.view).map((node) => [node.id, node.yPosition]))
  const placed = mapAllNodes(doc, (node) => {
    const top = y.get(node.id)
    return top === undefined || top === node.yPosition ? node : { ...node, yPosition: top }
  })
  return { ...placed, rows: cached.view.rows }
}
