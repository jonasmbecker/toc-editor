// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NAME_MAX, REASON_MAX, cleanName, cleanReason, stripHtml } from './suggestText'

const chars = (...codes: number[]) => String.fromCharCode(...codes)
const RTL_OVERRIDE = chars(0x202e)
const ZERO_WIDTH = chars(0x200b)
const BOM = chars(0xfeff)

describe('stripHtml', () => {
  it.each([
    ['<b>Ana</b>', 'Ana'],
    ['<script>alert(1)</script>Real', 'alert(1)Real'],
    ['<img src=x onerror=alert(1)>', ''],
    ['a<!-- hidden -->b', 'ab'],
    ['<<b>script>x', 'x'],
    ['<a href="http://evil.example">click</a>', 'click'],
  ])('%j -> %j', (input, expected) => {
    expect(stripHtml(input)).toBe(expected)
  })

  it('keeps a < that does not start a tag', () => {
    expect(stripHtml('x < y and z > w')).toBe('x < y and z > w')
    expect(stripHtml('I <3 this')).toBe('I <3 this')
  })
})

describe('cleanName', () => {
  it('trims and puts the name on one line', () => {
    expect(cleanName('  Ana \n\t Souza  ')).toEqual({ ok: true, text: 'Ana Souza' })
  })

  it('allows exactly the limit and refuses one more', () => {
    expect(cleanName('a'.repeat(NAME_MAX))).toEqual({ ok: true, text: 'a'.repeat(NAME_MAX) })
    const result = cleanName('a'.repeat(NAME_MAX + 1))
    expect(result).toEqual({ ok: false, error: 'Your name is too long (80 characters at most).' })
  })

  it.each([[undefined], [null], [42], [''], ['   '], ['<b></b>'], [`${ZERO_WIDTH}${BOM}`]])(
    'asks for a name instead of %j',
    (input) => {
      expect(cleanName(input)).toEqual({ ok: false, error: 'Add your name (a nickname is fine).' })
    },
  )

  it('strips HTML and hidden or direction-changing characters', () => {
    expect(cleanName(`<b>${RTL_OVERRIDE}An${ZERO_WIDTH}a</b>`)).toEqual({ ok: true, text: 'Ana' })
  })
})

describe('cleanReason', () => {
  it('keeps line breaks, trims each line and allows one blank line in a row', () => {
    const result = cleanReason('  First.  \r\n  Second. \n\n\n\n Third.  ')
    expect(result).toEqual({ ok: true, text: 'First.\nSecond.\n\nThird.' })
  })

  it('allows exactly the limit and refuses one more', () => {
    expect(cleanReason('r'.repeat(REASON_MAX)).ok).toBe(true)
    expect(cleanReason('r'.repeat(REASON_MAX + 1))).toEqual({
      ok: false,
      error: 'Your reason is too long (1000 characters at most).',
    })
  })

  it.each([[undefined], [7], [''], ['  \n '], ['<p></p>']])(
    'asks for a reason instead of %j',
    (input) => {
      expect(cleanReason(input)).toEqual({ ok: false, error: 'Add a short reason for the change.' })
    },
  )

  it('strips HTML and hidden characters but keeps the words and the lines', () => {
    const result = cleanReason(
      `Seen it.${ZERO_WIDTH}\n<script>x</script>${RTL_OVERRIDE}Twice <i>really</i>.`,
    )
    expect(result).toEqual({ ok: true, text: 'Seen it.\nxTwice really.' })
  })
})
