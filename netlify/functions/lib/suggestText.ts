/**
 * The two free-text fields of a suggestion, a name and a reason. They come from strangers and
 * end up in a pull request that real people read, so each is length-capped, stripped of HTML and
 * of invisible or direction-changing characters, and tidied. (The pull request text then escapes
 * what is left for markdown: see `suggestPr.ts`.)
 */

export const NAME_MAX = 80
export const REASON_MAX = 1000

export type Cleaned = { ok: true; text: string } | { ok: false; error: string }

/** Control characters other than the line break, the zero-width and direction-changing
 * characters (which can disguise text), and the byte-order mark. Built from character codes so
 * the source holds no invisible characters. */
function isHidden(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x0a && code !== 0x09) ||
    code === 0x7f ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  )
}

/** Removes tags, comments and doctype lines until none are left, so a tag split across a
 * removal (`<<b>script>`) cannot reappear. A `<` that does not start a tag (`x < y`, `<3`) is
 * ordinary text and stays. */
export function stripHtml(input: string): string {
  let text = input
  let previous: string
  do {
    previous = text
    text = text.replace(/<\/?[a-zA-Z!?][^>]*>/g, '')
  } while (text !== previous)
  return text
}

function tidy(input: string): string {
  const visible = [...input].filter((char) => !isHidden(char.codePointAt(0) ?? 0)).join('')
  return stripHtml(visible).replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
}

/** A single line: line breaks and runs of spaces become one space. */
export function cleanName(input: unknown): Cleaned {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: 'Add your name (a nickname is fine).' }
  }
  if (input.length > NAME_MAX) {
    return { ok: false, error: `Your name is too long (${NAME_MAX} characters at most).` }
  }
  const text = tidy(input).replace(/\s+/g, ' ').trim()
  return text ? { ok: true, text } : { ok: false, error: 'Add your name (a nickname is fine).' }
}

/** Several lines, with at most one blank line in a row. */
export function cleanReason(input: unknown): Cleaned {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, error: 'Add a short reason for the change.' }
  }
  if (input.length > REASON_MAX) {
    return { ok: false, error: `Your reason is too long (${REASON_MAX} characters at most).` }
  }
  const text = tidy(input)
    .split('\n')
    .map((line) => line.replace(/[ ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text ? { ok: true, text } : { ok: false, error: 'Add a short reason for the change.' }
}
