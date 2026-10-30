import type { DiagramType, ToCDocument } from '../model/schema'

/**
 * Pure document-level settings. Same no-op contract as the node and connection modules: the
 * input is returned by reference when nothing changes, so the store records no undo step.
 */

/** Sets the diagram type. Only the UI wording changes with it (see `model/labels.ts`); every
 * JSON key stays the same, so a status-quo map is still a valid theoryofchangebuilder file. */
export function setDiagramType(doc: ToCDocument, diagramType: DiagramType): ToCDocument {
  if (doc.diagramType === diagramType) return doc
  return { ...doc, diagramType }
}
