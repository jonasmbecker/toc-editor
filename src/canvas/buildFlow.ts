import { MarkerType } from '@xyflow/react'
import type { DocumentNode, ToCDocument } from '../model/schema'
import { layoutDocument, SECTION_HEADER_HEIGHT, type DocumentLayout } from '../layout/columns'
import { edgeAppearance } from './config'
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  STACK_DOWN_IN_HANDLE,
  STACK_DOWN_OUT_HANDLE,
  STACK_UP_IN_HANDLE,
  STACK_UP_OUT_HANDLE,
  type CardNodeData,
  type CardNodeType,
} from './CardNode'
import type { SectionHeaderData, SectionHeaderNodeType } from './SectionHeaderNode'
import type { GroupNodeType } from './GroupNode'
import { buildGroupNodes, groupBox, type Box } from './groupFlow'
import { isGroupNode } from '../state/groups'
import { computeNeedMixes, type NeedMixResult } from './needMix'
import { needSegments } from './needLook'
import type { ConnectionEdgeData, ConnectionEdgeType } from './ConnectionEdge'

export interface DroppedConnection {
  sourceId: string
  targetId: string
}

export interface FlowGraph {
  nodes: (CardNodeType | SectionHeaderNodeType | GroupNodeType)[]
  edges: ConnectionEdgeType[]
  /** Connections whose `targetId` doesn't resolve to any node in the document. Surfaced rather
   * than silently skipped, so an imported file that lost an edge somewhere says so instead of
   * just rendering one connection short with no indication why. */
  droppedConnections: DroppedConnection[]
}

function buildHeaderNodes(doc: ToCDocument, layout: DocumentLayout): SectionHeaderNodeType[] {
  return layout.sectionHeaders.map((header) => {
    const count = doc.sections[header.sectionIndex].columns.reduce(
      (sum, column) => sum + column.nodes.length,
      0,
    )
    return {
      id: `section-${header.sectionIndex}`,
      type: 'sectionHeader',
      position: { x: header.x, y: 0 },
      width: header.width,
      height: SECTION_HEADER_HEIGHT,
      draggable: false,
      selectable: false,
      data: { title: header.title, count } satisfies SectionHeaderData,
    }
  })
}

function buildCardNodes(
  allNodes: DocumentNode[],
  positionByNodeId: Map<string, { x: number; y: number; width: number }>,
  needs: NeedMixResult,
): CardNodeType[] {
  return allNodes.map((node) => {
    const pos = positionByNodeId.get(node.id)
    if (!pos) throw new Error(`layoutDocument produced no position for node "${node.id}"`)
    return {
      id: node.id,
      type: 'card',
      position: { x: pos.x, y: pos.y },
      width: pos.width,
      data: {
        title: node.title,
        text: node.text,
        color: node.color,
        provenance: node.provenance,
        needMix: needSegments(needs, node.id),
      } satisfies CardNodeData,
    }
  })
}

type PositionById = Map<string, { x: number; y: number; width: number }>

type Route = 'flow' | 'stack-down' | 'stack-up' | 'routed'

/** Routing follows the columns, not the direction label. Same column runs vertically between the
 * stacked cards. A link that skips a column, or points back to an earlier one (a feedback loop),
 * is routed around the cards along a corridor outside them (`RoutedEdge`). Everything else is the
 * ordinary left-to-right curve; a both-ways arrow between neighbours only gains its second head. */
function routeFor(
  targetId: string,
  sourceId: string,
  positions: PositionById,
  columns: Map<string, number>,
): Route {
  const source = positions.get(sourceId)
  const target = positions.get(targetId)
  const span = (columns.get(targetId) ?? 0) - (columns.get(sourceId) ?? 0)
  if (source && target && span === 0 && sourceId !== targetId) {
    return target.y >= source.y ? 'stack-down' : 'stack-up'
  }
  return span > 1 || span < 0 ? 'routed' : 'flow'
}

const HANDLES: Record<Route, { sourceHandle: string; targetHandle: string }> = {
  flow: { sourceHandle: FLOW_OUT_HANDLE, targetHandle: FLOW_IN_HANDLE },
  'stack-down': { sourceHandle: STACK_DOWN_OUT_HANDLE, targetHandle: STACK_DOWN_IN_HANDLE },
  'stack-up': { sourceHandle: STACK_UP_OUT_HANDLE, targetHandle: STACK_UP_IN_HANDLE },
  routed: { sourceHandle: FLOW_OUT_HANDLE, targetHandle: FLOW_IN_HANDLE },
}

function markerFor(color: string, start: boolean) {
  return { type: MarkerType.ArrowClosed, color, orient: start ? 'auto-start-reverse' : 'auto' }
}

function buildEdges(
  allNodes: DocumentNode[],
  positions: PositionById,
  columns: Map<string, number>,
): { edges: ConnectionEdgeType[]; dropped: DroppedConnection[] } {
  const edges: ConnectionEdgeType[] = []
  const dropped: DroppedConnection[] = []
  for (const node of allNodes) {
    node.connections.forEach((connection, index) => {
      if (!positions.has(connection.targetId)) {
        dropped.push({ sourceId: node.id, targetId: connection.targetId })
        return
      }
      const appearance = edgeAppearance(connection)
      const route = routeFor(connection.targetId, node.id, positions, columns)
      edges.push({
        id: `${node.id}->${connection.targetId}#${connection.id ?? index}`,
        source: node.id,
        target: connection.targetId,
        type: route === 'routed' ? 'routed' : 'connection',
        ...HANDLES[route],
        markerEnd: appearance.showArrow ? markerFor(appearance.stroke, false) : undefined,
        markerStart: appearance.bothWays ? markerFor(appearance.stroke, true) : undefined,
        data: {
          confidence: connection.confidence,
          provenance: connection.provenance,
          isFeedbackLoop: connection.isFeedbackLoop,
          ref: { sourceId: node.id, index },
        } satisfies ConnectionEdgeData,
      })
    })
  }
  return { edges, dropped }
}

/** Global left-to-right column index of every document node (distinct layout x, sorted). */
function columnIndexById(layout: DocumentLayout): Map<string, number> {
  const xs = [...new Set(layout.nodes.map((n) => Math.round(n.x)))].sort((a, b) => a - b)
  return new Map(layout.nodes.map((n) => [n.nodeId, xs.indexOf(Math.round(n.x))]))
}

/** Converts a parsed document into React Flow's node/edge shape. Positions come entirely from
 * `layoutDocument`; this function only maps data across, it does no layout math of its own. */
export function buildFlow(doc: ToCDocument): FlowGraph {
  const layout = layoutDocument(doc)
  const allNodes = doc.sections.flatMap((section) =>
    section.columns.flatMap((column) => column.nodes),
  )
  const positionByNodeId = new Map<string, Box>(layout.nodes.map((n) => [n.nodeId, n]))

  // A group is a node in the document but a container on the canvas: it is drawn around its
  // members, and edges to or from it route to that container, not to its own layout slot.
  const groups = buildGroupNodes(doc, positionByNodeId)
  for (const group of groups) positionByNodeId.set(group.id, groupBox(group))
  const cards = allNodes.filter((node) => !isGroupNode(node))

  const nodes = [
    ...buildHeaderNodes(doc, layout),
    ...groups,
    ...buildCardNodes(cards, positionByNodeId, computeNeedMixes(doc)),
  ]
  const { edges, dropped } = buildEdges(allNodes, positionByNodeId, columnIndexById(layout))

  return { nodes, edges, droppedConnections: dropped }
}
