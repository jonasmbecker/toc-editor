import type { BlockFieldLabels, DiagramLabels } from '../model/labels'
import { splitEvidence } from '../model/evidence'
import type { DocumentNode, EvidenceBlock } from '../model/schema'
import { LinkChip } from './LinkChip'
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

  return (
    <aside className="toc-panel toc-panel--connection" aria-label="Connection details">
      <ConnectionPanelHeader connection={connection} onClose={onClose} isReadOnly />
      <div className="toc-ends">
        <span className="toc-end__label">From</span>
        <EndCard node={source} />
        <div className="toc-ends__leads">
          <EdgeSwatch appearance={edgeAppearance(connection)} />
          <span>leads to</span>
        </div>
        <span className="toc-end__label">To</span>
        <EndCard node={target} />
      </div>
      <ConfidenceField
        confidence={connection.confidence}
        isFeedbackLoop={connection.isFeedbackLoop === true}
        disabled
      />
      <ReadBlocks
        labels={labels.mechanism}
        blocks={splitBlocks(connection.assumptions).map((text) => ({ text }))}
        numbered
      />
      <ReadBlocks labels={labels.evidence} blocks={splitEvidence(connection)} />
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

interface ReadBlocksProps {
  labels: BlockFieldLabels
  blocks: EvidenceBlock[]
  numbered?: boolean
}

/** Static paragraphs; evidence blocks also show which mechanisms they support (static pills)
 * and their link chips, which stay clickable. */
function ReadBlocks({ labels, blocks, numbered }: ReadBlocksProps) {
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
            <div
              key={index}
              className={`toc-block toc-block--read${numbered ? ' toc-block--numbered' : ''}`}
            >
              {numbered ? <span className="toc-block__number">{index + 1}</span> : null}
              <div className="toc-block__body">
                {block.text ? <p>{block.text}</p> : null}
                {block.supports?.length ? (
                  <div className="toc-tags" aria-label="Supports mechanism">
                    {block.supports.map((n) => (
                      <span key={n} className="toc-tag" aria-pressed="true">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : null}
                {block.links?.length ? (
                  <div className="toc-chips">
                    {block.links.map((link, i) => (
                      <LinkChip key={i} link={link} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
