/** How far the loop swings out to the left of the source and below it before turning up. */
const LOOP_OUT_X = 56
const LOOP_OUT_Y = 60
/** How far right of the target the curve approaches from, so it enters the right edge cleanly. */
const LOOP_IN_X = 72
const LOOP_IN_Y = 20
const LABEL_DX = -24
const LABEL_DY = 52

export interface LoopGeometry {
  path: string
  labelX: number
  labelY: number
}

/** Leaves the source's left edge heading down-left, swings through the gap between the
 * columns, and enters the target's right edge from the right. Pure, so the shape is testable
 * without React Flow. */
export function loopGeometry(sx: number, sy: number, tx: number, ty: number): LoopGeometry {
  const c1 = `${sx - LOOP_OUT_X},${sy + LOOP_OUT_Y}`
  const c2 = `${tx + LOOP_IN_X},${ty - LOOP_IN_Y}`
  return {
    path: `M${sx},${sy} C${c1} ${c2} ${tx},${ty}`,
    labelX: sx + LABEL_DX,
    labelY: sy + LABEL_DY,
  }
}
