import { GROUP_KIND, type Connection, type DocumentNode, type ToCDocument } from '../model/schema'
import { splitDocument } from './split'

/**
 * What changed between two versions of the map, in plain words. One pure function shared by the
 * suggestion function (pull request title and body) and the editor's Suggest a change dialog, so
 * the contributor sees exactly the list the maintainer will read. It returns plain text: the
 * dialog renders it as text, and the function escapes it for markdown.
 *
 * Cards are matched by id. Positions never appear in `lines` (moving a card does not change the
 * theory); they are counted in `moved`.
 */

export interface ChangeSummary {
  /** One line per change to the theory, in a stable order. Empty when only positions changed. */
  lines: string[]
  cardsAdded: number
  cardsRemoved: number
  /** Cards whose position or width differ. */
  moved: number
  /** Any difference in `layout.json`: moved cards, or the spacing and text-size settings. */
  layoutChanged: boolean
}

const TITLE_LIMIT = 60
const ADDRESS_LIMIT = 120
const KEY_NAME_LIMIT = 30
const TITLE_MAX = 100

type Cards = Map<string, DocumentNode>

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

const quote = (text: string) => `"${clip(text, TITLE_LIMIT) || '(untitled)'}"`
const noun = (node: DocumentNode) => (node.kind === GROUP_KIND ? 'group' : 'card')

/** Key order does not matter to the theory, so two values are equal when their sorted JSON is. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )
}

function cardsOf(doc: ToCDocument): Cards {
  const nodes = doc.sections.flatMap((section) => section.columns.flatMap((column) => column.nodes))
  return new Map(nodes.map((node) => [node.id, node]))
}

/** The keys (other than `ignore`) at which two objects differ, for a "changed other details" line. */
function changedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignore: readonly string[],
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(
    (key) => !ignore.includes(key) && canon(before[key]) !== canon(after[key]),
  )
}

function otherDetails(keys: string[]): string {
  const shown = keys.slice(0, 5).map((key) => clip(key, KEY_NAME_LIMIT))
  return shown.join(', ') + (keys.length > 5 ? ', …' : '')
}

function cardLines(before: Cards, after: Cards): string[] {
  const lines: string[] = []
  for (const [id, node] of after) {
    if (!before.has(id)) lines.push(`Added ${noun(node)}: ${quote(node.title)}`)
  }
  for (const [id, node] of before) {
    if (!after.has(id)) lines.push(`Removed ${noun(node)}: ${quote(node.title)}`)
  }
  for (const [id, now] of after) {
    const was = before.get(id)
    if (was && was.title !== now.title) {
      lines.push(`Renamed ${noun(now)}: ${quote(was.title)} → ${quote(now.title)}`)
    }
  }
  for (const [id, now] of after) {
    const was = before.get(id)
    if (was && was.text !== now.text) lines.push(`Changed the description of ${quote(now.title)}`)
  }
  return lines
}

function groupTitle(cards: Cards, id: string): string {
  return `the group ${quote(cards.get(id)?.title ?? id)}`
}

function groupLines(before: Cards, after: Cards): string[] {
  const lines: string[] = []
  for (const [id, now] of after) {
    const was = before.get(id)
    if (!was || was.groupId === now.groupId) continue
    const from = was.groupId ? groupTitle(before, was.groupId) : null
    const to = now.groupId ? groupTitle(after, now.groupId) : null
    if (from && to) lines.push(`Moved ${quote(now.title)} from ${from} to ${to}`)
    else if (to) lines.push(`Put ${quote(now.title)} into ${to}`)
    else if (from) lines.push(`Took ${quote(now.title)} out of ${from}`)
  }
  return lines
}

/** A card's links by target. A second link to the same target gets a `#2` suffix. */
function linksByTarget(card: DocumentNode | undefined): Map<string, Connection> {
  const seen = new Map<string, number>()
  const out = new Map<string, Connection>()
  for (const link of card?.connections ?? []) {
    const n = (seen.get(link.targetId) ?? 0) + 1
    seen.set(link.targetId, n)
    out.set(n === 1 ? link.targetId : `${link.targetId}#${n}`, link)
  }
  return out
}

const REASONING_KEYS = ['assumptions', 'evidence', 'evidenceBlocks']
const LINK_KEYS_HANDLED = ['id', 'targetId', 'confidence', 'isFeedbackLoop', ...REASONING_KEYS]

function linkChanges(was: Connection, now: Connection, label: string): string[] {
  const lines: string[] = []
  if (was.confidence !== now.confidence) {
    const from = was.confidence ?? 'not set'
    lines.push(
      `Changed the confidence of the link ${label} from ${from} to ${now.confidence ?? 'not set'}`,
    )
  }
  if (REASONING_KEYS.some((key) => canon(was[key]) !== canon(now[key]))) {
    lines.push(`Changed the reasoning behind the link ${label}`)
  }
  if (Boolean(was.isFeedbackLoop) !== Boolean(now.isFeedbackLoop)) {
    lines.push(`${now.isFeedbackLoop ? 'Marked' : 'Unmarked'} the link ${label} as a feedback loop`)
  }
  const other = changedKeys(was, now, LINK_KEYS_HANDLED)
  if (other.length > 0)
    lines.push(`Changed other details of the link ${label} (${otherDetails(other)})`)
  return lines
}

