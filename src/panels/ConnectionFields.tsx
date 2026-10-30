import { useState } from 'react'
import { dropMechanism, flattenEvidence, splitEvidence, storedBlocks } from '../model/evidence'
import type { DiagramLabels } from '../model/labels'
import type { Connection } from '../model/schema'
import { splitBlocks } from './blocks'
import { ConnectionEvidence } from './ConnectionEvidence'
import {
  connectionRefKey,
  type ConnectionPatch,
  type ConnectionRef,
  type ResolvedConnection,
} from '../state/connections'
import { ConfidenceField } from './ConfidenceField'
import { BlockListField } from './BlockListField'

const firstWords = (text: string) => text.split(/\s+/).slice(0, 6).join(' ')

/** When the new mechanism text has one block fewer than the stored one, that block was
 * removed (or emptied): drop the evidence tags that pointed at it and shift the rest, in the
 * same patch so one undo restores both. */
function renumberPatch(connection: Connection, nextAssumptions: string) {
  const before = splitBlocks(connection.assumptions)
  const after = splitBlocks(nextAssumptions)
  if (after.length !== before.length - 1) return {}
  const removed = before.findIndex((text, i) => text !== after[i])
  const blocks = splitEvidence(connection)
  if (!blocks.some((b) => b.supports?.length)) return {}
  const next = dropMechanism(blocks, (removed === -1 ? before.length - 1 : removed) + 1)
  return { evidence: flattenEvidence(next), evidenceBlocks: storedBlocks(next) }
}

export interface ConnectionFieldsProps {
  resolved: ResolvedConnection
  connectionRef: ConnectionRef
  labels: DiagramLabels
  /** Applies a patch through the store; `coalesceKey` groups keystrokes into one undo step. */
  onEdit: (label: string, patch: ConnectionPatch, coalesceKey?: string) => void
}

/** The editable middle of the Connection Details panel: confidence and
 * the two block lists. Direction lives in the "Between" header. */
export function ConnectionFields({
  resolved,
  connectionRef,
  labels,
  onEdit,
}: ConnectionFieldsProps) {
  const { connection } = resolved
  const coalesceScope = connectionRefKey(connectionRef)
  const [hoverMechanism, setHoverMechanism] = useState<number | null>(null)
  const [hoverSupports, setHoverSupports] = useState<number[] | null>(null)
  const mechanismWords = splitBlocks(connection.assumptions).map(firstWords)

  return (
    <>
      <ConfidenceField
        confidence={connection.confidence}
        isFeedbackLoop={connection.isFeedbackLoop === true}
        onChange={(confidence) =>
          onEdit('rate connection', { confidence }, `confidence:${coalesceScope}`)
        }
      />
      <BlockListField
        id="conn-mechanism"
        labels={labels.mechanism}
        text={connection.assumptions}
        numbered
        highlighted={hoverSupports ?? undefined}
        onHoverBlock={setHoverMechanism}
        onChange={(assumptions) =>
          onEdit(
            `edit ${labels.mechanism.label.toLowerCase()}`,
            { assumptions, ...renumberPatch(connection, assumptions) },
            `assumptions:${coalesceScope}`,
          )
        }
      />
      <ConnectionEvidence
        connection={connection}
        labels={labels.evidence}
        mechanisms={mechanismWords}
        hoveredMechanism={hoverMechanism}
        onHoverSupports={setHoverSupports}
        onChange={(patch) => onEdit('edit evidence', patch, `evidence:${coalesceScope}`)}
      />
    </>
  )
}
