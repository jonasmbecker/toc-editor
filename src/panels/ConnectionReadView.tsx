import type { BlockFieldLabels, DiagramLabels } from '../model/labels'
import type { DocumentNode } from '../model/schema'
import { edgeAppearance, nodeColorStyle } from '../canvas/config'
import type { ResolvedConnection } from '../state/connections'
import { ConnectionPanelHeader } from './ConnectionPanelHeader'
import { ConfidenceField } from './ConfidenceField'
import { EdgeSwatch } from './EdgeSwatch'
import { splitBlocks } from './blocks'

export interface ConnectionReadViewProps {
  resolved: ResolvedConnection
  labels: DiagramLabels
  onClose: () => void
}

/** Connection Details on a view link, per the connections slice's view-only variant: the same
 * panel with nothing that edits. End cards are not buttons, the slider is disabled but keeps
 * its value and band sentence, blocks are plain paragraphs. Text is never rendered as HTML. */
export function ConnectionReadView({ resolved, labels, onClose }: ConnectionReadViewProps) {
  const { connection, source, target } = resolved
  const isPairing = connection.provenance === 'verbatim-structure'

  return (
    <aside className="toc-panel toc-panel--connection" aria-label="Connection details">
      <ConnectionPanelHeader connection={connection} onClose={onClose} isReadOnly />
      <div className="toc-ends">
        <span className="toc-end__label">From</span>
        <EndCard node={source} />
        <div className="toc-ends__leads">
          <EdgeSwatch appearance={edgeAppearance(connection)} />
          <span>{isPairing ? 'is paired with' : 'leads to'}</span>
        </div>
        <span className="toc-end__label">To</span>
        <EndCard node={target} />
      </div>
      {isPairing ? null : (
        <ConfidenceField
          confidence={connection.confidence}
          isFeedbackLoop={connection.isFeedbackLoop === true}
          disabled
        />
      )}
      <ReadBlocks labels={labels.mechanism} text={connection.assumptions} />
      <ReadBlocks labels={labels.evidence} text={connection.evidence} />
      <p className="toc-footnote">{labels.footnote}</p>
    </aside>
  )
}

function EndCard({ node }: { node: DocumentNode }) {
  return (
    <div className="toc-end__card toc-end__card--static" style={nodeColorStyle(node.color)}>
      {node.title}
    </div>
  )
}

function ReadBlocks({ labels, text }: { labels: BlockFieldLabels; text: string | undefined }) {
  const blocks = splitBlocks(text)
  return (
    <section className="toc-field">
      <div className="toc-field__head">
        <span className="toc-panel__label">{labels.label}</span>
      </div>
      {blocks.length === 0 ? (
        <p className="toc-panel__read-empty">Nothing recorded yet.</p>
      ) : (
        <div className="toc-blocks">
          {blocks.map((block, index) => (
            <p key={index} className="toc-block toc-block--read">
              {block}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
