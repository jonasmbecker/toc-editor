import type { Kv } from './kv'
import { sha256Hex } from './tokens'

/** Diagrams one address may create per clock hour, counting "Make your own copy". */
export const CREATES_PER_HOUR = 20
/** Diagrams the whole site stores per clock day, so a pool of addresses cannot fill the
 * store either. Roughly 20x a busy team's real use. */
export const CREATES_PER_DAY_SITE_WIDE = 2000

interface Counter {
  /** The hour (or day) the count belongs to; a different bucket means the count restarts. */
  bucket: string
  count: number
}

const hourOf = (now: Date) => now.toISOString().slice(0, 13)
const dayOf = (now: Date) => now.toISOString().slice(0, 10)

/** One key per address, overwritten in place, so the store never accrues old hour buckets
 * (Netlify Blobs has no expiry). The address is kept as a plain SHA-256: that stops casual
 * reading but not a brute force over IPv4, so it is tidiness, not a privacy guarantee. */
async function addressKey(ip: string): Promise<string> {
  return `ratelimit/ip/${await sha256Hex(ip)}`
}
const SITE_KEY = 'ratelimit/site'

async function countIn(kv: Kv, key: string, bucket: string): Promise<number> {
  const entry = await kv.get<Counter>(key)
  return entry && entry.value.bucket === bucket ? entry.value.count : 0
}

async function bump(kv: Kv, key: string, bucket: string): Promise<void> {
  const count = await countIn(kv, key, bucket)
  await kv.set(key, { bucket, count: count + 1 } satisfies Counter)
}

/** Whether a create from this address may go ahead right now. Read-only, so a refused or
 * malformed request costs nothing. The read-then-write in `recordCreate` is not atomic: a
 * parallel burst can overshoot by a few, fine for a spam brake. */
export async function mayCreate(kv: Kv, ip: string, now: Date): Promise<boolean> {
  if (!ip) return false
  const [perAddress, siteWide] = await Promise.all([
    countIn(kv, await addressKey(ip), hourOf(now)),
    countIn(kv, SITE_KEY, dayOf(now)),
  ])
  return perAddress < CREATES_PER_HOUR && siteWide < CREATES_PER_DAY_SITE_WIDE
}

/** Counts a create that was accepted and stored. */
export async function recordCreate(kv: Kv, ip: string, now: Date): Promise<void> {
  await Promise.all([bump(kv, await addressKey(ip), hourOf(now)), bump(kv, SITE_KEY, dayOf(now))])
}
