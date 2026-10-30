import type { DocumentNode, Section, ToCDocument } from '../model/schema'

/** Pure, immutable section and column operations, mirroring `nodes.ts`'s shape. */

function updateSection(
  doc: ToCDocument,
  sectionIndex: number,
  fn: (section: Section) => Section,
): ToCDocument {
  return { ...doc, sections: doc.sections.map((s, si) => (si !== sectionIndex ? s : fn(s))) }
}

export function addColumn(doc: ToCDocument, sectionIndex: number): ToCDocument {
  return updateSection(doc, sectionIndex, (section) => ({
    ...section,
    columns: [...section.columns, { nodes: [] }],
  }))
}

/** No-ops rather than throwing if the column still holds nodes — the node panel only offers
 * this when the column is already empty, but a stale click (another edit in flight) should be
 * harmless, not a crash. */
export function removeEmptyColumn(
  doc: ToCDocument,
  sectionIndex: number,
  columnIndex: number,
): ToCDocument {
  const column = doc.sections[sectionIndex]?.columns[columnIndex]
  if (!column || column.nodes.length > 0) return doc
  return updateSection(doc, sectionIndex, (section) => ({
    ...section,
    columns: section.columns.filter((_, ci) => ci !== columnIndex),
  }))
}

export function renameSection(doc: ToCDocument, sectionIndex: number, title: string): ToCDocument {
  return updateSection(doc, sectionIndex, (section) => ({ ...section, title }))
}

export function addSectionAfter(doc: ToCDocument, sectionIndex: number): ToCDocument {
  const sections = [...doc.sections]
  sections.splice(sectionIndex + 1, 0, { title: 'New section', columns: [{ nodes: [] }] })
  return { ...doc, sections }
}

function nodesInSection(section: Section): DocumentNode[] {
  return section.columns.flatMap((c) => c.nodes)
}

function sectionIsEmpty(section: Section): boolean {
  return nodesInSection(section).length === 0
}

/** Only for a section that already holds no nodes; a non-empty section must go through
 * `deleteSectionDroppingNodes` or `deleteSectionMovingNodesTo` so its nodes are accounted for.
 * Refuses to drop the last remaining section. */
export function deleteEmptySection(doc: ToCDocument, sectionIndex: number): ToCDocument {
  const section = doc.sections[sectionIndex]
  if (!section || !sectionIsEmpty(section) || doc.sections.length <= 1) return doc
  return { ...doc, sections: doc.sections.filter((_, si) => si !== sectionIndex) }
}

/** Strips any connection targeting one of `removedIds` from every surviving node — the same
 * cascade `deleteNode` runs for a single node, generalised to a batch so deleting a whole
 * section never leaves a dangling arrow. */
function withoutInboundConnectionsTo(doc: ToCDocument, removedIds: Set<string>): ToCDocument {
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        nodes: column.nodes.map((node) => ({
          ...node,
          connections: node.connections.filter((c) => !removedIds.has(c.targetId)),
        })),
      })),
    })),
  }
}

export function deleteSectionDroppingNodes(doc: ToCDocument, sectionIndex: number): ToCDocument {
  const section = doc.sections[sectionIndex]
  if (!section || doc.sections.length <= 1) return doc
  const removedIds = new Set(nodesInSection(section).map((n) => n.id))
  const withoutSection = { ...doc, sections: doc.sections.filter((_, si) => si !== sectionIndex) }
  return withoutInboundConnectionsTo(withoutSection, removedIds)
}

/** Appends the departing section's nodes to the target section's first column (creating one if
 * it has none), then removes the departing section. Both indices are resolved against the
 * document as it is now, before either edit, so the move is correct regardless of which index
 * is larger. */
export function deleteSectionMovingNodesTo(
  doc: ToCDocument,
  sectionIndex: number,
  targetSectionIndex: number,
): ToCDocument {
  const section = doc.sections[sectionIndex]
  const target = doc.sections[targetSectionIndex]
  if (!section || !target || doc.sections.length <= 1 || targetSectionIndex === sectionIndex) {
    return doc
  }
  const movedNodes = nodesInSection(section)
  const withMovedNodes = updateSection(doc, targetSectionIndex, (s) => {
    const columns = s.columns.length > 0 ? [...s.columns] : [{ nodes: [] }]
    columns[0] = { ...columns[0], nodes: [...columns[0].nodes, ...movedNodes] }
    return { ...s, columns }
  })
  return {
    ...withMovedNodes,
    sections: withMovedNodes.sections.filter((_, si) => si !== sectionIndex),
  }
}
