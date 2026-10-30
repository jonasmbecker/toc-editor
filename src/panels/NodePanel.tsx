import { useMemo } from 'react'
import type { ToCDocument } from '../model/schema'
import { resolveSelectedNode, useToCStore } from '../state/store'
import { connectionCountForNode, deleteNode, moveNodeToColumn, updateNode } from '../state/nodes'
import { NodePanelHeader } from './NodePanelHeader'
import { NodeIdentityFields } from './NodeIdentityFields'
import { NodeColorField } from './NodeColorField'
import { NodeDeleteControl } from './NodeDeleteControl'
import { NodePositionFields } from './NodePositionFields'
import { swatchOptions } from './colorPalette'
import './panels.css'

function titleEdit(nodeId: string, title: string) {
  return (document: ToCDocument) => updateNode(document, nodeId, { title })
}

function textEdit(nodeId: string, text: string) {
  return (document: ToCDocument) => updateNode(document, nodeId, { text })
}

function colorEdit(nodeId: string, color: string) {
  return (document: ToCDocument) => updateNode(document, nodeId, { color })
}

function moveEdit(nodeId: string, sectionIndex: number, columnIndex: number) {
  return (document: ToCDocument) => moveNodeToColumn(document, nodeId, sectionIndex, columnIndex)
}

/** The read-only detail card the canvas-render design placed top-left becomes this editor: same
 * slot, same frosted-surface look, now writable. Shown only while exactly one card is selected
 * (see Canvas's selection sync). Canvas mounts this with `key={selectedNodeId}`, so switching
 * (or clearing) the selection remounts it fresh, which is what resets its children's local UI
 * state rather than an effect reaching in after the fact. */
export function NodePanel() {
  const doc = useToCStore((state) => state.document)
  const selectedNodeId = useToCStore((state) => state.selectedNodeId)
  const transform = useToCStore((state) => state.transform)
  const select = useToCStore((state) => state.select)
  const selected = useMemo(() => resolveSelectedNode(doc, selectedNodeId), [doc, selectedNodeId])

  if (!selected) return null
  const { node, sectionIndex, columnIndex } = selected

  return (
    <aside className="toc-panel" aria-label="Node editor">
      <NodePanelHeader
        sectionTitle={doc.sections[sectionIndex].title}
        columnNumber={columnIndex + 1}
        onClose={() => select(null)}
      />

      <NodeIdentityFields
        title={node.title}
        text={node.text}
        onTitleChange={(title) =>
          transform('rename node', titleEdit(node.id, title), { coalesceKey: `title:${node.id}` })
        }
        onTextChange={(text) =>
          transform('edit node text', textEdit(node.id, text), { coalesceKey: `text:${node.id}` })
        }
      />

      <NodeColorField
        options={swatchOptions(doc)}
        value={node.color}
        provenance={node.provenance}
        onChange={(color) => transform('recolour node', colorEdit(node.id, color))}
      />

      <NodePositionFields
        document={doc}
        sectionIndex={sectionIndex}
        columnIndex={columnIndex}
        onMove={(nextSection, nextColumn) =>
          transform('move node', moveEdit(node.id, nextSection, nextColumn))
        }
      />

      <NodeDeleteControl
        connectionCount={connectionCountForNode(doc, node.id)}
        onDelete={() => {
          transform(`delete "${node.title}"`, (document) => deleteNode(document, node.id))
          select(null)
        }}
      />
    </aside>
  )
}
