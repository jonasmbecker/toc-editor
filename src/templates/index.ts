import statusQuoJson from './status-quo-metacrisis.json'
import comBMatrixJson from './com-b-matrix-draft.json'
import { MAP_FORMAT_VERSION, type ToCDocument } from '../model/schema'
import { importFromJson } from '../files/import'
import { loadTheoryMap } from '../repo/mapSource'

/** Every call returns a fresh document, so opening a template never shares state with the last. */

function blank(
  title: string,
  sectionTitles: string[],
  diagramType: ToCDocument['diagramType'],
): ToCDocument {
  return {
    color: '#2F2D2E',
    title,
    version: MAP_FORMAT_VERSION,
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

/** The f009 COM-B draft as a matrix (format version 2): a separate map, so the default map stays
 * exactly as it is until Jonas decides at the publish checkpoint. */
export function comBMatrixDraft(): ToCDocument {
  const result = importFromJson(comBMatrixJson)
  if (!result.ok) {
    throw new Error(`Bundled COM-B matrix draft failed to parse: ${result.errors.join('; ')}`)
  }
  return result.document
}

/** The default map: the theory repo's `main`, or the bundled copy when GitHub cannot give a
 * map the editor can open (offline, blocked, rate-limited, a 404, a file that fails the
 * schema). Never rejects and never says why: opening the map must not depend on GitHub. */
export async function loadDefaultMap(): Promise<ToCDocument> {
  try {
    return await loadTheoryMap()
  } catch {
    return statusQuoMetacrisis()
  }
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  /** Shown as the full-width first card on the home screen. */
  isFeatured?: boolean
  /** The bundled copy: instant, offline, and what tests and the fallback use. */
  create: () => ToCDocument
  /** When given, opening the card uses this instead of `create`. */
  load?: () => Promise<ToCDocument>
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'status-quo-metacrisis',
    name: 'Metacrisis status-quo map',
    description: 'From unmet childhood needs to the metacrisis: the digitised whiteboard.',
    isFeatured: true,
    create: statusQuoMetacrisis,
    load: loadDefaultMap,
  },
  {
    id: 'com-b-matrix',
    name: 'COM-B matrix (draft)',
    description:
      'The same theory in three layers: what people can do, what the world lets them do, what they want.',
    create: comBMatrixDraft,
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
