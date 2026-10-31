import { splitBlocks } from '../panels/blocks'
import { WEB_URL_PATTERN, type Connection, type EvidenceBlock, type EvidenceLink } from './schema'

/**
 * Evidence as structured blocks (an extension) over the plain `evidence` string ToCB reads.
 * The string is always rewritten from the blocks through `flattenEvidence`, so the compatible
 * export carries every tag and link as readable text.
 */

/** Blocks for a connection: `evidenceBlocks` wins when present, otherwise the string is split
 * on blank lines into plain blocks, exactly as the panel always did. */
export function splitEvidence(
  connection: Pick<Connection, 'evidence' | 'evidenceBlocks'>,
): EvidenceBlock[] {
  if (connection.evidenceBlocks) return connection.evidenceBlocks
  return splitBlocks(connection.evidence).map((text) => ({ text }))
}

function supportsLine(supports: number[]): string {
  const sorted = [...new Set(supports)].sort((a, b) => a - b)
  return `Supports mechanism ${sorted.join(', ')}`
}

export function linkLine(link: EvidenceLink): string {
  return link.label ? `${link.label}: ${link.url}` : link.url
}

/** Block text, then a "Supports mechanism 1, 2" line, then one line per link; blocks are
 * joined with a blank line. */
export function flattenEvidence(blocks: EvidenceBlock[]): string {
  return blocks
    .map((block) => {
      const lines = [block.text.trim()]
      if (block.supports?.length) lines.push(supportsLine(block.supports))
      for (const link of block.links ?? []) lines.push(linkLine(link))
      return lines.filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

/** What to store in `evidenceBlocks`: undefined when no block carries a tag or link, so a
 * plain-text connection stays exactly as ToCB wrote it. */
export function storedBlocks(blocks: EvidenceBlock[]): EvidenceBlock[] | undefined {
  const kept = blocks.filter((b) => b.text.trim() || b.links?.length)
  return kept.some((b) => b.supports?.length || b.links?.length) ? kept : undefined
}

function remapSupports(
  blocks: EvidenceBlock[],
  map: (n: number) => number | null,
): EvidenceBlock[] {
  return blocks.map((block) => {
    if (!block.supports) return block
    const supports = [
      ...new Set(block.supports.map(map).filter((n): n is number => n !== null)),
    ].sort((a, b) => a - b)
    const rest = { ...block }
    delete rest.supports
    return supports.length ? { ...rest, supports } : rest
  })
}

/** Mechanism block `removed` (1-based) is gone: drop references to it, shift the later ones. */
export function dropMechanism(blocks: EvidenceBlock[], removed: number): EvidenceBlock[] {
  return remapSupports(blocks, (n) => (n === removed ? null : n > removed ? n - 1 : n))
}

/** Mechanism block `from` moved to position `to` (both 1-based): references follow it. */
export function moveMechanism(blocks: EvidenceBlock[], from: number, to: number): EvidenceBlock[] {
  return remapSupports(blocks, (n) => {
    if (n === from) return to
    if (from < to && n > from && n <= to) return n - 1
    if (from > to && n >= to && n < from) return n + 1
    return n
  })
}

export type LinkResult = { ok: true; url: string } | { ok: false; error: string }

export const LINK_ERROR = 'Use a web address starting with https://'

/** Accepts only http(s) urls that the URL parser also agrees are http(s). */
export function parseLinkUrl(raw: string): LinkResult {
  const url = raw.trim()
  if (!WEB_URL_PATTERN.test(url)) return { ok: false, error: LINK_ERROR }
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
      ? { ok: true, url }
      : { ok: false, error: LINK_ERROR }
  } catch {
    return { ok: false, error: LINK_ERROR }
  }
}

/** Host shown on a chip; empty for an unparseable url, which is never rendered as a link. */
export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
