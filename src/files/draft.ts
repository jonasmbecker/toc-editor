import { z } from 'zod'
import { documentSchema, type ToCDocument } from '../model/schema'

/**
 * The one local draft: the last edited document, kept in this browser only. Saving can fail
 * (storage full, or blocked in a private window), and the callers say so to the user rather
 * than promising a draft that does not exist: `saveDraft` returns what it saved, or null.
 */

const KEY = 'toc-editor:draft'

const draftSchema = z.object({ savedAt: z.string(), document: documentSchema })

export type Draft = z.infer<typeof draftSchema>

// The document object the last successful save wrote. A caller that has just saved can skip
// a second serialisation of the same object (the autosave flush after an explicit save).
let lastSaved: ToCDocument | null = null

export function saveDraft(document: ToCDocument, now = new Date()): Draft | null {
  const draft: Draft = { savedAt: now.toISOString(), document }
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    return null
  }
  lastSaved = document
  return draft
}

export function isDraftCurrent(document: ToCDocument): boolean {
  return document === lastSaved
}

/** The stored draft, or null when there is none or it does not parse. Drafts are written from
 * the store, already in single-connection form, so no loop collapsing happens here. */
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const result = draftSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function clearDraft(): void {
  lastSaved = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
