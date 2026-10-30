import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'
import type { Kv, KvWriteCondition } from './lib/kv'
import { handleDiagrams } from './lib/diagramsApi'
import { failure } from './lib/http'

function writeOptions(condition: KvWriteCondition | undefined) {
  if (condition?.ifMatch !== undefined) return { onlyIfMatch: condition.ifMatch }
  if (condition?.ifNew) return { onlyIfNew: true }
  return {}
}

/** Netlify Blobs behind the `Kv` interface. Strong consistency, so a reload straight after a
 * save reads that save, and a revision check never compares against a stale copy. */
function blobsKv(): Kv {
  const store = getStore({ name: 'diagrams', consistency: 'strong' })
  return {
    async get<T>(key: string) {
      const entry = await store.getWithMetadata(key, { type: 'json' })
      if (!entry) return null
      // A blank etag would turn the save's compare-and-set into a plain overwrite; refusing
      // here is what keeps that impossible rather than merely unlikely.
      if (!entry.etag) throw new Error('Blobs returned an entry without an etag')
      return { value: entry.data as T, etag: entry.etag }
    },
    async set(key, value, condition) {
      const result = await store.setJSON(key, value, writeOptions(condition))
      return result.modified
    },
  }
}

/** The request URL carries the token, so nothing here logs the URL, the body or the error
 * message; only that a call failed, and the error's class so a storage outage reads
 * differently from a bug. */
export default async function diagrams(request: Request, context: Context) {
  try {
    return await handleDiagrams(request, {
      kv: blobsKv(),
      ip: context.ip,
      now: () => new Date(),
    })
  } catch (error) {
    console.error(
      `diagrams: ${request.method} failed (${error instanceof Error ? error.name : typeof error})`,
    )
    return failure(500, 'Something went wrong, try again')
  }
}

export const config: Config = {
  path: ['/api/diagrams', '/api/diagrams/*'],
}
