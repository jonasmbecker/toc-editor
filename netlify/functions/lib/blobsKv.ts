import { getStore } from '@netlify/blobs'
import type { Kv, KvWriteCondition } from './kv'

function writeOptions(condition: KvWriteCondition | undefined) {
  if (condition?.ifMatch !== undefined) return { onlyIfMatch: condition.ifMatch }
  if (condition?.ifNew) return { onlyIfNew: true }
  return {}
}

/** A named Netlify Blobs store behind the `Kv` interface, with strong consistency so a
 * compare-and-set never races against a stale copy. The store is opened on first use, so a
 * request that never touches it (suggestions not switched on) never needs Blobs at all. */
export function blobsKv(name: string): Kv {
  let store: ReturnType<typeof getStore> | undefined
  const open = () => (store ??= getStore({ name, consistency: 'strong' }))
  return {
    async get<T>(key: string) {
      const entry = await open().getWithMetadata(key, { type: 'json' })
      if (!entry) return null
      // A blank etag would turn a compare-and-set into a plain overwrite.
      if (!entry.etag) throw new Error('Blobs returned an entry without an etag')
      return { value: entry.data as T, etag: entry.etag }
    },
    async set(key, value, condition) {
      const result = await open().setJSON(key, value, writeOptions(condition))
      return result.modified
    },
  }
}
