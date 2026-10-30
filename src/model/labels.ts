import type { DiagramType } from './schema'
import { CONFIDENCE_HIGH_MIN, CONFIDENCE_MEDIUM_MIN } from '../canvas/config'

/**
 * UI wording keyed by `diagramType`. The JSON keys never change: a status-quo map calls the
 * `assumptions` field "Mechanism" on screen and still writes `assumptions` to the file, so a
 * compatible export opens on theoryofchangebuilder.com unchanged.
 */

export interface BlockFieldLabels {
  label: string
  hint: string
  /** The dashed full-width button shown when the list is empty. */
  empty: string
  placeholder: string
}

export interface DiagramLabels {
  typeName: string
  /** The `assumptions` field. */
  mechanism: BlockFieldLabels
  /** The `evidence` field. */
  evidence: BlockFieldLabels
  /** The line-style footnote at the bottom of the Connection Details panel. */
  footnote: string
}

const LINE_STYLE_NOTE = `Line style follows confidence: solid at ${CONFIDENCE_HIGH_MIN} and above, dashed from ${CONFIDENCE_MEDIUM_MIN} to ${CONFIDENCE_HIGH_MIN - 1}, dotted below ${CONFIDENCE_MEDIUM_MIN}.`

const EVIDENCE: BlockFieldLabels = {
  label: 'Evidence',
  hint: 'Sources, observations, reasoning',
  empty: 'Add evidence',
  placeholder: 'What supports this link?',
}

const LABELS: Record<DiagramType, DiagramLabels> = {
  'theory-of-change': {
    typeName: 'Theory of change',
    mechanism: {
      label: 'Assumptions',
      hint: 'What must hold for this link to work',
      empty: 'Add an assumption',
      placeholder: 'What has to be true for this link to work?',
    },
    evidence: EVIDENCE,
    footnote: LINE_STYLE_NOTE,
  },
  'status-quo': {
    typeName: 'Status quo',
    mechanism: {
      label: 'Mechanism',
      hint: 'How the first leads to the second',
      empty: 'Add the mechanism',
      placeholder: 'Describe how the first leads to the second',
    },
    evidence: EVIDENCE,
    footnote: `${LINE_STYLE_NOTE} Mechanism is saved as "assumptions" in the theoryofchangebuilder.com file.`,
  },
}

/** A file with no `diagramType` (every plain ToCB export) reads as a theory of change. */
export const DEFAULT_DIAGRAM_TYPE: DiagramType = 'theory-of-change'

export function labelsFor(diagramType: DiagramType | undefined): DiagramLabels {
  return LABELS[diagramType ?? DEFAULT_DIAGRAM_TYPE]
}
