import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useToCStore } from '../state/store'
import { connectionRefKey, type ConnectionRef } from '../state/connections'
import { buildFlow } from './buildFlow'
import { useControlledFlow } from './useControlledFlow'
import { useConnectFlow } from './useConnectFlow'
import { CardNode } from './CardNode'
import { SectionHeaderNode } from './SectionHeaderNode'
import { ConnectionEdge } from './ConnectionEdge'
import { LoopEdge } from './LoopEdge'
import { Legend } from './Legend'
import { CanvasTopBar } from './CanvasTopBar'
import { NodePanel } from '../panels/NodePanel'
import { NodeReadPanel } from '../panels/NodeReadPanel'
import { ConnectionDetails } from '../panels/ConnectionDetails'
import { StageBar } from '../share/StageBar'
import { CANVAS_COLORS } from './config'
import './canvas.css'

const nodeTypes = { card: CardNode, sectionHeader: SectionHeaderNode }
const edgeTypes = { connection: ConnectionEdge, loop: LoopEdge }

/** The in-progress line while dragging from a handle: dashed, in the selection colour. */
const connectionLineStyle = {
  stroke: CANVAS_COLORS.select,
  strokeWidth: 1.6,
  strokeDasharray: '6 4',
}

/** How close (px) a drag has to get to a target handle to snap onto it, so dropping anywhere
 * near a card's left edge counts rather than demanding a hit on the 10px dot. */
const CONNECTION_SNAP_RADIUS = 48

/** Remount key for the details panel: a string, so the zustand selector returns a stable
 * primitive and never re-renders on an unchanged selection. */
function keyOf(ref: ConnectionRef | null): string {
  return ref ? `conn:${connectionRefKey(ref)}` : 'conn:none'
}

function minimapColor(node: Node): string {
  return node.type === 'sectionHeader' ? CANVAS_COLORS.primary : '#C9C4BA'
}

function stageClassName(isConnecting: boolean, isReadOnly: boolean): string {
  return ['toc-stage', isConnecting && 'toc-stage--connecting', isReadOnly && 'toc-stage--readonly']
    .filter(Boolean)
    .join(' ')
}

/** The top-left panel for the selection: the node editor, or on a view link the read-only
 * node card, and the Connection Details panel (which has its own read-only variant). Keyed by
 * selection: a fresh mount per node resets any in-panel UI state (like the delete
 * confirmation) instead of an effect reaching in to reset it. */
function SelectionPanels() {
  const selectedNodeId = useToCStore((state) => state.selectedNodeId)
  const connectionKey = useToCStore((state) => keyOf(state.selectedConnection))
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const nodeKey = `node:${selectedNodeId ?? 'none'}`
  return (
    <>
      {isReadOnly ? <NodeReadPanel key={nodeKey} /> : <NodePanel key={nodeKey} />}
      <ConnectionDetails key={connectionKey} />
    </>
  )
}

/** The document being edited lives in the zustand store, not a prop: once more than one screen
 * can open a document (home-files, share-links), each funnels through `store.load`, and this
 * component always renders whatever the store currently holds. */
export function Canvas({ onHome }: { onHome: () => void }) {
  const doc = useToCStore((state) => state.document)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const graph = useMemo(() => buildFlow(doc), [doc])
  const flow = useControlledFlow(doc, graph)
  const connect = useConnectFlow()

  return (
    <div className="toc-app">
      <CanvasTopBar
        title={doc.title}
        diagramType={doc.diagramType}
        cardCount={flow.nodes.filter((node) => node.type === 'card').length}
        connectionCount={flow.edges.length}
        droppedCount={graph.droppedConnections.length}
        onHome={onHome}
      />
      <StageBar />
      <div className={stageClassName(connect.isConnecting, isReadOnly)}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.onNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onSelectionChange={flow.onSelectionChange}
          onNodeDragStop={flow.onNodeDragStop}
          onConnect={connect.onConnect}
          onConnectStart={connect.onConnectStart}
          onConnectEnd={connect.onConnectEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionLineStyle={connectionLineStyle}
          connectionRadius={CONNECTION_SNAP_RADIUS}
          nodesDraggable={!isReadOnly}
          nodesConnectable={!isReadOnly}
          deleteKeyCode={null}
          fitView
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} color={CANVAS_COLORS.border} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={minimapColor} />
        </ReactFlow>
        <Legend />
        <SelectionPanels />
      </div>
    </div>
  )
}
