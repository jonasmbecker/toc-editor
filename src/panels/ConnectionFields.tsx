import type { DiagramLabels } from '../model/labels'
import {
  connectionRefKey,
  type ConnectionPatch,
  type ConnectionRef,
  type ResolvedConnection,
} from '../state/connections'
import { ConfidenceField } from './ConfidenceField'
import { BlockListField } from './BlockListField'

export interface ConnectionFieldsProps {
  resolved: ResolvedConnection
  connectionRef: ConnectionRef
  labels: DiagramLabels
  /** Applies a patch through the store; `coalesceKey` groups keystrokes into one undo step. */
  onEdit: (label: string, patch: ConnectionPatch, coalesceKey?: string) => void
}

/** The editable middle of the Connection Details panel: confidence (or the pairing note) and
 * the two block lists. Direction lives in the "Between" header. */
export function ConnectionFields({
  resolved,
  connectionRef,
  labels,
  onEdit,
}: ConnectionFieldsProps) {
  const { connection } = resolved
  const isPairing = connection.provenance === 'verbatim-structure'
  const coalesceScope = connectionRefKey(connectionRef)

  return (
    <>
      {isPairing ? (
        <section className="toc-field">
          <p className="toc-field__note">
            Paired rows are not a causal arrow, so confidence does not apply.
          </p>
        </section>
      ) : (
        <ConfidenceField
          confidence={connection.confidence}
          isFeedbackLoop={connection.isFeedbackLoop === true}
          onChange={(confidence) =>
            onEdit('rate connection', { confidence }, `confidence:${coalesceScope}`)
          }
        />
      )}
      <BlockListField
        id="conn-mechanism"
        labels={labels.mechanism}
        text={connection.assumptions}
        onChange={(assumptions) =>
          onEdit(
            `edit ${labels.mechanism.label.toLowerCase()}`,
            { assumptions },
            `assumptions:${coalesceScope}`,
          )
        }
      />
      <BlockListField
        id="conn-evidence"
        labels={labels.evidence}
        text={connection.evidence}
        onChange={(evidence) => onEdit('edit evidence', { evidence }, `evidence:${coalesceScope}`)}
      />
    </>
  )
}
