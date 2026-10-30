import { useCallback, useEffect } from 'react'
import {
  useEdgesState,
  useNodesState,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { moveNodeToColumn, moveNodeVertically } from '../state/nodes'
import { findNodeLocation } from '../state/tree'
import { useStraightSnap } from './useStraightSnap'
import { resolveDropTarget, snapYPosition } from './dragSnap'
import { HEADER_CLEARANCE } from '../layout/columns'
import type { FlowGraph } from './buildFlow'
import type { ConnectionEdgeType } from './ConnectionEdge'
import type { CardNodeType } from './CardNode'
import type { SectionHeaderNodeType } from './SectionHeaderNode'
import type { GroupNodeType } from './GroupNode'
import { fitGroupHeights } from './groupFlow'
import { endpointIds, refOfEdge, withSelection } from './selection'

type FlowNode = CardNodeType | SectionHeaderNodeType | GroupNodeType

/**
 * Wires a derived `FlowGraph` into React Flow's controlled node/edge state. Selection is driven
 * from the store, not React Flow's own internal copy, so the panels and the canvas always
 * agree on what's selected; a drag commits through the store on drop, which is also what makes
 * the card visually snap to its derived column/row position (the re-derived layout replaces
 * wherever the pointer left it). Drawing a new connection lives in `useConnectFlow`.
 */
export function useControlledFlow(doc: ToCDocument, graph: FlowGraph) {
  const selectedNodeId = useToCStore((state) => state.selectedNodeId)
  const selectedConnection = useToCStore((state) => state.selectedConnection)
  const select = useToCStore((state) => state.select)
  const selectConnection = useToCStore((state) => state.selectConnection)
  const transform = useToCStore((state) => state.transform)

  const snap = useStraightSnap(graph)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<ConnectionEdgeType>(graph.edges)

  // `useNodesState`/`useEdgesState` only seed their *initial* value from `graph.nodes`/`edges` —
  // they don't track it afterwards. The store's document (and therefore `graph`) changes on
  // every edit, so both need an explicit re-sync, not just nodes (selection also lives here
  // because it rides the same "graph or selection changed" trigger). The previous measured
  // size is carried over so React Flow does not unobserve and re-measure every card on each
  // keystroke in a panel.
  const resync = useCallback(() => {
    const endpoints = endpointIds(graph.edges, selectedConnection)
    setNodes((previous) => {
      const measuredById = new Map(previous.map((node) => [node.id, node.measured]))
      return fitGroupHeights(
        graph.nodes.map((node) => {
          const measured = measuredById.get(node.id)
          return {
            ...node,
            ...(measured ? { measured } : {}),
            selected: node.id === selectedNodeId,
            className: endpoints.has(node.id) ? 'toc-endpoint' : undefined,
          }
        }),
      )
    })
    setEdges(graph.edges.map((edge) => withSelection(edge, selectedConnection)))
  }, [graph, selectedNodeId, selectedConnection, setNodes, setEdges])

  useEffect(resync, [resync])

  const onSelectionChange: OnSelectionChangeFunc<FlowNode, ConnectionEdgeType> = useCallback(
    ({ nodes: pickedNodes, edges: pickedEdges }) => {
      // A card wins over the group container behind it when both are picked.
      const card =
        pickedNodes.find((n) => n.type === 'card') ?? pickedNodes.find((n) => n.type === 'group')
      if (card) return select(card.id)
      if (pickedEdges[0]) return selectConnection(refOfEdge(pickedEdges[0]))
      select(null)
    },
    [select, selectConnection],
  )

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node) => {
      if (node.type !== 'card') return
      const centerX = node.position.x + (node.width ?? 0) / 2
      const target = resolveDropTarget(doc, centerX)
      const location = findNodeLocation(doc, node.id)
      const kept = snap.finish(node.id)
      const staysPut =
        location?.sectionIndex === target.sectionIndex &&
        location.columnIndex === target.columnIndex
      // A drop that held a straight-link snap keeps its exact height (rounding to the grid would
      // bend the line again), unless the card was carried to another column.
      const yPosition =
        kept !== null && staysPut
          ? Math.max(0, kept - HEADER_CLEARANCE)
          : snapYPosition(node.position.y - HEADER_CLEARANCE)
      transform(`move ${node.id}`, (document) => {
        const moved = moveNodeToColumn(document, node.id, target.sectionIndex, target.columnIndex)
        return moveNodeVertically(moved, node.id, yPosition)
      })
      // A drop that resolves to the slot the card already occupies changes nothing in the
      // store (no new document, no undo step), so `graph` doesn't change and the effect above
      // won't run — but the card is still sitting wherever the pointer let go of it. Snap it
      // back explicitly.
      if (useToCStore.getState().document === doc) resync()
    },
    [doc, transform, resync, snap],
  )

  // Card heights arrive after the first render; re-fit group containers whenever they do.
  const onNodesChangeFitted: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(snap.applyTo(changes))
      if (changes.some((change) => change.type === 'dimensions')) {
        setNodes((current) => fitGroupHeights(current))
      }
    },
    [onNodesChange, setNodes, snap],
  )

  return {
    nodes,
    edges,
    onNodesChange: onNodesChangeFitted,
    onEdgesChange,
    onSelectionChange,
    onNodeDragStart: snap.onNodeDragStart,
    onNodeDragStop,
    onInit: snap.onInit,
    guide: snap.guide,
  }
}
