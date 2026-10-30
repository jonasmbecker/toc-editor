import { useCallback, useState } from 'react'
import type { OnConnect } from '@xyflow/react'
import { useToCStore } from '../state/store'
import { addConnection, type ConnectionRefusal } from '../state/connections'
import { announce } from '../state/notice'

const REFUSAL_NOTICE: Record<ConnectionRefusal, string> = {
  self: 'A node cannot connect to itself',
  duplicate: 'These two are already connected',
  missing: 'One of those nodes is no longer in the diagram',
  'same-group': 'A group and its own cards are already one cluster',
}

/**
 * The handle-to-handle drag. `onConnect` goes through `addConnection`, which refuses a
 * self-loop or a duplicate with a notice instead of a new edge; a successful connection is
 * selected at once so the details panel opens on it. `isConnecting` is true for the length of
 * the drag, so the canvas can show every card's target handle while one is in progress.
 */
export function useConnectFlow() {
  const transform = useToCStore((state) => state.transform)
  const selectConnection = useToCStore((state) => state.selectConnection)
  const [isConnecting, setIsConnecting] = useState(false)

  const onConnect: OnConnect = useCallback(
    ({ source, target }) => {
      const result = addConnection(useToCStore.getState().document, source, target)
      if (!result.ok) return announce(REFUSAL_NOTICE[result.refused])
      // The updater ignores its argument: the ref has to be known before `transform` runs so
      // the new connection can be selected, and nothing else writes in between (synchronous).
      transform('add connection', () => result.document)
      selectConnection(result.ref)
    },
    [transform, selectConnection],
  )

  const onConnectStart = useCallback(() => setIsConnecting(true), [])
  const onConnectEnd = useCallback(() => setIsConnecting(false), [])

  return { isConnecting, onConnect, onConnectStart, onConnectEnd }
}
