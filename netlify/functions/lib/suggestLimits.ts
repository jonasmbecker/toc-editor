import type { Kv } from './kv'
import { sha256Hex } from './tokens'

/**
 * How often one address may send a suggestion. The count lives in Netlify Blobs (behind `Kv`),
 * one small record per address, overwritten in place so the store never collects old hours.
 *
 * A slot is taken *before* the pull request is opened, with a compare-and-set on the stored
 * etag: a burst of parallel requests from one address cannot all read "2 used" and all go
 * ahead, which a plain read-then-write would allow. A slot is given back when GitHub fails, so
 * an outage does not use up a contributor's allowance. Requests that are refused earlier
 * (bad map, bad words) never take one.
 */

export const SUGGESTIONS_PER_HOUR = 3
export const SUGGESTIONS_PER_DAY = 10
/** Tries at the compare-and-set before giving up. Only parallel requests from one address
 * collide, and a refused one is a fair answer to that. */
const MAX_TRIES = 5

interface Window {
  /** The clock hour (or day) the count belongs to; a different bucket means it starts again. */
  bucket: string
  count: number
}

interface Allowance {
  hour: Window
  day: Window
}

const hourOf = (now: Date) => now.toISOString().slice(0, 13)
const dayOf = (now: Date) => now.toISOString().slice(0, 10)

/** What an address is counted as. IPv4 is itself. An IPv6 user normally holds a whole /64, so
 * counting each address separately would give a spammer billions of allowances; the /64 is
 * the unit instead. (An IPv4-mapped IPv6 address counts as the IPv4 address it wraps.) */
export function addressOf(ip: string): string {
  const address = ip.trim().toLowerCase().split('%')[0]
  if (!address.includes(':')) return address
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address)
  if (mapped) return mapped[1]
  const [head, tail = ''] = address.split('::')
  const headGroups = head ? head.split(':') : []
  let groups = headGroups
  if (address.includes('::')) {
    const tailGroups = tail ? tail.split(':') : []
    const gap = Math.max(0, 8 - headGroups.length - tailGroups.length)
    groups = [...headGroups, ...Array<string>(gap).fill('0'), ...tailGroups]
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`
}

async function keyFor(ip: string): Promise<string> {
  return `suggest/ip/${await sha256Hex(addressOf(ip))}`
}

function current(stored: Allowance | undefined, now: Date): Allowance {
  const hour = hourOf(now)
  const day = dayOf(now)
  return {
    hour: stored?.hour.bucket === hour ? stored.hour : { bucket: hour, count: 0 },
    day: stored?.day.bucket === day ? stored.day : { bucket: day, count: 0 },
  }
}

function shifted(allowance: Allowance, by: 1 | -1): Allowance {
  const move = (window: Window): Window => ({
    bucket: window.bucket,
    count: Math.max(0, window.count + by),
  })
  return { hour: move(allowance.hour), day: move(allowance.day) }
}

/** Takes one of the address's slots; false when the hourly or daily allowance is used up (or
 * the address is unknown, which is never allowed through). */
export async function reserveSuggestion(kv: Kv, ip: string, now: Date): Promise<boolean> {
  if (!ip) return false
  const key = await keyFor(ip)
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const entry = await kv.get<Allowance>(key)
    const allowance = current(entry?.value, now)
    if (allowance.hour.count >= SUGGESTIONS_PER_HOUR) return false
    if (allowance.day.count >= SUGGESTIONS_PER_DAY) return false
    const condition = entry ? { ifMatch: entry.etag } : { ifNew: true }
    if (await kv.set(key, shifted(allowance, 1), condition)) return true
  }
  return false
}

/** Gives a slot back after a failure on our side. Best effort: if the store cannot be reached
 * the slot stays used, which only ever errs towards the stricter side. */
export async function releaseSuggestion(kv: Kv, ip: string, now: Date): Promise<void> {
  try {
    const key = await keyFor(ip)
    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
      const entry = await kv.get<Allowance>(key)
      if (!entry) return
      const condition = { ifMatch: entry.etag }
      if (await kv.set(key, shifted(current(entry.value, now), -1), condition)) return
    }
  } catch {
    // Nothing more to do; see above.
  }
}
