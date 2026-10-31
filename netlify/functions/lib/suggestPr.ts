import { layoutLine, type ChangeSummary } from '../../../src/files/changeSummary'

/**
 * The words of a suggestion's pull request. Everything a stranger typed (their name, their
 * reason, card titles inside the change list) is made safe before it reaches GitHub:
 * `@name` would notify a real account, `#12` would cross-link another thread, and `[x](url)` or
 * `<img>` would dress up a link or an image as part of our text.
 */

export const EDITOR_URL = 'https://toceditor.netlify.app'
export const previewUrl = (number: number) => `${EDITOR_URL}/?suggestion=${number}`

/** More lines than this in the body are summarised; the diff itself still shows everything. */
const MAX_LISTED = 40
const SLUG_LIMIT = 40
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

/** Breaks mentions and issue references with an invisible space, so GitHub no longer links
 * (or notifies) them while the text reads the same. */
export function defuse(text: string): string {
  return text.replace(/@/g, `@${ZERO_WIDTH_SPACE}`).replace(/#(?=\d)/g, `#${ZERO_WIDTH_SPACE}`)
}

/** `defuse`, plus a backslash before the characters that make links, code and HTML. Underscores
 * and asterisks are left alone: they are common in web addresses and only change styling. */
export function escapeMarkdown(text: string): string {
  return defuse(text.replace(/[\\`[\]<>]/g, '\\$&'))
}

/** A branch-name fragment from the change headline: ASCII words joined by hyphens. */
export function branchSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_LIMIT)
    .replace(/-+$/, '')
  return slug || 'change'
}

export interface SuggestionText {
  name: string
  reason: string
  summary: ChangeSummary
}

function changeList(summary: ChangeSummary): string[] {
  const shown = summary.lines.slice(0, MAX_LISTED).map((line) => `- ${escapeMarkdown(line)}`)
  const hidden = summary.lines.length - shown.length
  if (hidden > 0) shown.push(`- …and ${hidden} more (see the Files tab)`)
  const layout = layoutLine(summary)
  if (layout) shown.push(`- ${layout} (positions only, in \`map/layout.json\`)`)
  return shown
}

/** The pull request body, in the shape of the repo's pull request template. `number` is null at
 * creation; the follow-up edit passes the real one so the body can link to the preview. */
export function pullRequestBody({ name, reason, summary }: SuggestionText, number: number | null) {
  const quoted = reason
    .split('\n')
    .map((line) => `> ${escapeMarkdown(line)}`.trimEnd())
    .join('\n')
  const parts = [
    '## What this suggestion changes',
    changeList(summary).join('\n'),
    '## Why',
    quoted,
    `Suggested by **${escapeMarkdown(name)}** through the map editor, without a GitHub account. ` +
      'The name is what they typed and has not been checked.',
  ]
  if (number !== null) parts.push(`**See the proposed map:** ${previewUrl(number)}`)
  parts.push(
    '## Checklist (see CONTRIBUTING.md)',
    [
      '- [ ] Descriptions are written for someone new to the topic',
      '- [ ] No card text talks about other cards, links or "the map"',
      '- [ ] Ideas from a thinker carry an attribution in brackets, e.g. (Brown)',
      '- [ ] At most one trusted web link per card, and I opened it',
      '- [ ] Nothing is marked as written or edited by AI',
      '- [ ] `content.json` changed for changes to the theory; `layout.json` only for positions',
    ].join('\n'),
    '_Opened automatically from the map editor. The `suggestion` label marks every pull request like this one._',
  )
  return parts.join('\n\n')
}

export function commitMessage(title: string, name: string): string {
  return `${defuse(title)}\n\nSuggested through the map editor by ${defuse(name)}.`
}