/** Links of a removed card vanish with it, so they are not listed; links *to* it are. */
function linkLines(before: Cards, after: Cards): string[] {
  const lines: string[] = []
  const titleOf = (id: string) => quote(after.get(id)?.title ?? before.get(id)?.title ?? id)
  for (const [id, card] of after) {
    const oldLinks = linksByTarget(before.get(id))
    const newLinks = linksByTarget(card)
    for (const [key, now] of newLinks) {
      const label = `${quote(card.title)} → ${titleOf(now.targetId)}`
      const was = oldLinks.get(key)
      if (!was) lines.push(`Added link: ${label}`)
      else lines.push(...linkChanges(was, now, label))
    }
    for (const [key, was] of oldLinks) {
      if (!newLinks.has(key))
        lines.push(`Removed link: ${quote(card.title)} → ${titleOf(was.targetId)}`)
    }
  }
  return lines
}

function addressLabel(link: { url: string; label?: string | undefined }): string {
  const url = clip(link.url, ADDRESS_LIMIT)
  return link.label ? `${clip(link.label, TITLE_LIMIT)} (${url})` : url
}

function addressLines(before: Cards, after: Cards): string[] {
  const lines: string[] = []
  for (const [id, card] of after) {
    const oldUrls = new Set((before.get(id)?.links ?? []).map((link) => link.url))
    const newUrls = new Set((card.links ?? []).map((link) => link.url))
    for (const link of card.links ?? []) {
      if (!oldUrls.has(link.url))
        lines.push(`Added a web address to ${quote(card.title)}: ${addressLabel(link)}`)
    }
    for (const link of before.get(id)?.links ?? []) {
      if (!newUrls.has(link.url))
        lines.push(`Removed a web address from ${quote(card.title)}: ${addressLabel(link)}`)
    }
  }
  return lines
}

const CARD_KEYS_HANDLED = [
  'title',
  'text',
  'groupId',
  'links',
  'connections',
  'connectionIds',
  'width',
  'yPosition',
]

function detailLines(before: Cards, after: Cards): string[] {
  const lines: string[] = []
  for (const [id, now] of after) {
    const was = before.get(id)
    const keys = was ? changedKeys(was, now, CARD_KEYS_HANDLED) : []
    if (keys.length > 0)
      lines.push(`Changed other details of ${quote(now.title)} (${otherDetails(keys)})`)
  }
  return lines
}

function mapLines(before: ToCDocument, after: ToCDocument): string[] {
  const lines: string[] = []
  if (before.title !== after.title) {
    lines.push(`Renamed the map: ${quote(before.title)} → ${quote(after.title)}`)
  }
  const ignore = ['title', 'sections', 'textSize', 'curvature', 'columnPadding', 'sectionPadding']
  const keys = changedKeys(before, after, ignore)
  if (keys.length > 0) lines.push(`Changed other settings of the map (${otherDetails(keys)})`)
  // Which cards sit in which column of which section, among the cards both versions have.
  const common = (doc: ToCDocument, other: Cards) =>
    doc.sections.map((section) => [
      section.title,
      section.columns.map((column) => column.nodes.map((n) => n.id).filter((id) => other.has(id))),
    ])
  if (canon(common(before, cardsOf(after))) !== canon(common(after, cardsOf(before)))) {
    lines.push('Rearranged cards or sections')
  }
  return lines
}

export function summarizeChanges(before: ToCDocument, after: ToCDocument): ChangeSummary {
  const was = cardsOf(before)
  const now = cardsOf(after)
  const lines = [
    ...mapLines(before, after),
    ...cardLines(was, now),
    ...groupLines(was, now),
    ...linkLines(was, now),
    ...addressLines(was, now),
    ...detailLines(was, now),
  ]
  let moved = 0
  for (const [id, card] of now) {
    const old = was.get(id)
    if (old && (old.width !== card.width || old.yPosition !== card.yPosition)) moved += 1
  }
  return {
    lines,
    cardsAdded: [...now.keys()].filter((id) => !was.has(id)).length,
    cardsRemoved: [...was.keys()].filter((id) => !now.has(id)).length,
    moved,
    layoutChanged: canon(splitDocument(before).layout) !== canon(splitDocument(after).layout),
  }
}

export function hasChanges(summary: ChangeSummary): boolean {
  return summary.lines.length > 0 || summary.layoutChanged
}

/** A line about positions, for the places that show them after the content changes. */
export function layoutLine(summary: ChangeSummary): string | null {
  if (!summary.layoutChanged) return null
  if (summary.moved === 0) return "Changed the map's spacing or text size"
  return `Moved ${summary.moved} ${summary.moved === 1 ? 'card' : 'cards'} on the map`
}

/** A short headline: the first change, plus how many more there are. */
export function summaryTitle(summary: ChangeSummary): string {
  const [first, ...rest] = summary.lines
  if (first === undefined) return layoutLine(summary) ?? 'No changes'
  if (rest.length === 0) return clip(first, TITLE_MAX)
  const tail = ` and ${rest.length} other ${rest.length === 1 ? 'change' : 'changes'}`
  return `${clip(first, TITLE_MAX - tail.length)}${tail}`
}
