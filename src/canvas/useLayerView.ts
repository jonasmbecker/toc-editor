import { useCallback, useMemo, useState } from 'react'
import type { NodeChange } from '@xyflow/react'
import type { ToCDocument } from '../model/schema'
import { withLayerFirst } from '../layout/layerFirst'
import { ALL_LAYERS } from './LayerTabs'

/** The layer a matrix map shows: the one chosen, else its first row; undefined for All layers
 * and for a map without rows. */
function shownLayer(doc: ToCDocument, choice: string | null): string | undefined {
  const rows = doc.rows ?? []
  if (rows.length === 0 || choice === ALL_LAYERS) return undefined
  return rows.some((row) => row.id === choice) ? choice! : rows[0].id
}

/**
 * Which layer of a matrix map the canvas shows, and the document it draws for it: the stored
 * document for All layers (or a flat map), else a copy with that layer on top, re-tidied with
 * the cards' measured heights. Edits always go to the stored document; the copy is never saved.
 */
export function useLayerView(doc: ToCDocument) {
  const [choice, setChoice] = useState<string | null>(null)
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map())
  const layer = shownLayer(doc, choice)
  const shown = useMemo(
    () => (layer ? withLayerFirst(doc, layer, heights) : doc),
    [doc, layer, heights],
  )
  /** Feed React Flow's node changes through here: the view is tidied with each card's first
   * measured height. */
  const trackHeights = useCallback((changes: NodeChange[]) => {
    const sized = changes.flatMap((c) =>
      c.type === 'dimensions' && c.dimensions ? [[c.id, c.dimensions.height] as const] : [],
    )
    if (sized.length === 0) return
    setHeights((previous) => {
      // First measurement only: a selected card opens up to show its text, and re-tidying the
      // view on every click would make the cards jump.
      const fresh = sized.filter(([id]) => !previous.has(id))
      return fresh.length === 0 ? previous : new Map([...previous, ...fresh])
    })
  }, [])
  return { layer, shown, choose: setChoice, trackHeights }
}
