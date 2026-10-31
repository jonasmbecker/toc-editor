// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMemoryKv } from './kv.memory'
import {
  SUGGESTIONS_PER_DAY,
  SUGGESTIONS_PER_HOUR,
  addressOf,
  releaseSuggestion,
  reserveSuggestion,
} from './suggestLimits'

const IP = '203.0.113.7'
const at = (iso: string) => new Date(iso)

describe('addressOf', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['2001:db8:abcd:12::1', '2001:0db8:abcd:0012::/64'],
    ['2001:db8:abcd:12:ffff:eeee:dddd:cccc', '2001:0db8:abcd:0012::/64'],
    ['2001:DB8:abcd:12::', '2001:0db8:abcd:0012::/64'],
    ['2001:db8::1', '2001:0db8:0000:0000::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    ['::ffff:198.51.100.9', '198.51.100.9'],
    [
      'fe80::1%eth0',
      '0000:0000:0000:0000::/64'.replace('0000:0000:0000:0000', 'fe80:0000:0000:0000'),
    ],
  ])('%s -> %s', (ip, expected) => {
    expect(addressOf(ip)).toBe(expected)
  })
})

describe('reserveSuggestion', () => {
  it('lets an address have its hourly allowance and refuses the next', async () => {
    const kv = createMemoryKv()
    const now = at('2026-10-31T10:15:00Z')
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) {
      expect(await reserveSuggestion(kv, IP, now)).toBe(true)
    }
    expect(await reserveSuggestion(kv, IP, now)).toBe(false)
  })

  it('starts again in the next clock hour, up to the daily allowance', async () => {
    const kv = createMemoryKv()
    let granted = 0
    for (let hour = 0; hour < 8; hour += 1) {
      const now = at(`2026-10-31T${String(hour).padStart(2, '0')}:30:00Z`)
      for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) {
        if (await reserveSuggestion(kv, IP, now)) granted += 1
      }
    }
    expect(granted).toBe(SUGGESTIONS_PER_DAY)
    expect(await reserveSuggestion(kv, IP, at('2026-10-31T20:00:00Z'))).toBe(false)
    expect(await reserveSuggestion(kv, IP, at('2026-11-01T00:05:00Z'))).toBe(true)
  })

  it('counts addresses separately, and one IPv6 /64 as a single address', async () => {
    const kv = createMemoryKv()
    const now = at('2026-10-31T10:00:00Z')
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) await reserveSuggestion(kv, IP, now)
    expect(await reserveSuggestion(kv, '198.51.100.1', now)).toBe(true)
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) {
      expect(await reserveSuggestion(kv, `2001:db8:1:2:${i}::${i + 1}`, now)).toBe(true)
    }
    expect(await reserveSuggestion(kv, '2001:db8:1:2:ffff::9', now)).toBe(false)
  })

  it('never lets an unknown address through', async () => {
    expect(await reserveSuggestion(createMemoryKv(), '', at('2026-10-31T10:00:00Z'))).toBe(false)
  })

  it('lets exactly the allowance through when requests arrive in parallel', async () => {
    const kv = createMemoryKv()
    const now = at('2026-10-31T10:00:00Z')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveSuggestion(kv, IP, now)),
    )
    expect(results.filter(Boolean)).toHaveLength(SUGGESTIONS_PER_HOUR)
  })

  it('stores the address only as a hash', async () => {
    const kv = createMemoryKv()
    await reserveSuggestion(kv, IP, at('2026-10-31T10:00:00Z'))
    expect(kv.keys().join()).not.toContain(IP)
  })
})

describe('releaseSuggestion', () => {
  it('gives a slot back', async () => {
    const kv = createMemoryKv()
    const now = at('2026-10-31T10:00:00Z')
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) await reserveSuggestion(kv, IP, now)
    await releaseSuggestion(kv, IP, now)
    expect(await reserveSuggestion(kv, IP, now)).toBe(true)
    expect(await reserveSuggestion(kv, IP, now)).toBe(false)
  })

  it('does nothing for an address with no record, and never goes below zero', async () => {
    const kv = createMemoryKv()
    const now = at('2026-10-31T10:00:00Z')
    await releaseSuggestion(kv, IP, now)
    await reserveSuggestion(kv, IP, now)
    await releaseSuggestion(kv, IP, now)
    await releaseSuggestion(kv, IP, now)
    for (let i = 0; i < SUGGESTIONS_PER_HOUR; i += 1) {
      expect(await reserveSuggestion(kv, IP, now)).toBe(true)
    }
    expect(await reserveSuggestion(kv, IP, now)).toBe(false)
  })

  it('swallows a store failure', async () => {
    const kv = { get: async () => Promise.reject(new Error('down')), set: async () => false }
    await expect(releaseSuggestion(kv, IP, at('2026-10-31T10:00:00Z'))).resolves.toBeUndefined()
  })
})
