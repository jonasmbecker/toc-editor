import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeChange, OnNodeDrag } from '@xyflow/react'
import type { FlowGraph } from './buildFlow'
import type { SnapGuideLine } from './SnapGuide'
import { findStraightSnap, sharesColumn, SNAP_DISTANCE_PX, type SnapAnchor } from './straightSnap'

interface FlowNodeLike {
  type?: string
  position: { x: number; y: number }
  width?: number
  height?: number
  measured?: { width?: number; height?: number }
}

/** The two things this hook needs from React Flow's instance. */
interface SnapFlow {
  getNode: (id: string) => FlowNodeLike | undefined
  getZoom: () => number
}

interface Extent {
  left: number
  right: number
}

/** Holding Alt turns snapping off; tracked from the window so it works mid-drag. */
function useAltKey() {
  const alt = useRef(false)
  useEffect(() => {
    const set = (event: KeyboardEvent) => {
      if (event.key === 'Alt') alt.current = event.type === 'keydown'
    }
    const clear = () => {
      alt.current = false
    }
    window.addEventListener('keydown', set)
    window.addEventListener('keyup', set)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', set)
      window.removeEventListener('keyup', set)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return alt
}

function anchorsFor(flow: SnapFlow, graph: FlowGraph, id: string, own: Extent): SnapAnchor[] {
  const anchors: SnapAnchor[] = []
  for (const edge of graph.edges) {
    const otherId = edge.source === id ? edge.target : edge.target === id ? edge.source : null
    const other = otherId ? flow.getNode(otherId) : undefined
    const height = other?.measured?.height ?? other?.height
    if (!other || !height) continue
    const width = other.measured?.width ?? other.width ?? 0
    const anchor = {
      centerY: other.position.y + height / 2,
      left: other.position.x,
      right: other.position.x + width,
    }
    if (!sharesColumn(anchor, own.left, own.right)) anchors.push(anchor)
  }
  return anchors
}

/**
 * Snap on drag: a card dragged to within SNAP_DISTANCE_PX (screen pixels) of the height that
 * makes one of its connections straight jumps onto it, and a guide line is drawn while it holds.
 * The snap rewrites the drag's position change before React Flow applies it, and the snapped
 * top is remembered so the drop keeps it instead of rounding it to the 8px grid.
 */
export function useStraightSnap(graph: FlowGraph) {
  const flow = useRef<SnapFlow | null>(null)
  const alt = useAltKey()
  const own = useRef<Extent>({ left: 0, right: 0 })
  const snapped = useRef<{ id: string; top: number } | null>(null)
  const [guide, setGuide] = useState<SnapGuideLine | null>(null)

  const onInit = useCallback((instance: SnapFlow) => {
    flow.current = instance
  }, [])

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    own.current = { left: node.position.x, right: node.position.x + (node.width ?? 0) }
    snapped.current = null
  }, [])

  const snapChange = useCallback(
    <T extends NodeChange>(change: T): T => {
      const instance = flow.current
      if (change.type !== 'position' || !change.dragging || !change.position || !instance) {
        return change
      }
      const node = instance.getNode(change.id)
      const height = node?.measured?.height
      if (node?.type !== 'card' || !height || alt.current) {
        snapped.current = null
        setGuide(null)
        return change
      }
      const anchors = anchorsFor(instance, graph, change.id, own.current)
      const threshold = SNAP_DISTANCE_PX / instance.getZoom()
      const hit = findStraightSnap(change.position.y, height, anchors, threshold)
      snapped.current = hit ? { id: change.id, top: hit.top } : null
      setGuide(
        hit
          ? {
              y: hit.anchor.centerY,
              left: Math.min(own.current.left, hit.anchor.left),
              right: Math.max(own.current.right, hit.anchor.right),
            }
          : null,
      )
      return hit ? ({ ...change, position: { x: change.position.x, y: hit.top } } as T) : change
    },
    [graph, alt],
  )

  const applyTo = useCallback(
    <T extends NodeChange>(changes: T[]): T[] => changes.map((change) => snapChange(change)),
    [snapChange],
  )

  /** The snapped top to keep for the card just dropped, or null; clears the guide. */
  const finish = useCallback((id: string): number | null => {
    const kept = snapped.current?.id === id ? snapped.current.top : null
    snapped.current = null
    setGuide(null)
    return kept
  }, [])

  return { guide, onInit, onNodeDragStart, applyTo, finish }
}
