import type { ToCDocument } from '../model/schema'
import { alignDocument } from './align'

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
