import { CARD_ANCHOR_Y } from './anchors'

/** Screen pixels within which a dragged card snaps level with a connected card. */
export const SNAP_DISTANCE_PX = 16

/** A card the dragged one is connected to, in flow coordinates: the height its connection
 * attaches at (`centerY`, now the fixed anchor line, not the centre) and its x extent. */
export interface SnapAnchor {
  centerY: number
  left: number
  right: number
}

export interface StraightSnap {
  /** The dragged card's top that makes the connection straight. */
  top: number
  /** The connected card the snap levels with. */
  anchor: SnapAnchor
}

/** The nearest anchor within `threshold` of the dragged card's own anchor line, as the top
 * the card must take to sit level with it; null when none is close enough. */
export function findStraightSnap(
  top: number,
  anchors: SnapAnchor[],
  threshold: number,
  anchorY: number = CARD_ANCHOR_Y,
): StraightSnap | null {
  const lineY = top + anchorY
  let best: SnapAnchor | null = null
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.centerY - lineY)
    if (distance > threshold) continue
    if (!best || distance < Math.abs(best.centerY - lineY)) best = anchor
  }
  return best ? { top: best.centerY - anchorY, anchor: best } : null
}

/** True when two horizontal extents overlap: cards in the same column, which never run level. */
export function sharesColumn(a: SnapAnchor, left: number, right: number): boolean {
  return a.left < right && a.right > left
}
