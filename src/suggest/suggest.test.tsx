import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { statusQuoMetacrisis } from '../templates'
import { useToCStore } from '../state/store'
import { useShareStore } from '../share/shareStore'
import { TopBarActions } from '../canvas/TopBarActions'
import { splitDocument } from '../files/split'
import { useOriginStore } from './originStore'
import { sendSuggestion } from './submit'

const SHA = 'b'.repeat(40)
const PR = 'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12'

function openMap({ readOnly = false } = {}) {
  const base = statusQuoMetacrisis()
  useToCStore.getState().load(base, { readOnly })
  useOriginStore.getState().setOrigin({ sha: SHA, document: base })
}

function editTitle() {
  useToCStore.getState().transform('edit title', (doc) => ({ ...doc, title: 'A new title' }))
}

function reply(status: number, body: unknown) {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
}

async function openDialog() {
  render(<TopBarActions onHome={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  localStorage.clear()
  useShareStore.getState().reset()
  useOriginStore.getState().setOrigin(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('the Suggest a change button', () => {
  it('shows on the editable repo map', () => {
    openMap()
    render(<TopBarActions onHome={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Suggest a change' })).toBeInTheDocument()
  })

  it('is absent without an origin (bundled copy, template, draft)', () => {
    useToCStore.getState().load(statusQuoMetacrisis())
    render(<TopBarActions onHome={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).not.toBeInTheDocument()
  })

  it('is absent in view-only mode', () => {
    openMap({ readOnly: true })
    render(<TopBarActions onHome={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Suggest a change' })).not.toBeInTheDocument()
  })
})

describe('the Suggest a change dialog', () => {
  it('says nothing has changed when nothing has', async () => {
    openMap()
    const dialog = await openDialog()
    expect(dialog).toHaveTextContent('You have not changed anything yet')
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
  })

  it('lists the changes in plain words and needs a name and a reason', async () => {
    openMap()
    editTitle()
    await openDialog()
    expect(screen.getByLabelText('What you changed')).toHaveTextContent(/A new title/)
    const send = screen.getByRole('button', { name: 'Send suggestion' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Why this change/), { target: { value: 'Because' } })
    expect(send).toBeEnabled()
    expect(screen.getByRole('dialog')).toHaveTextContent('will be public on GitHub')
  })

  it('posts the split map, baseSha and an empty honeypot, then shows the link', async () => {
    openMap()
    editTitle()
    const fetchMock = reply(201, { url: PR, number: 12 })
    vi.stubGlobal('fetch', fetchMock)
    await openDialog()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: ' Dana ' } })
    fireEvent.change(screen.getByLabelText(/Why this change/), { target: { value: 'Because' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(await screen.findByText('Your suggestion was sent.')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/.netlify/functions/suggest-change')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ name: 'Dana', reason: 'Because', baseSha: SHA, website: '' })
    expect(body.content).toEqual(
      JSON.parse(JSON.stringify(splitDocument(useToCStore.getState().document).content)),
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', PR)
    expect(localStorage.getItem('toc-editor:suggest-form')).toBeNull()
  })

  it('keeps edits and words after a failed send, and the server sentence is shown', async () => {
    openMap()
    editTitle()
    vi.stubGlobal('fetch', reply(429, { error: 'Too many suggestions from here.' }))
    await openDialog()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } })
    fireEvent.change(screen.getByLabelText(/Why this change/), { target: { value: 'Because' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many suggestions from here.')
    expect(screen.getByLabelText('Your name')).toHaveValue('Dana')
    expect(useToCStore.getState().document.title).toBe('A new title')
    expect(JSON.parse(localStorage.getItem('toc-editor:suggest-form') ?? '{}')).toEqual({
      name: 'Dana',
      reason: 'Because',
    })
  })

  it('restores the words after the dialog is closed and reopened', async () => {
    openMap()
    editTitle()
    await openDialog()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Suggest a change' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
    expect(await screen.findByLabelText('Your name')).toHaveValue('Dana')
  })

  it('keeps Tab inside the dialog', async () => {
    openMap()
    editTitle()
    const dialog = await openDialog()
    const close = screen.getByRole('button', { name: 'Close' })
    close.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
})

describe('after a suggestion went through', () => {
  it('shows its link on reopen instead of sending the same edits twice', async () => {
    openMap()
    editTitle()
    vi.stubGlobal('fetch', reply(201, { url: PR, number: 12 }))
    await openDialog()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Dana' } })
    fireEvent.change(screen.getByLabelText(/Why this change/), { target: { value: 'Because' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
    expect(await screen.findByRole('link')).toHaveAttribute('href', PR)
    expect(screen.queryByRole('button', { name: 'Send suggestion' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    useToCStore.getState().transform('edit again', (doc) => ({ ...doc, title: 'Another title' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
    expect(await screen.findByRole('button', { name: 'Send suggestion' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('')
  })
})

describe('sendSuggestion', () => {
  it('turns a network failure into a friendly sentence', async () => {
    const down = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    const result = await sendSuggestion(
      statusQuoMetacrisis(),
      SHA,
      { name: 'a', reason: 'b' },
      down as unknown as typeof fetch,
    )
    expect(result).toEqual({ ok: false, message: expect.stringContaining('could not be sent') })
  })

  it('does not trust a success answer without a GitHub link', async () => {
    const odd = reply(201, { url: 'javascript:alert(1)' })
    const result = await sendSuggestion(
      statusQuoMetacrisis(),
      SHA,
      { name: 'a', reason: 'b' },
      odd as unknown as typeof fetch,
    )
    expect(result.ok).toBe(false)
  })
})
