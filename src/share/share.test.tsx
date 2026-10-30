import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { TopBarActions } from '../canvas/TopBarActions'
import { CanvasTopBar } from '../canvas/CanvasTopBar'
import { NodeReadPanel } from '../panels/NodeReadPanel'
import { ConnectionDetails } from '../panels/ConnectionDetails'
import { useShareStore } from './shareStore'
import { parseShareRoute } from './route'
import { ensureShared, makeOwnCopy, openRoute } from './actions'
import { StageBar } from './StageBar'

const EDIT = 'E'.repeat(22)
const VIEW = 'V'.repeat(22)
const DOC: ToCDocument = { color: '#2F2D2E', title: 'Status quo', sections: [] }
const LINKED: ToCDocument = {
  ...DOC,
  sections: [
    {
      title: 'Needs',
      columns: [
        {
          nodes: [
            {
              id: 'a',
              title: 'Belonging',
              text: 'People lack community.',
              color: '#E3F2FD',
              width: 220,
              yPosition: 0,
              connections: [{ targetId: 'b', confidence: 60 }],
            },
            {
              id: 'b',
              title: 'Marketing',
              text: '',
              color: '#E3F2FD',
              width: 220,
              yPosition: 1,
              connections: [],
            },
          ],
        },
      ],
    },
  ],
}

const created = { editToken: EDIT, viewToken: VIEW, revision: 1 }

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState(null, '', '/')
  useShareStore.getState().reset()
  useToCStore.getState().load(DOC)
})

afterEach(() => vi.unstubAllGlobals())

describe('share routes', () => {
  it('reads /d/ as edit and /v/ as view, and nothing else', () => {
    expect(parseShareRoute(`/d/${EDIT}`)).toEqual({ role: 'edit', token: EDIT })
    expect(parseShareRoute(`/v/${VIEW}/`)).toEqual({ role: 'view', token: VIEW })
    expect(parseShareRoute('/d/short')).toBeNull()
    expect(parseShareRoute('/')).toBeNull()
  })

  it('opens a view link read-only: edits and undo are refused', async () => {
    fetchMock.mockImplementation(() => reply(200, { role: 'view', data: DOC, revision: 2 }))
    await openRoute({ role: 'view', token: VIEW })
    expect(useToCStore.getState().isReadOnly).toBe(true)
    expect(useShareStore.getState()).toMatchObject({ role: 'view', editToken: null })
    const before = useToCStore.getState().document
    useToCStore.getState().transform('rename', (d) => ({ ...d, title: 'Defaced' }))
    expect(useToCStore.getState().document).toBe(before)
  })

  it('opens an edit link editable, with its view token for the Share dialog', async () => {
    fetchMock.mockImplementation(() =>
      reply(200, { role: 'edit', data: DOC, revision: 4, viewToken: VIEW }),
    )
    await openRoute({ role: 'edit', token: EDIT })
    expect(useToCStore.getState().isReadOnly).toBe(false)
    expect(useShareStore.getState()).toMatchObject({
      role: 'edit',
      editToken: EDIT,
      viewToken: VIEW,
      revision: 4,
    })
  })

  it('makes an editable copy from a view link and moves this tab to its edit link', async () => {
    useToCStore.getState().load(DOC, { readOnly: true })
    useShareStore.getState().setShared({ role: 'view', revision: 2, storedDocument: DOC })
    fetchMock.mockImplementation(() => reply(201, created))
    await makeOwnCopy()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ data: DOC })
    expect(useToCStore.getState().isReadOnly).toBe(false)
    expect(useShareStore.getState().role).toBe('edit')
    expect(window.location.pathname).toBe(`/d/${EDIT}`)
  })

  it('a second share or copy while one is in flight joins it instead of creating twice', async () => {
    fetchMock.mockImplementation(() => reply(201, created))
    await Promise.all([ensureShared(), ensureShared()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await ensureShared()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('view-only screen', () => {
  beforeEach(() => {
    useToCStore.getState().load(LINKED, { readOnly: true })
    useShareStore.getState().setShared({ role: 'view', revision: 1, storedDocument: LINKED })
  })

  it('shows no editing controls: no Share, no diagram-type select, read-only panels', () => {
    render(
      <>
        <CanvasTopBar
          title="t"
          cardCount={2}
          connectionCount={1}
          droppedCount={0}
          onHome={() => {}}
        />
        <StageBar />
      </>,
    )
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Diagram type' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Make your own copy/ })).toHaveLength(2)
    expect(screen.getByText('View only.')).toBeInTheDocument()

    act(() => useToCStore.getState().select('a'))
    render(<NodeReadPanel />)
    expect(screen.getByRole('complementary', { name: 'Node details' })).toHaveTextContent(
      'People lack community.',
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    act(() => useToCStore.getState().selectConnection({ sourceId: 'a', index: 0 }))
    render(<ConnectionDetails />)
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    expect(screen.getByText('View only')).toBeInTheDocument()
  })
})

describe('Share button and dialog', () => {
  it('stores a local document once on click, then shows both links and moves to the edit link', async () => {
    fetchMock.mockImplementation(() => reply(201, created))
    render(<TopBarActions onHome={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByText(/Creating your links/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Edit link')).toHaveValue(`http://localhost:3000/d/${EDIT}`)
    expect(screen.getByLabelText('View link')).toHaveValue(`http://localhost:3000/v/${VIEW}`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe(`/d/${EDIT}`)
  })

  it('offers Try again when the links cannot be created', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    fetchMock.mockImplementation(() => reply(201, created))
    render(<TopBarActions onHome={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Edit link')).toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the Share button', async () => {
    useShareStore.getState().setShared({ role: 'edit', ...created, storedDocument: DOC })
    render(<TopBarActions onHome={() => {}} />)
    const share = screen.getByRole('button', { name: 'Share' })
    fireEvent.click(share)
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(share).toHaveFocus()
  })
})

describe('stage bar', () => {
  it('shows the conflict bar after a stale save', () => {
    useShareStore.getState().setShared({ role: 'edit', ...created, storedDocument: DOC })
    useShareStore.getState().setStatus('conflict')
    render(<StageBar />)
    expect(screen.getByRole('alert')).toHaveTextContent('Someone saved a newer version.')
  })

  it('Reload replaces the document with the stored one and clears the conflict', async () => {
    useShareStore.getState().setShared({ role: 'edit', ...created, storedDocument: DOC })
    useShareStore.getState().setStatus('conflict')
    const theirs = { ...DOC, title: 'Theirs' }
    fetchMock.mockImplementation(() =>
      reply(200, { role: 'edit', data: theirs, revision: 6, viewToken: VIEW }),
    )
    render(<StageBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(useShareStore.getState().status).toBe('quiet'))
    expect(useToCStore.getState().document.title).toBe('Theirs')
    expect(useShareStore.getState().revision).toBe(6)
  })
})
