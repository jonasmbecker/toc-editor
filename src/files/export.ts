import {
  CONNECTION_EXTENSION_KEYS,
  DOCUMENT_EXTENSION_KEYS,
  NODE_EXTENSION_KEYS,
  SECTION_EXTENSION_KEYS,
  type ToCDocument,
} from '../model/schema'
import { flattenEvidence, linkLine } from '../model/evidence'
import { expandBothWays } from '../model/normalize'
import { mapAllNodes } from '../state/nodes'
import { flattenGroups } from '../state/groups'

/**
 * Two downloads. "Full" is the current map format (version 2), every field kept. "Compatible"
 * is for theoryofchangebuilder.com: both-ways connections become mutual pairs, matrix rows
 * become plain sections and every extension key (the lists in `model/schema.ts`) is removed;
 * unknown keys a file brought along survive.
 */

function without<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>
  for (const key of keys) delete copy[key]
  return copy as T
}

function withExportedAt(doc: ToCDocument, now: Date): ToCDocument {
  return { ...doc, _metadata: { ...doc._metadata, exportedAt: now.toISOString() } }
}

export function toFullJson(doc: ToCDocument, now = new Date()): ToCDocument {
  return withExportedAt(doc, now)
}

export function toCompatibleJson(doc: ToCDocument, now = new Date()): ToCDocument {
  // ToCB has no groups: dissolve them first so arrows aimed at a group land on its first card.
  const expanded = mapAllNodes(expandBothWays(flattenGroups(doc)), (node) => ({
    ...without(node, NODE_EXTENSION_KEYS),
    // ToCB has no node links: they become lines at the end of the text.
    text: node.links?.length
      ? [node.text, ...node.links.map(linkLine)].filter(Boolean).join('\n')
      : node.text,
    connections: node.connections.map((c) => {
      // The flattened string carries tags and links; refresh it from the blocks so it is
      // right even if a block was edited by a tool that did not rewrite the string.
      const flat = c.evidenceBlocks ? { ...c, evidence: flattenEvidence(c.evidenceBlocks) } : c
      return without(flat, CONNECTION_EXTENSION_KEYS)
    }),
  }))
  // ToCB has no matrix: row sections become ordinary sections, in the order they are stored.
  const sections = expanded.sections.map((section) => without(section, SECTION_EXTENSION_KEYS))
  return withExportedAt(without({ ...expanded, sections }, DOCUMENT_EXTENSION_KEYS), now)
}

/** Lowercase ASCII slug of the title (accents stripped), so the name is safe for any browser's
 * download attribute and any file system. */
export function exportFilename(title: string, suffix = ''): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${slug || 'theory-of-change'}${suffix}.json`
}

export type ExportMode = 'full' | 'compatible'

/** Some engines cancel a download whose object URL is revoked in the same task as the click. */
const REVOKE_DELAY_MS = 1000

export function downloadDocument(doc: ToCDocument, mode: ExportMode): void {
  const data = mode === 'full' ? toFullJson(doc) : toCompatibleJson(doc)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportFilename(doc.title, mode === 'compatible' ? '.tocb' : '')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
