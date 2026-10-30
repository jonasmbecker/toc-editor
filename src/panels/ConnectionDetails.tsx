import { useMemo } from 'react'
import type { ToCDocument } from '../model/schema'
import { labelsFor } from '../model/labels'
import { useToCStore } from '../state/store'
import {
  deleteConnection,
  resolveConnection,
  updateConnection,
  type ConnectionPatch,
  type ConnectionRef,
  type Direction,
} from '../state/connections'
import { setDirection } from '../state/direction'
import { announce } from '../state/notice'
import { ConnectionPanelHeader } from './ConnectionPanelHeader'
import { ConnectionEnds } from './ConnectionEnds'
import { ConnectionFields } from './ConnectionFields'
import { ConnectionDeleteControl } from './ConnectionDeleteControl'
import { ConnectionReadView } from './ConnectionReadView'
import './panels.css'
import './connection-panel.css'
import './connection-fields.css'
import './connection-blocks.css'

function patchEdit(ref: ConnectionRef, patch: ConnectionPatch) {
  return (document: ToCDocument) => updateConnection(document, ref, patch)
}

/**
 * The Connection Details panel: the same top-left slot as the node editor, shown while a
 * connection is selected (the two selections are exclusive in the store). Canvas mounts it
 * keyed by the ref, so switching edges remounts it with fresh block and confirm state.
 */
export function ConnectionDetails() {
  const doc = useToCStore((state) => state.document)
  const ref = useToCStore((state) => state.selectedConnection)
  const transform = useToCStore((state) => state.transform)
  const select = useToCStore((state) => state.select)
  const selectConnection = useToCStore((state) => state.selectConnection)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  const resolved = useMemo(() => resolveConnection(doc, ref), [doc, ref])

  if (!resolved || !ref) return null
  const labels = labelsFor(doc.diagramType)
  if (isReadOnly) {
    return <ConnectionReadView resolved={resolved} labels={labels} onClose={() => select(null)} />
  }

  const changeDirection = (direction: Direction) => {
    const result = setDirection(doc, ref, direction)
    if (!result.ok) return announce('The other direction already exists as its own arrow')
    if (result.document === doc) return
    transform('change direction', () => result.document)
    // A forward/backward swap moves the connection to the other node; follow it.
    selectConnection(result.ref)
  }

  return (
    <aside className="toc-panel toc-panel--connection" aria-label="Connection details">
      <ConnectionPanelHeader connection={resolved.connection} onClose={() => select(null)} />
      <ConnectionEnds
        resolved={resolved}
        onSelectNode={select}
        onDirectionChange={changeDirection}
      />
      <ConnectionFields
        resolved={resolved}
        connectionRef={ref}
        labels={labels}
        onEdit={(label, patch, coalesceKey) =>
          transform(label, patchEdit(ref, patch), coalesceKey ? { coalesceKey } : undefined)
        }
      />
      <p className="toc-footnote">{labels.footnote}</p>
      <ConnectionDeleteControl
        fromTitle={resolved.source.title}
        toTitle={resolved.target.title}
        onDelete={() => {
          transform('delete connection', (document) => deleteConnection(document, ref))
          select(null)
          announce('Connection deleted. Ctrl+Z to undo')
        }}
      />
    </aside>
  )
}
