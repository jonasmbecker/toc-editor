import { create, type StoreApi } from 'zustand'
import type { DocumentNode, ToCDocument } from '../model/schema'
import { findNodeLocation } from './nodes'
import { findConnection, sameRef, type ConnectionRef } from './connections'

/**
 * The single source of truth for the document being edited. Every mutation — node CRUD,
 * section CRUD, drag, connections, diagram settings — goes through `transform` as a pure
 * `(document) => document` function, so undo/redo, and later export and autosave, all replay
 * the same kind of step instead of each inventing its own notion of "what changed".
 */

const MAX_HISTORY = 100
const DEFAULT_COALESCE_WINDOW_MS = 600

interface HistoryEntry {
  label: string
  document: ToCDocument
}

interface CoalesceToken {
  key: string
  expiresAt: number
}

export interface TransformOptions {
  /** Edits sharing the same key within the coalesce window collapse into one history entry,
   * so a sentence typed into a textarea is one undo step, not one per keystroke. */
  coalesceKey?: string
  coalesceWindowMs?: number
}

interface ToCStoreState {
  document: ToCDocument
  selectedNodeId: string | null
  /** The connection open in the Connection Details panel. Exclusive with `selectedNodeId`:
   * only one editor panel is ever open. */
  selectedConnection: ConnectionRef | null
  /** A short bottom-centre notice (undo confirmation, a refused connection); null when none. */
  notice: string | null
  isDirty: boolean
  /** Opened from a view link: every edit is refused here, so no control has to remember to. */
  isReadOnly: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export interface LoadOptions {
  readOnly?: boolean
}

interface ToCStoreActions {
  load: (document: ToCDocument, options?: LoadOptions) => void
  select: (nodeId: string | null) => void
  selectConnection: (ref: ConnectionRef | null) => void
  notify: (notice: string | null) => void
  transform: (
    label: string,
    updater: (document: ToCDocument) => ToCDocument,
    options?: TransformOptions,
  ) => void
  /** Returns the label of the action just undone (for a toast), or null if there was nothing. */
  undo: () => string | null
  redo: () => string | null
}

export type ToCStore = ToCStoreState & ToCStoreActions

// Bookkeeping for keystroke coalescing. Kept outside the store's own state (rather than as a
// field on it) because it is a timing detail no component should re-render on, and `load`
// resetting it to null is what gives tests a clean slate between cases.
let coalesceToken: CoalesceToken | null = null

function emptyDocument(): ToCDocument {
  return { color: '#2F2D2E', title: 'Untitled', sections: [] }
}

function freshState(document: ToCDocument, { readOnly = false }: LoadOptions = {}): ToCStoreState {
  coalesceToken = null
  return {
    document,
    selectedNodeId: null,
    selectedConnection: null,
    notice: null,
    isDirty: false,
    isReadOnly: readOnly,
    past: [],
    future: [],
  }
}

interface StoreAccess {
  get: StoreApi<ToCStore>['getState']
  set: StoreApi<ToCStore>['setState']
}

function applyTransform(
  { get, set }: StoreAccess,
  label: string,
  updater: (document: ToCDocument) => ToCDocument,
  options?: TransformOptions,
): void {
  const { document: before, past, isReadOnly } = get()
  if (isReadOnly) return
  const after = updater(before)
  // Every model operation returns its input *by reference* when it changes nothing (unknown id,
  // same value, same column). Such a call must leave history, dirtiness and the coalesce
  // token exactly as they were, or Ctrl+Z would "undo" an edit that never happened.
  if (after === before) return
  const now = Date.now()
  const key = options?.coalesceKey
  const windowMs = options?.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS
  const continuesCoalesce =
    key != null && coalesceToken?.key === key && coalesceToken.expiresAt > now
  coalesceToken = key != null ? { key, expiresAt: now + windowMs } : null

  if (continuesCoalesce) {
    set({ document: after, isDirty: true, future: [] })
    return
  }
  set({
    document: after,
    past: [...past, { label, document: before }].slice(-MAX_HISTORY),
    future: [],
    isDirty: true,
  })
}

/** A connection ref is `(sourceId, index)`, and undo or redo can restore a document where that
 * index denotes a different connection (a deleted sibling comes back in front of it). Keep the
 * selection only while it still points at the same target; otherwise drop it, so the panel
 * never edits a connection the user did not click. */
function keptSelection(before: ToCDocument, after: ToCDocument, ref: ConnectionRef | null) {
  if (!ref) return null
  const wasTarget = findConnection(before, ref)?.targetId
  const isTarget = findConnection(after, ref)?.targetId
  return isTarget !== undefined && isTarget === wasTarget ? ref : null
}

function applyUndo({ get, set }: StoreAccess): string | null {
  const { past, document, future, selectedConnection } = get()
  const entry = past[past.length - 1]
  if (!entry || get().isReadOnly) return null
  coalesceToken = null
  set({
    document: entry.document,
    past: past.slice(0, -1),
    future: [{ label: entry.label, document }, ...future],
    isDirty: true,
    selectedConnection: keptSelection(document, entry.document, selectedConnection),
  })
  return entry.label
}

function applyRedo({ get, set }: StoreAccess): string | null {
  const { future, document, past, selectedConnection } = get()
  const entry = future[0]
  if (!entry || get().isReadOnly) return null
  coalesceToken = null
  set({
    document: entry.document,
    future: future.slice(1),
    past: [...past, { label: entry.label, document }],
    isDirty: true,
    selectedConnection: keptSelection(document, entry.document, selectedConnection),
  })
  return entry.label
}

export const useToCStore = create<ToCStore>((set, get) => ({
  ...freshState(emptyDocument()),
  load(document, options) {
    set(freshState(document, options))
  },
  select(nodeId) {
    const { selectedNodeId, selectedConnection } = get()
    if (nodeId === selectedNodeId && selectedConnection === null) return
    set({ selectedNodeId: nodeId, selectedConnection: null })
  },
  selectConnection(ref) {
    // Value-equal refs keep the existing object, so React Flow's own selection echo (it hands
    // back a fresh ref for the edge we just selected) does not re-render every subscriber.
    const { selectedNodeId, selectedConnection } = get()
    if (sameRef(ref, selectedConnection) && selectedNodeId === null) return
    set({ selectedConnection: ref, selectedNodeId: null })
  },
  notify(notice) {
    set({ notice })
  },
  transform(label, updater, options) {
    applyTransform({ get, set }, label, updater, options)
  },
  undo() {
    return applyUndo({ get, set })
  },
  redo() {
    return applyRedo({ get, set })
  },
}))

export interface SelectedNode {
  node: DocumentNode
  sectionIndex: number
  columnIndex: number
}

/**
 * Resolves the selected node id back to its data and position — selection only ever stores an
 * id, so this is the one place that turns it back into content. Deliberately *not* shaped as a
 * zustand selector `(state) => SelectedNode | null`: it returns a fresh object on every call,
 * and `useSyncExternalStore` (what `useToCStore` is built on) compares snapshots by reference,
 * so passing a function like that straight to `useToCStore` reruns on every render forever.
 * Call it from a `useMemo` keyed on `document`/`selectedNodeId` instead (see `NodePanel`).
 */
export function resolveSelectedNode(
  document: ToCDocument,
  selectedNodeId: string | null,
): SelectedNode | null {
  if (!selectedNodeId) return null
  const location = findNodeLocation(document, selectedNodeId)
  if (!location) return null
  const { sectionIndex, columnIndex, nodeIndex } = location
  const node = document.sections[sectionIndex].columns[columnIndex].nodes[nodeIndex]
  return { node, sectionIndex, columnIndex }
}
