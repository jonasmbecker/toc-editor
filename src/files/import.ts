import { parseDocument, type ParseIssue, type ToCDocument } from '../model/schema'
import { migrateDocument } from '../model/migrate'
import { collapseMutualLoops } from '../model/normalize'
import { normalizeGroups } from '../state/groups'

/**
 * Turns a chosen or dropped file, or any already-parsed JSON value, into a document, or into a
 * list of problems in plain words. Nothing is thrown at the caller: an import screen shows
 * every problem at once. Unknown keys survive because the schema is passthrough all the way
 * down. Every way a document enters the app (file, bundled template, later a share link)
 * goes through `importFromJson`, so they can never normalise differently.
 */

export type ImportResult = { ok: true; document: ToCDocument } | { ok: false; errors: string[] }

/** A document this size is far beyond any real diagram; the cap keeps a stray drop from
 * freezing the tab on a synchronous parse and validation. */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024
/** How many problems the error list shows before summarising the rest. */
const MAX_LISTED_ERRORS = 50

const SEGMENT_NAMES: Record<string, string> = {
  sections: 'section',
  columns: 'column',
  nodes: 'node',
  connections: 'connection',
}

/** ['sections','0','columns','1','nodes','2','title'] -> "section 1, column 2, node 3, title". */
export function describePath(path: string[]): string {
  if (path.length === 0) return 'the file'
  const words: string[] = []
  for (let i = 0; i < path.length; i++) {
    const name = SEGMENT_NAMES[path[i]]
    const index = Number(path[i + 1])
    if (name && Number.isInteger(index)) {
      words.push(`${name} ${index + 1}`)
      i++
    } else {
      words.push(path[i])
    }
  }
  return words.join(', ')
}

function plainMessage(message: string): string {
  if (/expected \w+, received undefined/.test(message)) return 'is missing'
  return message.replace(/^Invalid input: /, '')
}

function describeIssues(issues: ParseIssue[]): string[] {
  const listed = issues
    .slice(0, MAX_LISTED_ERRORS)
    .map((issue) => `At ${describePath(issue.path)}: ${plainMessage(issue.message)}`)
  const rest = issues.length - listed.length
  return rest > 0 ? [...listed, `and ${rest} more problem${rest === 1 ? '' : 's'}`] : listed
}

export function importFromJson(raw: unknown): ImportResult {
  // Older formats are brought up to date first, so validation only ever sees the current one.
  const migrated = migrateDocument(raw)
  if (!migrated.ok) return { ok: false, errors: migrated.errors }
  const result = parseDocument(migrated.value)
  if (!result.ok) return { ok: false, errors: describeIssues(result.issues) }
  // Older files store a both-ways arrow as two flagged connections; the tool keeps one.
  return { ok: true, document: normalizeGroups(collapseMutualLoops(result.document)) }
}

export function importFromText(text: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['This is not a JSON file (it could not be read as JSON).'] }
  }
  return importFromJson(raw)
}

export async function importFromFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    const limit = Math.round(MAX_IMPORT_BYTES / 1024 / 1024)
    return { ok: false, errors: [`This file is larger than ${limit} MB, far more than a diagram.`] }
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    // A dropped folder, or a file removed between the drop and the read.
    return { ok: false, errors: ['The file could not be read. Is it a file, not a folder?'] }
  }
  return importFromText(text)
}
