import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useConnectFlow } from './useConnectFlow'
import { useToCStore } from '../state/store'
import { findConnection } from '../state/connections'
import { makeDocument, makeNode } from '../test/fixtures'

const connection = { source: 'a', target: 'b', sourceHandle: null, targetHandle: null }

describe('useConnectFlow', () => {
  beforeEach(() => {
    useToCStore.getState().load(makeDocument([makeNode('a')], [makeNode('b')]))
  })

  it('a handle-to-handle drop adds the connection and selects it', () => {
    const { result } = renderHook(() => useConnectFlow())
    act(() => result.current.onConnect(connection))
    const state = useToCStore.getState()
    expect(state.selectedConnection).toEqual({ sourceId: 'a', index: 0 })
    expect(findConnection(state.document, state.selectedConnection)).toMatchObject({
      targetId: 'b',
      confidence: 50,
    })
    expect(state.past).toHaveLength(1)
  })

  it('a self-loop or a duplicate adds nothing and shows a notice', () => {
    const { result } = renderHook(() => useConnectFlow())
    act(() => result.current.onConnect({ ...connection, target: 'a' }))
    expect(useToCStore.getState().notice).toMatch(/itself/)
    act(() => result.current.onConnect(connection))
    act(() => result.current.onConnect(connection))
    expect(useToCStore.getState().notice).toMatch(/already connected/)
    expect(useToCStore.getState().past).toHaveLength(1)
  })

  it('tracks the drag for the duration of the connection', () => {
    const { result } = renderHook(() => useConnectFlow())
    act(() => result.current.onConnectStart())
    expect(result.current.isConnecting).toBe(true)
    act(() => result.current.onConnectEnd())
    expect(result.current.isConnecting).toBe(false)
  })
})
