import { describe, expect, it } from 'vitest'
import {
  BACKWARD_DASH,
  bandForConfidence,
  CANVAS_COLORS,
  confidenceSentence,
  darken,
  edgeAppearance,
} from './config'

describe('bandForConfidence', () => {
  it.each([
    [undefined, 'unrated'],
    [0, 'low'],
    [39, 'low'],
    [40, 'medium'],
    [69, 'medium'],
    [70, 'high'],
    [100, 'high'],
  ] as const)('%s -> %s', (confidence, expected) => {
    expect(bandForConfidence(confidence)).toBe(expected)
  })
})

describe('edgeAppearance', () => {
  it('draws a both-ways connection in the accent colour with two heads and the band dash', () => {
    const low = edgeAppearance({ isFeedbackLoop: true, confidence: 10 })
    expect(low.stroke).toBe(CANVAS_COLORS.accent)
    expect(low.showArrow).toBe(true)
    expect(low.bothWays).toBe(true)
    expect(edgeAppearance({ confidence: 10 }).bothWays).toBe(false)
    expect(low.dashArray).toBe('2 5')
    // Loops are long-dashed so the forward flow reads first; a confidence dash still wins.
    expect(edgeAppearance({ isFeedbackLoop: true }).dashArray).toBe(BACKWARD_DASH)
    expect(edgeAppearance({ isFeedbackLoop: true, confidence: 90 }).dashArray).toBe(BACKWARD_DASH)
    const back = edgeAppearance({ backward: true })
    expect([back.stroke, back.dashArray, back.bothWays]).toEqual([CANVAS_COLORS.backward, BACKWARD_DASH, false])
  })

  it('confidence sentences name the band and the value; unrated has its own line', () => {
    expect(confidenceSentence(20)).toBe(
      'Low confidence (20%). This connection has limited evidence and significant uncertainty.',
    )
    expect(confidenceSentence(55)).toMatch(/^Medium confidence \(55%\)/)
    expect(confidenceSentence(85)).toMatch(/^High confidence \(85%\)/)
    expect(confidenceSentence(undefined)).toMatch(/^Not rated yet/)
  })

  it("an ordinary connection's dash pattern follows its confidence band", () => {
    expect(edgeAppearance({ confidence: 80 }).dashArray).toBeUndefined()
    expect(edgeAppearance({ confidence: 50 }).dashArray).toBe('7 5')
    expect(edgeAppearance({ confidence: 10 }).dashArray).toBe('2 5')
    expect(edgeAppearance({}).showArrow).toBe(true)
  })
})

describe('darken', () => {
  it('halves each channel at the default factor', () => {
    expect(darken('#886644')).toBe('rgb(75, 56, 37)')
  })

  it('falls back to the secondary colour for anything that is not 6-digit hex', () => {
    expect(darken('red')).toBe(CANVAS_COLORS.secondary)
    expect(darken('#abc')).toBe(CANVAS_COLORS.secondary)
    expect(darken('rgb(1,2,3)')).toBe(CANVAS_COLORS.secondary)
  })
})
