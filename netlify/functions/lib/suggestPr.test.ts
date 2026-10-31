// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ChangeSummary } from '../../../src/files/changeSummary'
import {
  branchSlug,
  commitMessage,
  defuse,
  escapeMarkdown,
  pullRequestBody,
  previewUrl,
} from './suggestPr'

const ZWSP = String.fromCharCode(0x200b)

const summary = (lines: string[], extra: Partial<ChangeSummary> = {}): ChangeSummary => ({
  lines,
  cardsAdded: 0,
  cardsRemoved: 0,
  moved: 0,
  layoutChanged: false,
  ...extra,
})

describe('defuse and escapeMarkdown', () => {
  it('breaks @mentions and #references so GitHub neither notifies nor cross-links them', () => {
    expect(defuse('@octocat see #12 and org/repo#7')).toBe(
      `@${ZWSP}octocat see #${ZWSP}12 and org/repo#${ZWSP}7`,
    )
    expect(defuse('plain # heading and e-mail text')).toBe('plain # heading and e-mail text')
  })

  it('escapes the characters that make links, code and HTML', () => {
    expect(escapeMarkdown('[a](http://x) `c` <img src=x> \\')).toBe(
      '\\[a\\](http://x) \\`c\\` \\<img src=x\\> \\\\',
    )
  })

  it('leaves web addresses clickable', () => {
    expect(escapeMarkdown('https://example.org/a_b?x=1*2')).toBe('https://example.org/a_b?x=1*2')
  })
})

describe('branchSlug', () => {
  it.each([
    ['Added link: "A" → "B"', 'added-link-a-b'],
    ['  --Hello, World!--  ', 'hello-world'],
    ['→→→', 'change'],
    ['', 'change'],
    ['x'.repeat(100), 'x'.repeat(40)],
    ['word '.repeat(20), 'word-word-word-word-word-word-word-word'],
  ])('%j -> %j', (title, slug) => {
    expect(branchSlug(title)).toBe(slug)
  })

  it('never starts or ends with a hyphen, whatever the cut falls on', () => {
    const slug = branchSlug(`${'a'.repeat(39)} b`)
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe('pullRequestBody', () => {
  const text = { name: 'Ana', reason: 'Because.', summary: summary(['Added card: "X"']) }

  it("has the template's headings, the list, the quoted reason and the contributor", () => {
    const body = pullRequestBody(text, null)
    expect(body.indexOf('## What this suggestion changes')).toBeLessThan(body.indexOf('## Why'))
    expect(body.indexOf('## Why')).toBeLessThan(body.indexOf('## Checklist (see CONTRIBUTING.md)'))
    expect(body).toContain('- Added card: "X"')
    expect(body).toContain('> Because.')
    expect(body).toContain('Suggested by **Ana**')
    expect(body).toContain('has not been checked')
  })

  it('links the preview only once the number is known', () => {
    expect(pullRequestBody(text, null)).not.toContain('suggestion=')
    expect(pullRequestBody(text, 7)).toContain(previewUrl(7))
    expect(previewUrl(7)).toBe('https://toceditor.netlify.app/?suggestion=7')
  })

  it("makes a stranger's words safe: no mentions, links or tags", () => {
    const body = pullRequestBody(
      {
        name: '@boss <b>Ana</b>',
        reason: 'See [this](http://evil.example) @maintainer #1\n\n<img src=x>',
        summary: summary(['Renamed card: "@x" → "[y](http://z)"']),
      },
      null,
    )
    expect(body).not.toMatch(new RegExp(`@(?!${ZWSP})`))
    expect(body).not.toMatch(/#(?=\d)/)
    expect(body).not.toContain('[this](')
    expect(body).not.toMatch(/(?<!\\)<(img|b)/)
    expect(body).toContain('> \\<img src=x\\>')
  })

  it('keeps blank lines of the reason inside the quote', () => {
    const body = pullRequestBody({ ...text, reason: 'One.\n\nTwo.' }, null)
    expect(body).toContain('> One.\n>\n> Two.')
  })

  it('lists at most 40 changes and says how many more there are', () => {
    const many = Array.from({ length: 45 }, (_, i) => `Added card: "C${i}"`)
    const body = pullRequestBody({ ...text, summary: summary(many) }, null)
    expect(body).toContain('- Added card: "C39"')
    expect(body).not.toContain('"C40"')
    expect(body).toContain('- …and 5 more (see the Files tab)')
  })

  it('mentions moved cards after the changes, as positions only', () => {
    const moved = summary(['Added card: "X"'], { layoutChanged: true, moved: 3 })
    expect(pullRequestBody({ ...text, summary: moved }, null)).toContain(
      '- Moved 3 cards on the map (positions only, in `map/layout.json`)',
    )
    const only = summary([], { layoutChanged: true, moved: 1 })
    expect(pullRequestBody({ ...text, summary: only }, null)).toContain('- Moved 1 card on the map')
  })
})

describe('commitMessage', () => {
  it('names the contributor and defuses mentions in both lines', () => {
    expect(commitMessage('Added card: "@x"', '@ana')).toBe(
      `Added card: "@${ZWSP}x"\n\nSuggested through the map editor by @${ZWSP}ana.`,
    )
  })
})
