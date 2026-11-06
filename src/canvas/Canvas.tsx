import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  useStore,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useToCStore } from '../state/store'
import { isFreeLayout } from '../model/schema'
import { connectionRefKey, type ConnectionRef } from '../state/connections'
import { buildFlow } from './buildFlow'
import { useControlledFlow } from './useControlledFlow'
import { useConnectFlow } from './useConnectFlow'
import { useAddCard } from './useAddCard'
import { CardNode } from './CardNode'
import { SectionHeaderNode } from './SectionHeaderNode'
import { GroupNode } from './GroupNode'
import { RegionNode } from './RegionNode'
import { BandNode } from './BandNode'
import { ConnectionEdge } from './ConnectionEdge'
import { RoutedEdge } from './RoutedEdge'
import { Legend } from './Legend'
import { NeedColoursSwitch } from './NeedColoursSwitch'
import { computeNeedMixes } from './needMix'
import { tidyLayout } from './tidyLayout'
import { labelCounts } from './linkLabels'
import { allNodes } from '../state/tree'
import { SnapGuide } from './SnapGuide'
import { CanvasTopBar } from './CanvasTopBar'
import { TheoryNoteBar } from './TheoryNoteBar'
import { NodePanel } from '../panels/NodePanel'
import { NodeReadPanel } from '../panels/NodeReadPanel'
import { ConnectionDetails } from '../panels/ConnectionDetails'
import { StageBar } from '../share/StageBar'
import { CANVAS_COLORS } from './config'
import './canvas.css'

const nodeTypes = {
  card: CardNode,
  sectionHeader: SectionHeaderNode,
  group: GroupNode,
  band: BandNode,
  region: RegionNode,
}
const edgeTypes = { connection: ConnectionEdge, routed: RoutedEdge }

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
  if (node.type === 'band' || node.type === 'region') return 'rgba(47, 45, 46, 0.08)'
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
export interface CanvasProps {
  onHome: () => void
  onSwitchTheory: (slug: string) => void
  /** A strip the app adds under the top bar (the draft bar on a theory). */
  banner?: ReactNode
}

export function Canvas({ onHome, onSwitchTheory, banner }: CanvasProps) {
  const doc = useToCStore((state) => state.document)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const graph = useMemo(() => buildFlow(doc), [doc])
  const needs = useMemo(() => computeNeedMixes(doc).needs, [doc])
  const linkLabels = useMemo(
    () => labelCounts(allNodes(doc).flatMap((node) => node.connections.map((c) => c.label))),
    [doc],
  )
  const flow = useControlledFlow(doc, graph)
  const connect = useConnectFlow()
  const addCard = useAddCard(flow.nodes)
  const free = isFreeLayout(doc)
  const canAdd = free && !isReadOnly
  const isEmpty = !flow.nodes.some((node) => node.type === 'card')
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
        onSwitchTheory={onSwitchTheory}
        // A free canvas keeps every card where its author put it: nothing to tidy.
        onTidy={free ? undefined : () => tidyLayout(flow.nodes)}
        onAddCard={canAdd ? addCard.addAtCentre : undefined}
      />
      <StageBar />
      <TheoryNoteBar />
      {banner}
      <div className={stageClassName(connect.isConnecting, isReadOnly)}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          onNodesChange={flow.onNodesChange}
          onEdgesChange={flow.onEdgesChange}
          onSelectionChange={flow.onSelectionChange}
          onNodeDragStart={flow.onNodeDragStart}
          onNodeDrag={flow.onNodeDrag}
          onNodeDragStop={flow.onNodeDragStop}
          onInit={(instance) => {
            flow.onInit(instance)
            addCard.onInit(instance)
          }}
          // On a free canvas a double-click on empty space adds a card there instead of zooming.
          zoomOnDoubleClick={!canAdd}
          // Every visible dot on a free card starts a link, so a drop on one must count too: loose
          // mode lets a link end on any handle (onConnect reads only the two cards).
          connectionMode={free ? ConnectionMode.Loose : ConnectionMode.Strict}
          onDoubleClick={canAdd ? addCard.onDoubleClick : undefined}
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
          fitViewOptions={{ padding: 0.1 }}
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
        {canAdd && isEmpty ? (
          <p className="toc-stage__hint">Double-click anywhere to add a card</p>
        ) : null}
        <Legend needs={needs} linkLabels={linkLabels} />
        <NeedColoursSwitch />
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
