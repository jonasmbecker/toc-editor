import { describe, expect, it } from 'vitest'
import { CARD_ANCHOR_Y } from './anchors'
import { findStraightSnap, sharesColumn, type SnapAnchor } from './straightSnap'

const anchor = (centerY: number, left = 400, right = 600): SnapAnchor => ({ centerY, left, right })

describe('findStraightSnap', () => {
  it('snaps the card so its anchor line meets the connected card anchor line', () => {
    const snap = findStraightSnap(130, [anchor(160)], 16, 22)
    expect(snap?.top).toBe(138)
  })

  it('defaults to the card anchor offset, whatever the card height', () => {
    expect(findStraightSnap(100, [anchor(160)], 40)?.top).toBe(160 - CARD_ANCHOR_Y)
  })

  it('does nothing beyond the threshold', () => {
    expect(findStraightSnap(0, [anchor(120)], 16)).toBeNull()
  })

  it('picks the nearest of several connections', () => {
    const snap = findStraightSnap(100, [anchor(140), anchor(158), anchor(170)], 40, 22)
    expect(snap?.anchor.centerY).toBe(140)
  })

  it('has nothing to snap to without connections', () => {
    expect(findStraightSnap(0, [], 16)).toBeNull()
  })
})

describe('sharesColumn', () => {
  it('is true for overlapping x extents and false for a neighbouring column', () => {
    expect(sharesColumn(anchor(0, 100, 300), 120, 320)).toBe(true)
    expect(sharesColumn(anchor(0, 400, 600), 100, 300)).toBe(false)
  })
})
