import { MAP_FORMAT_VERSION } from './schema'

/**
 * Brings any map file up to the current format before it is validated, so every older file
 * (the theory repo's map, theoryofchangebuilder.com exports, drafts saved by an older editor)
 * opens without a separate code path. Pure: the input is never mutated, and a value that is not
 * shaped like a map passes through untouched so the schema can describe what is wrong with it.
 *
 * Version 1 → 2:
 * - `schemaVersion: 1` (or nothing) becomes `version: 2`.
 * - A file whose cards carry no `layer` keeps its sections exactly: it renders as before.
 * - A file whose cards carry `layer` (the first COM-B draft) becomes a matrix: the COM-B rows
 *   are declared, each section is split into one section per layer it holds, row sections move
 *   ahead of the shared ones, and `layer` leaves the cards (their section's row says it now).
 */

/** The COM-B layers a version 1 `layer` value names, in matrix order. */
export const COM_B_ROWS = [
  { id: 'capability', title: 'Capability', question: 'What people can do' },
  { id: 'opportunity', title: 'Opportunity', question: 'What the world lets them do' },
  { id: 'motivation', title: 'Motivation', question: 'What they want' },
]

export type MigrateResult = { ok: true; value: unknown } | { ok: false; errors: string[] }

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Sections → columns → nodes, but only when every level is the shape a migration can walk. */
function walkableSections(doc: Json): Json[] | null {
  if (!Array.isArray(doc.sections)) return null
  for (const section of doc.sections) {
    if (!isObject(section) || !Array.isArray(section.columns)) return null
    for (const column of section.columns) {
      if (!isObject(column) || !Array.isArray(column.nodes)) return null
      if (!column.nodes.every(isObject)) return null
    }
  }
  return doc.sections as Json[]
}

/** The layer a version 1 card sits in; a group without its own uses its members'. */
function layerOf(node: Json, nodes: Json[]): string | undefined {
  if (typeof node.layer === 'string') return node.layer
  const member = nodes.find((n) => n.groupId === node.id && typeof n.layer === 'string')
  return member?.layer as string | undefined
}

function withoutLayer(node: Json): Json {
  if (!('layer' in node)) return node
  const copy = { ...node }
  delete copy.layer
  return copy
}

/** One version 1 section as its version 2 parts: one per layer it holds, plus the shared part. */
function splitSection(
  section: Json,
  errors: string[],
): { rows: Map<string, Json>; spine: Json | null } {
  const columns = section.columns as { nodes: Json[] }[]
  const all = columns.flatMap((column) => column.nodes)
  const layerById = new Map(all.map((node) => [node.id, layerOf(node, all)]))
  for (const node of all) {
    if (typeof node.groupId === 'string' && layerById.has(node.groupId)) {
      if (layerById.get(node.groupId) !== layerById.get(node.id)) {
        errors.push(
          `Card "${String(node.id)}" is in a different layer from its group "${node.groupId}".`,
        )
      }
    }
  }
  const part = (layer: string | undefined): Json | null => {
    const kept = columns
      .map((column) => ({
        ...column,
        nodes: column.nodes.filter((n) => layerById.get(n.id) === layer).map(withoutLayer),
      }))
      .filter((column) => column.nodes.length > 0)
    return kept.length > 0 ? { ...section, columns: kept } : null
  }
  const rows = new Map<string, Json>()
  for (const { id } of COM_B_ROWS) {
    const piece = part(id)
    if (piece) rows.set(id, { ...piece, row: id })
  }
  return { rows, spine: part(undefined) }
}

/** Puts `version` where `schemaVersion` was (or after `sections`), so a migrated file's key order
 * stays close to the original and its diff stays small. */
function versioned(doc: Json, extra: Json): Json {
  const out: Json = {}
  let placed = false
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'schemaVersion') {
      Object.assign(out, { version: MAP_FORMAT_VERSION }, extra)
      placed = true
      continue
    }
    out[key] = value
  }
  return placed ? out : { ...out, version: MAP_FORMAT_VERSION, ...extra }
}

/** The `layer` values a version 1 file uses that are not COM-B rows. */
function unknownLayers(sections: Json[]): { used: boolean; unknown: unknown[] } {
  const layers = new Set(
    sections.flatMap((s) =>
      (s.columns as { nodes: Json[] }[]).flatMap((c) => c.nodes.map((n) => n.layer)),
    ),
  )
  layers.delete(undefined)
  const known = new Set(COM_B_ROWS.map((row) => row.id))
  const unknown = [...layers].filter((layer) => typeof layer !== 'string' || !known.has(layer))
  return { used: layers.size > 0, unknown }
}

export function migrateDocument(raw: unknown): MigrateResult {
  if (!isObject(raw)) return { ok: true, value: raw }
  const version = raw.version ?? raw.schemaVersion ?? 1
  if (typeof version === 'number' && version > MAP_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [`This map was made by a newer editor (format version ${version}); reload the page.`],
    }
  }
  if (version !== 1) return { ok: true, value: raw }
  const sections = walkableSections(raw)
  if (!sections) return { ok: true, value: raw }

  const { used, unknown } = unknownLayers(sections)
  if (!used) return { ok: true, value: versioned(raw, {}) }
  if (unknown.length > 0) {
    const names = unknown.map((l) => JSON.stringify(l)).join(', ')
    return {
      ok: false,
      errors: [`Unknown layer ${names}: use capability, opportunity or motivation.`],
    }
  }
  return toMatrix(raw, sections)
}

/** A version 1 file with layered cards as a version 2 matrix (see the module comment). */
function toMatrix(raw: Json, sections: Json[]): MigrateResult {
  const errors: string[] = []
  const rowSections: Json[] = []
  const spineSections: Json[] = []
  for (const section of sections) {
    const { rows, spine } = splitSection(section, errors)
    rowSections.push(...rows.values())
    if (spine) spineSections.push(spine)
  }
  if (errors.length > 0) return { ok: false, errors }
  // Row sections grouped by row, keeping each row's sections in their original order.
  const ordered = COM_B_ROWS.flatMap(({ id }) => rowSections.filter((s) => s.row === id))
  const rows = COM_B_ROWS.map((row) => ({ ...row }))
  return {
    ok: true,
    value: versioned({ ...raw, sections: [...ordered, ...spineSections] }, { rows }),
  }
}
