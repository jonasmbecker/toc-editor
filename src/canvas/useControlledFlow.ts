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
import { moveGroup } from '../state/groups'
import { useStraightSnap } from './useStraightSnap'
import { resolveDropTarget, snapYPosition } from './dragSnap'
import { HEADER_CLEARANCE } from '../layout/columns'
import type { FlowGraph } from './buildFlow'
import type { ConnectionEdgeType } from './ConnectionEdge'
import type { CardNodeType } from './CardNode'
import type { SectionHeaderNodeType } from './SectionHeaderNode'
import type { GroupNodeData, GroupNodeType } from './GroupNode'
import { fitGroupHeights } from './groupFlow'
import { endpointIds, pathHighlight, refOfEdge, withSelection } from './selection'
import type { RowBandNodeType } from './RowBandNode'

type FlowNode = CardNodeType | SectionHeaderNodeType | GroupNodeType | RowBandNodeType

/** Space-separated class names, the empty ones left out. */
function classes(...names: (string | false | undefined)[]): string | undefined {
  return names.filter(Boolean).join(' ') || undefined
}

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
    // A selected card lights every path through it; the cards and links off them fade.
    const home = graph.nodes.find(
      (node) => node.type === 'group' && node.data.memberIds.includes(selectedNodeId ?? ''),
    )
    const path = selectedNodeId
      ? pathHighlight(graph.edges, home ? [selectedNodeId, home.id] : [selectedNodeId])
      : null
    // A link to a group reaches every card in it, so a lit group keeps its cards lit.
    const lit = new Set(path?.nodes)
    for (const node of graph.nodes) {
      if (node.type === 'group' && lit.has(node.id))
        node.data.memberIds.forEach((id) => lit.add(id))
    }
    const dims = (node: FlowNode) =>
      path !== null && (node.type === 'card' || node.type === 'group') && !lit.has(node.id)
    setNodes((previous) => {
      const measuredById = new Map(previous.map((node) => [node.id, node.measured]))
      return fitGroupHeights(
        graph.nodes.map((node) => {
          const measured = measuredById.get(node.id)
          return {
            ...node,
            ...(measured ? { measured } : {}),
            selected: node.id === selectedNodeId,
            className: classes(
              node.className,
              endpoints.has(node.id) && 'toc-endpoint',
              dims(node) && 'toc-off-path',
            ),
          }
        }),
      )
    })
    setEdges(
      graph.edges.map((edge) => {
        const shown = withSelection(edge, selectedConnection)
        if (!path) return shown
        const emphasis = path.edges.has(edge.id) ? ('on' as const) : ('off' as const)
        return { ...shown, data: { ...shown.data!, emphasis } }
      }),
    )
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

  // While a group is dragged its cards ride along by the same offset as the frame.
  const onNodeDrag: OnNodeDrag<FlowNode> = useCallback(
    (_event, node) => {
      if (node.type !== 'group') return
      const home = graph.nodes.find((n) => n.id === node.id)
      if (!home) return
      const dx = node.position.x - home.position.x
      const dy = node.position.y - home.position.y
      const origins = new Map(
        graph.nodes
          .filter((n) => (node.data as GroupNodeData).memberIds.includes(n.id))
          .map((n) => [n.id, n.position]),
      )
      setNodes((current) =>
        current.map((n) => {
          const origin = origins.get(n.id)
          return origin ? { ...n, position: { x: origin.x + dx, y: origin.y + dy } } : n
        }),
      )
    },
    [graph, setNodes],
  )

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback(
    (_event, node) => {
      if (node.type === 'group') {
        const home = graph.nodes.find((n) => n.id === node.id)
        const target = resolveDropTarget(
          doc,
          node.position.x + (node.width ?? 0) / 2,
          node.position.y,
        )
        const rawDy = home ? node.position.y - home.position.y : 0
        const deltaY = Math.sign(rawDy) * snapYPosition(Math.abs(rawDy))
        transform(`move ${node.id}`, (document) =>
          moveGroup(document, node.id, target.sectionIndex, target.columnIndex, deltaY),
        )
        // A drop back in place changes nothing in the store; snap the frame and cards back.
        if (useToCStore.getState().document === doc) resync()
        return
      }
      if (node.type !== 'card') return
      const centerX = node.position.x + (node.width ?? 0) / 2
      const target = resolveDropTarget(doc, centerX, node.position.y)
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
    [doc, graph, transform, resync, snap],
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
    onNodeDrag,
    onNodeDragStop,
    onInit: snap.onInit,
    guide: snap.guide,
  }
}
