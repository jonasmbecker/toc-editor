import { describe, expect, it } from 'vitest'
import {
  dropMechanism,
  flattenEvidence,
  linkHostname,
  moveMechanism,
  parseLinkUrl,
  splitEvidence,
  storedBlocks,
} from './evidence'
import { parseDocument } from './schema'
import { makeDocument, makeNode } from '../test/fixtures'

describe('splitEvidence', () => {
  it('splits a plain string on blank lines into untagged blocks', () => {
    expect(splitEvidence({ evidence: 'a\n\nb' })).toEqual([{ text: 'a' }, { text: 'b' }])
    expect(splitEvidence({})).toEqual([])
  })
  it('prefers evidenceBlocks when present', () => {
    const evidenceBlocks = [{ text: 'x', supports: [1] }]
    expect(splitEvidence({ evidence: 'ignored', evidenceBlocks })).toEqual(evidenceBlocks)
  })
})

describe('flattenEvidence', () => {
  it('writes text, supports line and link lines, blocks separated by a blank line', () => {
    const out = flattenEvidence([
      { text: 'A', supports: [2, 1], links: [{ url: 'https://x.org/p', label: 'Paper' }] },
      { text: 'B', links: [{ url: 'https://y.org' }] },
    ])
    expect(out).toBe('A\nSupports mechanism 1, 2\nPaper: https://x.org/p\n\nB\nhttps://y.org')
  })
  it('round-trips plain blocks to the original string', () => {
    expect(flattenEvidence(splitEvidence({ evidence: 'a\n\nb' }))).toBe('a\n\nb')
  })
})

describe('storedBlocks', () => {
  it('is undefined for plain blocks and keeps tagged ones', () => {
    expect(storedBlocks([{ text: 'a' }])).toBeUndefined()
    expect(storedBlocks([{ text: 'a', supports: [1] }, { text: '' }])).toEqual([
      { text: 'a', supports: [1] },
    ])
  })
})

describe('renumbering', () => {
  const blocks = [{ text: 'a', supports: [1, 2, 3] }, { text: 'b', supports: [2] }, { text: 'c' }]
  it('drops references to a removed mechanism and shifts the rest', () => {
    expect(dropMechanism(blocks, 2)).toEqual([
      { text: 'a', supports: [1, 2] },
      { text: 'b' },
      { text: 'c' },
    ])
  })
  it('follows a moved mechanism', () => {
    expect(moveMechanism([{ text: 'x', supports: [1] }], 1, 3)[0].supports).toEqual([3])
    expect(moveMechanism([{ text: 'x', supports: [3] }], 3, 1)[0].supports).toEqual([1])
    expect(moveMechanism([{ text: 'x', supports: [1] }], 3, 1)[0].supports).toEqual([2])
    expect(moveMechanism([{ text: 'x', supports: [2] }], 1, 3)[0].supports).toEqual([1])
  })
})

describe('links', () => {
  it('accepts only http(s) urls', () => {
    expect(parseLinkUrl(' https://a.org/x ')).toEqual({ ok: true, url: 'https://a.org/x' })
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///c', '/rel', 'a.org'])
      expect(parseLinkUrl(bad).ok).toBe(false)
  })
  it('shows the host without www', () => {
    expect(linkHostname('https://www.example.org/a')).toBe('example.org')
    expect(linkHostname('nope')).toBe('')
  })
})

describe('schema', () => {
  const withLink = (url: string) =>
    makeDocument([
      makeNode('a', [
        { targetId: 'b', evidenceBlocks: [{ text: 't', supports: [1], links: [{ url }] }] },
      ]),
      makeNode('b'),
    ])
  it('accepts https links and refuses javascript: urls on import', () => {
    expect(parseDocument(withLink('https://a.org')).ok).toBe(true)
    expect(parseDocument(withLink('javascript:alert(1)')).ok).toBe(false)
  })
})
