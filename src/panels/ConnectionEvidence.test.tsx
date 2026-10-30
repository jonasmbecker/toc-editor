import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { toCompatibleJson } from '../files/export'
import { parseDocument } from '../model/schema'
import { findConnection } from '../state/connections'
import { useToCStore } from '../state/store'
import { makeDocument, makeNode, extensionKeysIn } from '../test/fixtures'
import { ConnectionDetails } from './ConnectionDetails'

const ref = { sourceId: 'a', index: 0 }

function setup(evidence = 'Source one') {
  const doc = makeDocument(
    [makeNode('a', [{ targetId: 'b', assumptions: 'First.\n\nSecond.', evidence }])],
    [makeNode('b')],
  )
  useToCStore.getState().load(doc)
  useToCStore.getState().selectConnection(ref)
}

const connection = () => findConnection(useToCStore.getState().document, ref)!

describe('evidence tags and links', () => {
  beforeEach(() => setup())

  it('numbers the mechanism blocks and tags evidence, flattening into the string', () => {
    render(<ConnectionDetails />)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(connection().evidenceBlocks).toEqual([{ text: 'Source one', supports: [2] }])
    expect(connection().evidence).toBe('Source one\nSupports mechanism 2')
  })

  it('adds a link chip that opens in a new tab with a safe rel', () => {
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('button', { name: '+ Link' }))
    fireEvent.change(screen.getByLabelText('Link address'), {
      target: { value: 'https://www.example.org/paper' },
    })
    fireEvent.change(screen.getByLabelText('Link label'), { target: { value: 'Paper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const anchor = screen.getByRole('link')
    expect(anchor).toHaveAttribute('href', 'https://www.example.org/paper')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(anchor).toHaveTextContent('example.org')
    expect(connection().evidence).toContain('Paper: https://www.example.org/paper')
  })

  it('refuses javascript: and data: urls with the field error and stores nothing', () => {
    render(<ConnectionDetails />)
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi']) {
      fireEvent.click(screen.getByRole('button', { name: '+ Link' }))
      fireEvent.change(screen.getByLabelText('Link address'), { target: { value: bad } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Use a web address starting with https://',
      )
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    }
    expect(connection().evidenceBlocks).toBeUndefined()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('removing a mechanism block renumbers the tags in one undo step', () => {
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    const removeButtons = screen.getAllByRole('button', { name: 'Remove block' })
    fireEvent.click(removeButtons[0]) // first mechanism block gone: old 2 becomes 1
    expect(connection().evidenceBlocks).toEqual([{ text: 'Source one', supports: [1] }])
    useToCStore.getState().undo()
    expect(connection().evidenceBlocks).toEqual([{ text: 'Source one', supports: [2] }])
    expect(connection().assumptions).toBe('First.\n\nSecond.')
  })

  it('keeps the same textarea and its trailing space while typing plain evidence', () => {
    render(<ConnectionDetails />)
    const box = screen.getByLabelText('Evidence block') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Source one ' } })
    expect(screen.getByLabelText('Evidence block')).toBe(box)
    expect(box.value).toBe('Source one ')
  })

  it('"Make this a link" turns a pasted url into one link chip', () => {
    setup('https://example.org/x')
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('button', { name: 'Make this a link' }))
    expect(connection().evidenceBlocks).toEqual([
      { text: '', links: [{ url: 'https://example.org/x' }] },
    ])
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/x')
  })

  it('plain text never auto-links', () => {
    setup('See https://example.org now')
    render(<ConnectionDetails />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('full export keeps blocks and round-trips; compatible export flattens and strips them', () => {
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    const doc = useToCStore.getState().document
    const reparsed = parseDocument(JSON.parse(JSON.stringify(doc)))
    expect(reparsed.ok && reparsed.document).toEqual(doc)
    const compatible = toCompatibleJson(doc)
    expect(extensionKeysIn(compatible)).not.toContain('connection.evidenceBlocks')
    const c = compatible.sections[0].columns[0].nodes[0].connections[0]
    expect(c.evidence).toBe('Source one\nSupports mechanism 1')
    expect(parseDocument(compatible).ok).toBe(true)
  })

  it('view-only shows numbers, static tags and clickable chips', () => {
    const blocks = [{ text: 'E', supports: [1], links: [{ url: 'https://a.org/x' }] }]
    const doc = makeDocument(
      [
        makeNode('a', [
          { targetId: 'b', assumptions: 'First.', evidence: 'E', evidenceBlocks: blocks },
        ]),
      ],
      [makeNode('b')],
    )
    useToCStore.getState().load(doc, { readOnly: true })
    useToCStore.getState().selectConnection(ref)
    render(<ConnectionDetails />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://a.org/x')
    expect(screen.queryByRole('button', { name: '+ Link' })).toBeNull()
  })
})
