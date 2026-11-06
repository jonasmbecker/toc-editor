import { useCallback, useRef, type MouseEvent } from 'react'
import { useToCStore } from '../state/store'
import { addNodeAt } from '../state/nodes'
import type { FlowGraph } from './buildFlow'

interface Point {
  x: number
  y: number
}

/** The one part of the React Flow instance this needs. */
interface Projector {
  screenToFlowPosition: (point: Point) => Point
}

/** The section whose region holds the point (the last drawn wins where regions overlap), or the
 * first section. */
export function sectionAt(graph: FlowGraph, point: Point): number {
  const hit = graph.nodes
    .filter((n) => n.type === 'region')
    .reverse()
    .find(
      (r) =>
        point.x >= r.position.x &&
        point.x <= r.position.x + (r.width ?? 0) &&
        point.y >= r.position.y &&
        point.y <= r.position.y + (r.height ?? 0),
    )
  return hit ? Number(hit.id.slice('region-'.length)) : 0
}

/** Moves the keyboard into the new card's title, once its panel has mounted, with the
 * placeholder title selected so typing replaces it. */
function focusNewTitle() {
  requestAnimationFrame(() => {
    const title = document.querySelector<HTMLTextAreaElement>('.toc-panel__title')
    title?.focus()
    title?.select()
  })
}

/**
 * Free canvas: adding a card. A double-click on empty canvas adds it there; `addAtCentre` (the
 * top bar's "+ Card") adds it in the middle of the view. Either way the card is selected and its
 * title is ready to type into. The canvas's own double-click zoom is off on a free map, so the
 * gesture means one thing.
 */
export function useAddCard(graph: FlowGraph) {
  const transform = useToCStore((state) => state.transform)
  const select = useToCStore((state) => state.select)
  const instance = useRef<Projector | null>(null)

  const addAt = useCallback(
    (point: Point) => {
      let added: string | null = null
      transform('add card', (doc) => {
        const result = addNodeAt(doc, sectionAt(graph, point), point)
        added = result.nodeId
        return result.document
      })
      if (added) {
        select(added)
        focusNewTitle()
      }
    },
    [graph, transform, select],
  )

  const onDoubleClick = useCallback(
    (event: MouseEvent) => {
      if (!instance.current) return
      // Only on empty canvas: a double-click on a card or a link is not a request for a card.
      if (!(event.target as Element).closest('.react-flow__pane')) return
      addAt(instance.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [addAt],
  )

  const addAtCentre = useCallback(() => {
    const flow = instance.current
    const pane = document.querySelector('.toc-stage .react-flow')
    if (!flow || !pane) return
    const box = pane.getBoundingClientRect()
    addAt(flow.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }))
  }, [addAt])

  const onInit = useCallback((flow: Projector) => {
    instance.current = flow
  }, [])

  return { onDoubleClick, addAtCentre, onInit }
}
