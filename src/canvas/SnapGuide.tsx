import { ViewportPortal } from '@xyflow/react'
import { CANVAS_COLORS } from './config'

/** The thin horizontal line shown while a dragged card is snapped level with a connected one,
 * in flow coordinates so it pans and zooms with the cards. */
export interface SnapGuideLine {
  y: number
  left: number
  right: number
}

export function SnapGuide({ guide }: { guide: SnapGuideLine | null }) {
  if (!guide) return null
  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="toc-snap-guide"
        style={{
          position: 'absolute',
          transform: `translate(${guide.left}px, ${guide.y}px)`,
          width: guide.right - guide.left,
          height: 0,
          borderTop: `1.5px solid ${CANVAS_COLORS.select}`,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    </ViewportPortal>
  )
}
