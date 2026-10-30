/** Screen pixels within which a dragged card snaps level with a connected card. */
export const SNAP_DISTANCE_PX = 16

/** A card the dragged one is connected to, in flow coordinates: its centre height and x extent. */
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

/** The nearest anchor whose centre is within `threshold` of the dragged card's centre, as the top
 * the card must take to sit level with it; null when none is close enough. */
export function findStraightSnap(
  top: number,
  height: number,
  anchors: SnapAnchor[],
  threshold: number,
): StraightSnap | null {
  const centerY = top + height / 2
  let best: SnapAnchor | null = null
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.centerY - centerY)
    if (distance > threshold) continue
    if (!best || distance < Math.abs(best.centerY - centerY)) best = anchor
  }
  return best ? { top: best.centerY - height / 2, anchor: best } : null
}

/** True when two horizontal extents overlap: cards in the same column, which never run level. */
export function sharesColumn(a: SnapAnchor, left: number, right: number): boolean {
  return a.left < right && a.right > left
}
