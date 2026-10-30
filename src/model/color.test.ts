import { describe, expect, it } from 'vitest'
import { isValidHexColor, normalizeHexColor } from './color'

describe('hex colours', () => {
  it('accepts only 6-digit hex with a leading hash', () => {
    expect(isValidHexColor('#E3F2FD')).toBe(true)
    expect(isValidHexColor('#e3f2fd')).toBe(true)
    expect(isValidHexColor('E3F2FD')).toBe(false)
    expect(isValidHexColor('#FFF')).toBe(false)
    expect(isValidHexColor('#E3F2FD00')).toBe(false)
    expect(isValidHexColor('url(https://example.com/pixel.png)')).toBe(false)
  })

  it('normalises to uppercase and trims surrounding whitespace', () => {
    expect(normalizeHexColor('#e3f2fd')).toBe('#E3F2FD')
    expect(normalizeHexColor('  #E3F2FD ')).toBe('#E3F2FD')
  })

  it('returns null for anything else', () => {
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('')).toBeNull()
  })
})
