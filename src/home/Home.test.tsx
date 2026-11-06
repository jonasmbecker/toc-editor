import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Home } from './Home'
import type { Draft } from '../files/draft'
import { blankTheoryOfChange } from '../templates'
import { useTheoryStore } from '../repo/theoryStore'
import { BUNDLED_INDEX } from '../repo/theoryIndex'

function renderHome(draft: Draft | null = null) {
  const onOpen = vi.fn()
  const onOpenTheory = vi.fn()
  const onRestoreDraft = vi.fn()
  const onDiscardDraft = vi.fn()
  render(
    <Home
      draft={draft}
      onOpen={onOpen}
      onOpenTheory={onOpenTheory}
      onRestoreDraft={onRestoreDraft}
      onDiscardDraft={onDiscardDraft}
    />,
  )
  return { onOpen, onOpenTheory, onRestoreDraft, onDiscardDraft }
}

describe('Home', () => {
  it('offers the theories, two blank templates and open-file', () => {
    renderHome()
    expect(screen.getByRole('button', { name: /Jonas Becker's theory/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Metacrisis status-quo map/ })).toBeNull()
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

describe('Home: the theories', () => {
  it('lists every theory in the index with its status, and opens one by its slug', () => {
    useTheoryStore.getState().setIndex(
      {
        default: 'jonas',
        theories: [
          ...BUNDLED_INDEX.theories,
          {
            slug: 'schmachtenberger',
            title: 'Daniel Schmachtenberger (reconstructed)',
            status: 'reconstructed',
            layout: 'free',
            statusNote: 'Not endorsed by him.',
          },
        ],
      },
      false,
    )
    const { onOpenTheory, onOpen } = renderHome()
    const card = screen.getByRole('button', { name: /Daniel Schmachtenberger/ })
    expect(card).toHaveTextContent('Reconstructed · not endorsed')
    expect(card).toHaveTextContent('Not endorsed by him.')
    expect(screen.getByRole('button', { name: /Jonas Becker's theory/ })).toHaveTextContent(
      "Author's own",
    )
    fireEvent.click(card)
    expect(onOpenTheory).toHaveBeenCalledWith('schmachtenberger')
    expect(onOpen).not.toHaveBeenCalled()
    useTheoryStore.getState().setIndex(BUNDLED_INDEX, false)
  })

  it('never calls GitHub for a blank template', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { onOpen } = renderHome()
    fireEvent.click(screen.getByRole('button', { name: /Blank status-quo map/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
