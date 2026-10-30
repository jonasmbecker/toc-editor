import { describe, expect, it } from 'vitest'
import { findStraightSnap, sharesColumn, type SnapAnchor } from './straightSnap'

const anchor = (centerY: number, left = 400, right = 600): SnapAnchor => ({ centerY, left, right })

describe('findStraightSnap', () => {
  it('snaps the card so its centre meets the connected card centre', () => {
    const snap = findStraightSnap(100, 100, [anchor(160)], 16)
    expect(snap?.top).toBe(110)
  })

  it('does nothing beyond the threshold', () => {
    expect(findStraightSnap(0, 100, [anchor(120)], 16)).toBeNull()
  })

  it('picks the nearest of several connections', () => {
    const snap = findStraightSnap(100, 100, [anchor(140), anchor(158), anchor(170)], 20)
    expect(snap?.anchor.centerY).toBe(158)
  })

  it('has nothing to snap to without connections', () => {
    expect(findStraightSnap(0, 100, [], 16)).toBeNull()
  })
})

describe('sharesColumn', () => {
  it('is true for overlapping x extents and false for a neighbouring column', () => {
    expect(sharesColumn(anchor(0, 100, 300), 120, 320)).toBe(true)
    expect(sharesColumn(anchor(0, 400, 600), 100, 300)).toBe(false)
  })
})
