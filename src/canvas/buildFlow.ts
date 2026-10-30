import { MarkerType } from '@xyflow/react'
import type { DocumentNode, ToCDocument } from '../model/schema'
import { layoutDocument, SECTION_HEADER_HEIGHT, type DocumentLayout } from '../layout/columns'
import { edgeAppearance } from './config'
import {
  FLOW_IN_HANDLE,
  FLOW_OUT_HANDLE,
  LOOP_IN_HANDLE,
  LOOP_OUT_HANDLE,
  type CardNodeData,
  type CardNodeType,
} from './CardNode'
import type { SectionHeaderData, SectionHeaderNodeType } from './SectionHeaderNode'
import type { ConnectionEdgeData, ConnectionEdgeType } from './ConnectionEdge'

export interface DroppedConnection {
  sourceId: string
  targetId: string
}

export interface FlowGraph {
  nodes: (CardNodeType | SectionHeaderNodeType)[]
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
      } satisfies CardNodeData,
    }
  })
}

type PositionById = Map<string, { x: number; y: number; width: number }>

/** Routing follows geometry, not the direction label: any edge whose target sits to the left
 * of its source (an earlier section, or an earlier column of the same section) takes the loop
 * route around the columns, left edge out and right edge in. A one-way arrow pointing back is
 * drawn that way in the normal colour; a both-ways arrow between two columns in flow order
 * keeps the plain bezier and only gains its second head. */
function isLoopRoute(targetId: string, sourceId: string, positions: PositionById): boolean {
  const source = positions.get(sourceId)
  const target = positions.get(targetId)
  return !!source && !!target && target.x < source.x
}

function markerFor(color: string, start: boolean) {
  return { type: MarkerType.ArrowClosed, color, orient: start ? 'auto-start-reverse' : 'auto' }
}

function buildEdges(
  allNodes: DocumentNode[],
  positions: PositionById,
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
      const loop = isLoopRoute(connection.targetId, node.id, positions)
      edges.push({
        id: `${node.id}->${connection.targetId}#${connection.id ?? index}`,
        source: node.id,
        target: connection.targetId,
        type: loop ? 'loop' : 'connection',
        sourceHandle: loop ? LOOP_OUT_HANDLE : FLOW_OUT_HANDLE,
        targetHandle: loop ? LOOP_IN_HANDLE : FLOW_IN_HANDLE,
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

/** Converts a parsed document into React Flow's node/edge shape. Positions come entirely from
 * `layoutDocument`; this function only maps data across, it does no layout math of its own. */
export function buildFlow(doc: ToCDocument): FlowGraph {
  const layout = layoutDocument(doc)
  const allNodes = doc.sections.flatMap((section) =>
    section.columns.flatMap((column) => column.nodes),
  )
  const positionByNodeId = new Map(layout.nodes.map((n) => [n.nodeId, n]))

  const nodes = [...buildHeaderNodes(doc, layout), ...buildCardNodes(allNodes, positionByNodeId)]
  const { edges, dropped } = buildEdges(allNodes, positionByNodeId)

  return { nodes, edges, droppedConnections: dropped }
}
