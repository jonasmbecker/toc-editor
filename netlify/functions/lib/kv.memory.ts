import type { Kv } from './kv'

/** In-memory store with the same conditional-write semantics as the Blobs adapter, for tests.
 * Values are copied through JSON both ways, as a real store would, so a test cannot pass by
 * sharing a reference. `etagOverride` lets a test hand back a given etag to probe the API's
 * handling of it. */
export function createMemoryKv(): Kv & { keys: () => string[]; etagOverride?: string } {
  const entries = new Map<string, { json: string; etag: string }>()
  let writes = 0
  const kv = {
    etagOverride: undefined as string | undefined,
    async get<T>(key: string) {
      const entry = entries.get(key)
      if (!entry) return null
      return { value: JSON.parse(entry.json) as T, etag: kv.etagOverride ?? entry.etag }
    },
    async set(key: string, value: unknown, condition?: { ifMatch?: string; ifNew?: boolean }) {
      const current = entries.get(key)
      if (condition?.ifNew && current) return false
      if (condition?.ifMatch !== undefined && current?.etag !== condition.ifMatch) return false
      writes += 1
      entries.set(key, { json: JSON.stringify(value), etag: `"${writes}"` })
      return true
    },
    keys: () => [...entries.keys()],
  }
  return kv
}
