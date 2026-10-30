/**
 * The little slice of a key-value store the diagrams API needs. Netlify Blobs implements it in
 * production (`diagrams.ts`); `createMemoryKv` (in `kv.memory.ts`) implements it for the
 * tests. Keeping the API on this interface is what lets every rule (roles, revisions, limits)
 * be tested without a store.
 */

export interface KvEntry<T> {
  /** Trusted as `T` without validation: only this function ever writes these keys. */
  value: T
  /** Changes on every write; passed back as `ifMatch` for a compare-and-set. Never empty: an
   * implementation that cannot produce one must throw rather than hand back a blank. */
  etag: string
}

export interface KvWriteCondition {
  /** Write only if the stored entry still has this etag. */
  ifMatch?: string
  /** Write only if no entry exists under the key yet. */
  ifNew?: boolean
}

export interface Kv {
  get<T>(key: string): Promise<KvEntry<T> | null>
  /** Resolves false when a condition was given and did not hold, so nothing was written. */
  set(key: string, value: unknown, condition?: KvWriteCondition): Promise<boolean>
}
