import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Home } from './Home'
import type { Draft } from '../files/draft'
import { blankTheoryOfChange, statusQuoMetacrisis } from '../templates'
import { serializeMapFile, splitDocument } from '../files/split'

function renderHome(draft: Draft | null = null) {
  const onOpen = vi.fn()
  const onRestoreDraft = vi.fn()
  const onDiscardDraft = vi.fn()
  render(
    <Home
      draft={draft}
      onOpen={onOpen}
      onRestoreDraft={onRestoreDraft}
      onDiscardDraft={onDiscardDraft}
    />,
  )
  return { onOpen, onRestoreDraft, onDiscardDraft }
}

describe('Home', () => {
  it('offers the status-quo map, two blank templates and open-file', () => {
    renderHome()
    expect(screen.getByRole('button', { name: /Metacrisis status-quo map/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Blank theory of change/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Blank status-quo map/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open a JSON file' })).toBeInTheDocument()
    expect(screen.queryByText(/Unsaved local draft/)).not.toBeInTheDocument()
  })

  it('opens a template as a fresh document', () => {
    const { onOpen } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: /Blank theory of change/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0].sections.map((s: { title: string }) => s.title)).toEqual([
      'Inputs',
      'Outputs',
      'Outcomes',
      'Goal',
      'Impact',
    ])
  })

  it('shows the local draft with restore and discard', () => {
    const draft: Draft = { savedAt: '2026-10-29T12:00:00.000Z', document: blankTheoryOfChange() }
    const { onRestoreDraft, onDiscardDraft } = renderHome(draft)
    expect(screen.getByText(/Unsaved local draft: Untitled theory of change/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onRestoreDraft).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscardDraft).toHaveBeenCalledTimes(1)
  })

  it('lists import problems in words and loads nothing', async () => {
    const { onOpen } = renderHome()
    const bad = new File([JSON.stringify({ color: '#000000', sections: [] })], 'bad.json', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('Open a JSON file'), { target: { files: [bad] } })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('bad.json could not be opened')
    expect(alert).toHaveTextContent('At title: is missing')
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('opens a dropped valid file', async () => {
    const { onOpen } = renderHome()
    const good = new File([JSON.stringify(blankTheoryOfChange())], 'good.json')
    fireEvent.drop(screen.getByRole('region', { name: 'Open a file' }), {
      dataTransfer: { files: [good] },
    })
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    expect(onOpen.mock.calls[0][0].title).toBe('Untitled theory of change')
  })
})

describe('Home: the featured map', () => {
  it('fetches the theory repo ahead, so a click opens the repo version from the cache', async () => {
    const edited = { ...splitDocument(statusQuoMetacrisis()).content, title: 'Edited on GitHub' }
    const { layout } = splitDocument(statusQuoMetacrisis())
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        new Response(serializeMapFile(url.endsWith('content.json') ? edited : layout)),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { onOpen } = renderHome()
    await waitFor(() => expect(sessionStorage.length).toBe(1))
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('button', { name: /Metacrisis status-quo map/ }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    expect(onOpen.mock.calls[0][0].title).toBe('Edited on GitHub')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('opens the bundled map, with no message, when GitHub cannot be reached', async () => {
    const { onOpen } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: /Metacrisis status-quo map/ }))
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    expect(serializeMapFile(onOpen.mock.calls[0][0])).toBe(serializeMapFile(statusQuoMetacrisis()))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never calls GitHub for a blank template', () => {
    const { onOpen } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: /Blank status-quo map/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
