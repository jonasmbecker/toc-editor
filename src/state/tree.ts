import type { DocumentNode, ToCDocument } from '../model/schema'

/**
 * Walking and rebuilding the section / column / node tree. Everything here is pure and keeps
 * the no-op contract the store relies on: the input document comes back by reference when
 * nothing changed, so no undo step is recorded for it.
 */

export interface NodeLocation {
  sectionIndex: number
  columnIndex: number
  nodeIndex: number
}

export function findNodeLocation(doc: ToCDocument, nodeId: string): NodeLocation | null {
  for (let si = 0; si < doc.sections.length; si++) {
    const columns = doc.sections[si].columns
    for (let ci = 0; ci < columns.length; ci++) {
      const ni = columns[ci].nodes.findIndex((node) => node.id === nodeId)
      if (ni !== -1) return { sectionIndex: si, columnIndex: ci, nodeIndex: ni }
    }
  }
  return null
}

export function nodeAt(doc: ToCDocument, nodeId: string): DocumentNode | null {
  const location = findNodeLocation(doc, nodeId)
  if (!location) return null
  return doc.sections[location.sectionIndex].columns[location.columnIndex].nodes[location.nodeIndex]
}

export function allNodes(doc: ToCDocument): DocumentNode[] {
  return doc.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))
}

export function allNodeIds(doc: ToCDocument): Set<string> {
  return new Set(allNodes(doc).map((node) => node.id))
}

/** Rebuilds the document with one node replaced by `update(node)`. Returns the input by
 * reference when the id is unknown or `update` returns the node itself. */
export function mapNode(
  doc: ToCDocument,
  nodeId: string,
  update: (node: DocumentNode) => DocumentNode,
): ToCDocument {
  const location = findNodeLocation(doc, nodeId)
  if (!location) return doc
  const { sectionIndex, columnIndex, nodeIndex } = location
  const current = doc.sections[sectionIndex].columns[columnIndex].nodes[nodeIndex]
  const next = update(current)
  if (next === current) return doc
  return {
    ...doc,
    sections: doc.sections.map((section, si) =>
      si !== sectionIndex
        ? section
        : {
            ...section,
            columns: section.columns.map((column, ci) =>
              ci !== columnIndex
                ? column
                : {
                    ...column,
                    nodes: column.nodes.map((node, ni) => (ni !== nodeIndex ? node : next)),
                  },
            ),
          },
    ),
  }
}

/** Rebuilds the document with every node passed through `update`. Returns the input by
 * reference when `update` returned every node unchanged. */
export function mapAllNodes(
  doc: ToCDocument,
  update: (node: DocumentNode) => DocumentNode,
): ToCDocument {
  let changed = false
  const sections = doc.sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      nodes: column.nodes.map((node) => {
        const next = update(node)
        if (next !== node) changed = true
        return next
      }),
    })),
  }))
  return changed ? { ...doc, sections } : doc
}
