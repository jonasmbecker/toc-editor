import { Panel, useReactFlow } from '@xyflow/react'
import { alignDocument } from '../layout/align'
import { useToCStore } from '../state/store'

/** Top-right canvas button: straightens connections by moving cards up or down inside their
 * columns. One undo step ("tidy layout"); card heights come from what React Flow measured. */
export function TidyButton() {
  const { getNodes } = useReactFlow()

  function tidy() {
    const heights = new Map<string, number>()
    for (const node of getNodes()) {
      const height = node.measured?.height
      if (height) heights.set(node.id, height)
    }
    useToCStore.getState().transform('tidy layout', (doc) => alignDocument(doc, { heights }))
  }

  return (
    <Panel position="top-right">
      <button
        type="button"
        className="toc-topbar__btn"
        title="Move cards up or down so connections run straight (Ctrl+Z undoes it)"
        onClick={tidy}
      >
        Tidy layout
      </button>
    </Panel>
  )
}
