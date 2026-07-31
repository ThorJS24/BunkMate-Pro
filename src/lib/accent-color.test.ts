import { describe, it, expect } from 'vitest'
import { isValidHexColor, pickForegroundForHex } from './accent-color'

describe('isValidHexColor', () => {
  it('accepts a 6-digit hex color', () => {
    expect(isValidHexColor('#2a78d6')).toBe(true)
    expect(isValidHexColor('#FFFFFF')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidHexColor('2a78d6')).toBe(false) // missing #
    expect(isValidHexColor('#fff')).toBe(false) // 3-digit shorthand not supported
    expect(isValidHexColor('#gggggg')).toBe(false) // not hex digits
    expect(isValidHexColor('red')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })
})

describe('pickForegroundForHex', () => {
  it('picks a dark foreground for a light background', () => {
    expect(pickForegroundForHex('#ffffff')).toBe('#1a1a1a')
    expect(pickForegroundForHex('#f0e68c')).toBe('#1a1a1a') // khaki, light
  })

  it('picks a light foreground for a dark background', () => {
    expect(pickForegroundForHex('#000000')).toBe('#fafafa')
    expect(pickForegroundForHex('#1a1a2e')).toBe('#fafafa') // dark navy
  })

  it('picks a light foreground for a saturated mid-tone blue (common accent pick)', () => {
    expect(pickForegroundForHex('#2a78d6')).toBe('#fafafa')
  })
})
