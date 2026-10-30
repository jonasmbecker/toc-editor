import { describe, expect, it } from 'vitest'
import { joinBlocks, splitBlocks } from './blocks'

describe('blocks', () => {
  it('splits on blank lines and drops empty paragraphs', () => {
    expect(splitBlocks('a\n\nb\n \n\nc')).toEqual(['a', 'b', 'c'])
    expect(splitBlocks('')).toEqual([])
    expect(splitBlocks(undefined)).toEqual([])
  })

  it('round-trips a ToCB-style string unchanged', () => {
    const text = 'Marketing drives consumption.\n\nConsumption funds more marketing.'
    expect(joinBlocks(splitBlocks(text))).toBe(text)
  })

  it('joins with a blank line and skips empty blocks', () => {
    expect(joinBlocks(['a', '', '  ', 'b'])).toBe('a\n\nb')
  })
})
