import { useMemo } from 'react'
import { resolveSelectedNode, useToCStore } from '../state/store'
import { splitBlocks } from './blocks'
import { NodePanelHeader } from './NodePanelHeader'
import './panels.css'

/** The node panel on a view link: the same slot and header as `NodePanel`, the text as plain
 * paragraphs and nothing that edits. Text is rendered as text, never as HTML or as links. */
export function NodeReadPanel() {
  const doc = useToCStore((state) => state.document)
  const selectedNodeId = useToCStore((state) => state.selectedNodeId)
  const select = useToCStore((state) => state.select)
  const selected = useMemo(() => resolveSelectedNode(doc, selectedNodeId), [doc, selectedNodeId])

  if (!selected) return null
  const { node, sectionIndex, columnIndex } = selected
  const paragraphs = splitBlocks(node.text)

  return (
    <aside className="toc-panel" aria-label="Node details">
      <NodePanelHeader
        sectionTitle={doc.sections[sectionIndex].title}
        columnNumber={columnIndex + 1}
        onClose={() => select(null)}
      />
      <h2 className="toc-panel__title toc-panel__title--read">{node.title}</h2>
      {paragraphs.length > 0 ? (
        paragraphs.map((text, index) => (
          <p key={index} className="toc-panel__read-text">
            {text}
          </p>
        ))
      ) : (
        <p className="toc-panel__read-empty">No description.</p>
      )}
    </aside>
  )
}
