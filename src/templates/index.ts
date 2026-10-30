import statusQuoJson from './status-quo-metacrisis.json'
import type { ToCDocument } from '../model/schema'
import { importFromJson } from '../files/import'

/** Every call returns a fresh document, so opening a template never shares state with the last. */

function blank(
  title: string,
  sectionTitles: string[],
  diagramType: ToCDocument['diagramType'],
): ToCDocument {
  return {
    color: '#2F2D2E',
    title,
    schemaVersion: 1,
    diagramType,
    textSize: 1,
    curvature: 0.5,
    columnPadding: 48,
    sectionPadding: 48,
    sections: sectionTitles.map((t) => ({ title: t, columns: [{ nodes: [] }] })),
  }
}

export function blankTheoryOfChange(): ToCDocument {
  return blank(
    'Untitled theory of change',
    ['Inputs', 'Outputs', 'Outcomes', 'Goal', 'Impact'],
    'theory-of-change',
  )
}

export function blankStatusQuo(): ToCDocument {
  return blank(
    'Untitled status-quo map',
    ['Needs', 'Strategies', 'Drivers', 'Structures', 'Outcomes'],
    'status-quo',
  )
}

/** The bundled map takes the same path as a dropped file, so both normalise identically.
 * zod builds a fresh object on every parse, so there is nothing to clone. */
export function statusQuoMetacrisis(): ToCDocument {
  const result = importFromJson(statusQuoJson)
  if (!result.ok) {
    throw new Error(`Bundled status-quo template failed to parse: ${result.errors.join('; ')}`)
  }
  return result.document
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  /** Shown as the full-width first card on the home screen. */
  isFeatured?: boolean
  create: () => ToCDocument
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'status-quo-metacrisis',
    name: 'Metacrisis status-quo map',
    description: 'From unmet childhood needs to the metacrisis: the digitised whiteboard.',
    isFeatured: true,
    create: statusQuoMetacrisis,
  },
  {
    id: 'blank-toc',
    name: 'Blank theory of change',
    description: 'Inputs, Outputs, Outcomes, Goal, Impact.',
    create: blankTheoryOfChange,
  },
  {
    id: 'blank-status-quo',
    name: 'Blank status-quo map',
    description: 'Five empty columns for needs, strategies, drivers, structures and outcomes.',
    create: blankStatusQuo,
  },
]
