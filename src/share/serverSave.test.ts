import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { AUTOSAVE_DELAY_MS } from '../files/useAutosave'
import { useShareStore } from './shareStore'
import { reloadShared } from './actions'
import { SAVED_HOLD_MS, startServerSave } from './serverSave'

const EDIT = 'E'.repeat(22)
const DOC: ToCDocument = { color: '#2F2D2E', title: 'Map', sections: [] }

function rename(title: string) {
  useToCStore.getState().transform('rename', (d) => ({ ...d, title }))
}

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

let fetchMock: ReturnType<typeof vi.fn>
let stop: () => void

function shareLoaded(revision = 3) {
  useShareStore
    .getState()
    .setShared({ role: 'edit', editToken: EDIT, revision, storedDocument: DOC })
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  useToCStore.getState().load(DOC)
  shareLoaded()
  stop = startServerSave()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function afterDelay(ms = AUTOSAVE_DELAY_MS) {
  await vi.advanceTimersByTimeAsync(ms)
}

const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body)

describe('server autosave', () => {
  it('sends one PUT with the revision after the edits settle, then shows Saved, then quiet', async () => {
    fetchMock.mockImplementation(() => reply(200, { revision: 4 }))
    rename('A')
    rename('AB')
    await afterDelay()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/diagrams/${EDIT}`)
    expect(sentBody()).toEqual({ data: { ...DOC, title: 'AB' }, revision: 3 })
    expect(useShareStore.getState()).toMatchObject({ revision: 4, status: 'saved' })
    await afterDelay(SAVED_HOLD_MS)
    expect(useShareStore.getState().status).toBe('quiet')
  })

  it('stops on a conflict; after Reload the next edit is sent with the new revision', async () => {
    fetchMock.mockImplementationOnce(() => reply(409, { revision: 5 }))
    rename('A')
    await afterDelay()
    expect(useShareStore.getState().status).toBe('conflict')
    rename('AB')
    await afterDelay()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const theirs = { ...DOC, title: 'Theirs' }
    fetchMock.mockImplementationOnce(() =>
      reply(200, { role: 'edit', data: theirs, revision: 5, viewToken: 'V'.repeat(22) }),
    )
    await reloadShared()
    expect(useShareStore.getState().status).toBe('quiet')
    fetchMock.mockImplementationOnce(() => reply(200, { revision: 6 }))
    rename('Mine again')
    await afterDelay()
    expect(sentBody(2)).toEqual({ data: { ...theirs, title: 'Mine again', version: 2 }, revision: 5 })
    expect(useShareStore.getState()).toMatchObject({ revision: 6, status: 'saved' })
  })

  it('retries a failed save with a growing delay that typing does not shorten, then recovers', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
      .mockImplementationOnce(() => reply(503, { error: 'busy' }))
      .mockImplementation(() => reply(200, { revision: 4 }))
    rename('A')
    await afterDelay()
    expect(useShareStore.getState().status).toBe('failed')
    rename('AB')
    await afterDelay(AUTOSAVE_DELAY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await afterDelay(2000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await afterDelay(4000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(useShareStore.getState()).toMatchObject({ revision: 4, status: 'saved' })
  })

  it('does not send a document that was only loaded', async () => {
    useToCStore.getState().load({ ...DOC, title: 'Reloaded' })
    await afterDelay()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends edits typed while the first share was in flight', async () => {
    stop()
    const typedMeanwhile = { ...DOC, title: 'Typed meanwhile' }
    useToCStore.getState().transform('rename', () => typedMeanwhile)
    shareLoaded(1)
    fetchMock.mockImplementation(() => reply(200, { revision: 2 }))
    stop = startServerSave()
    await afterDelay()
    expect(sentBody()).toEqual({ data: typedMeanwhile, revision: 1 })
  })

  it('once stopped, a late response does not write into the share store', async () => {
    let resolve: (value: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)))
    rename('A')
    await afterDelay()
    expect(useShareStore.getState().status).toBe('saving')
    stop()
    useShareStore.getState().reset()
    resolve(new Response(JSON.stringify({ revision: 9 }), { status: 200 }))
    await afterDelay(0)
    expect(useShareStore.getState()).toMatchObject({ revision: 0, status: 'local' })
  })

  it('sends what is still pending when stopped, and with keepalive only under the browser cap', async () => {
    fetchMock.mockImplementation(() => reply(200, { revision: 4 }))
    rename('Small')
    stop()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)

    useToCStore.getState().load(DOC)
    shareLoaded()
    stop = startServerSave()
    rename('x'.repeat(70 * 1024))
    stop()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].keepalive).toBe(false)
  })
})
