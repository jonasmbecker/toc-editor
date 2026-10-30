import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useStore,
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
import { GroupNode } from './GroupNode'
import { ConnectionEdge } from './ConnectionEdge'
import { LoopEdge } from './LoopEdge'
import { Legend } from './Legend'
import { tidyLayout } from './tidyLayout'
import { SnapGuide } from './SnapGuide'
import { CanvasTopBar } from './CanvasTopBar'
import { NodePanel } from '../panels/NodePanel'
import { NodeReadPanel } from '../panels/NodeReadPanel'
import { ConnectionDetails } from '../panels/ConnectionDetails'
import { StageBar } from '../share/StageBar'
import { CANVAS_COLORS } from './config'
import './canvas.css'

const nodeTypes = { card: CardNode, sectionHeader: SectionHeaderNode, group: GroupNode }
const edgeTypes = { connection: ConnectionEdge, loop: LoopEdge }

/** The in-progress line while dragging from a handle: dashed, in the selection colour. */
const connectionLineStyle = {
  stroke: CANVAS_COLORS.select,
  strokeWidth: 1.6,
  strokeDasharray: '6 4',
}

/** How close (px) a drag has to get to a target handle to snap onto it, so dropping anywhere
 * near a card's left edge counts rather than demanding a hit on the 16px dot. */
const CONNECTION_SNAP_RADIUS = 48

/** Remount key for the details panel: a string, so the zustand selector returns a stable
 * primitive and never re-renders on an unchanged selection. */
function keyOf(ref: ConnectionRef | null): string {
  return ref ? `conn:${connectionRefKey(ref)}` : 'conn:none'
}

function minimapColor(node: Node): string {
  if (node.type === 'sectionHeader') return CANVAS_COLORS.primary
  return node.type === 'group' ? 'rgba(201, 196, 186, 0.35)' : '#C9C4BA'
}

function stageClassName(isConnecting: boolean, isReadOnly: boolean): string {
  return ['toc-stage', isConnecting && 'toc-stage--connecting', isReadOnly && 'toc-stage--readonly']
    .filter(Boolean)
    .join(' ')
}

/** Below this zoom the cards show only their titles, so headlines stay the largest thing on
 * screen at fit-to-screen. Mirrored on the stage as data-compact for the CSS to read. */
const COMPACT_ZOOM = 0.75

/** Connection handles grow by up to this factor when zoomed out, so they stay a real target. */
const MAX_HANDLE_BOOST = 1.6

/** 1/zoom clamped to 1..MAX_HANDLE_BOOST, rounded so panning does not re-render on every frame. */
function handleBoost(zoom: number): number {
  const boost = Math.min(MAX_HANDLE_BOOST, Math.max(1, 1 / zoom))
  return Math.round(boost * 20) / 20
}

/** Renders nothing: copies "zoomed out past COMPACT_ZOOM" and the handle boost onto the
 * enclosing stage element (attributes, not className, so React never clobbers them). */
function ZoomMarker() {
  const compact = useStore((state) => state.transform[2] < COMPACT_ZOOM)
  const boost = useStore((state) => handleBoost(state.transform[2]))
  // Rounded so panning never re-renders; the stylesheet turns it into adaptive title sizes.
  const zoom = useStore((state) => Math.round(state.transform[2] * 50) / 50)
  const marker = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const stage = marker.current?.closest<HTMLElement>('.toc-stage')
    stage?.setAttribute('data-compact', String(compact))
    stage?.style.setProperty('--toc-handle-boost', String(boost))
    stage?.style.setProperty('--toc-zoom', String(zoom))
  }, [compact, boost, zoom])
  return <span ref={marker} hidden />
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
  const [showMinimap, setShowMinimap] = useState(false)

  return (
    <div className="toc-app">
      <CanvasTopBar
        title={doc.title}
        diagramType={doc.diagramType}
        cardCount={flow.nodes.filter((node) => node.type === 'card').length}
        connectionCount={flow.edges.length}
        droppedCount={graph.droppedConnections.length}
        onHome={onHome}
        onTidy={() => tidyLayout(flow.nodes)}
      />
      <StageBar />
      <div className={stageClassName(connect.isConnecting, isReadOnly)}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.onNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onSelectionChange={flow.onSelectionChange}
          onNodeDragStart={flow.onNodeDragStart}
          onNodeDragStop={flow.onNodeDragStop}
          onInit={flow.onInit}
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
          // Default elevation lifts a selected node above the rest, which would draw a selected
          // group's container over its own cards.
          elevateNodesOnSelect={false}
          fitView
          fitViewOptions={{ padding: 0.03 }}
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} color={CANVAS_COLORS.border} />
          <Controls showInteractive={false} />
          {showMinimap ? (
            <MiniMap pannable zoomable nodeColor={minimapColor} style={{ bottom: 44 }} />
          ) : null}
          <ZoomMarker />
          <SnapGuide guide={flow.guide} />
        </ReactFlow>
        <Legend />
        <button
          type="button"
          className="toc-minimap-toggle"
          aria-pressed={showMinimap}
          onClick={() => setShowMinimap((shown) => !shown)}
        >
          Minimap
        </button>
        <SelectionPanels />
      </div>
    </div>
  )
}
