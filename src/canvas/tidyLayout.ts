import { alignDocument } from '../layout/align'
import { useToCStore } from '../state/store'

interface MeasuredNode {
  id: string
  measured?: { height?: number }
}

/** Straightens connections by moving cards up or down inside their columns, as one undo step
 * ("tidy layout"). Card heights come from what React Flow measured. */
export function tidyLayout(nodes: MeasuredNode[]): void {
  const heights = new Map<string, number>()
  for (const node of nodes) {
    const height = node.measured?.height
    if (height) heights.set(node.id, height)
  }
  useToCStore.getState().transform('tidy layout', (doc) => alignDocument(doc, { heights }))
}
