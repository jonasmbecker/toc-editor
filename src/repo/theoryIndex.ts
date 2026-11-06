import { z } from 'zod'

/**
 * `theories/index.json` in the theory repo: which theories metacrisis.wiki offers, which one
 * opens first, and how each is marked. The file is untrusted like everything read from the repo:
 * an entry that does not fit is dropped rather than failing the whole list, and a list whose
 * default is not one of its entries is refused.
 */

/** Lower-case words joined by single hyphens, at most 64 characters: safe in a path and a URL. */
export const SLUG = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/

/** `author`: the theory as its author holds it. `reconstructed`: drawn by others from someone's
 * public material, not endorsed by them. Anything else shows no badge, so a status added to the
 * repo later never breaks the switcher. */
export type TheoryStatus = 'author' | 'reconstructed' | 'other'

export interface TheoryEntry {
  slug: string
  title: string
  status: TheoryStatus
  /** `stages` (columns) or `free`; kept for the free-canvas slice, unused here. */
  layout: string
  statusNote?: string
}

export interface TheoryIndex {
  default: string
  theories: TheoryEntry[]
}

/** The slug of Jonas's theory, the default before the repo held an index. */
export const DEFAULT_SLUG = 'jonas'

/** What the switcher shows when the index cannot be read: the bundled theory only. */
export const BUNDLED_INDEX: TheoryIndex = {
  default: DEFAULT_SLUG,
  theories: [
    {
      slug: DEFAULT_SLUG,
      title: "Jonas Becker's theory",
      status: 'author',
      layout: 'stages',
      statusNote: 'Written by Jonas Becker, who maintains this map. Suggestions welcome.',
    },
  ],
}

const entrySchema = z.object({
  slug: z.string().regex(SLUG),
  title: z.string().trim().min(1).max(200),
  status: z.string(),
  layout: z.string().optional(),
  statusNote: z.string().max(600).optional(),
})

function statusOf(raw: string): TheoryStatus {
  return raw === 'author' || raw === 'reconstructed' ? raw : 'other'
}

/** The index as the editor uses it, or null when the file is not one. */
export function parseTheoryIndex(raw: unknown): TheoryIndex | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { default: fallback, theories } = raw as Record<string, unknown>
  if (typeof fallback !== 'string' || !Array.isArray(theories)) return null
  const seen = new Set<string>()
  const entries: TheoryEntry[] = []
  for (const item of theories) {
    const parsed = entrySchema.safeParse(item)
    if (!parsed.success || seen.has(parsed.data.slug)) continue
    seen.add(parsed.data.slug)
    const { slug, title, status, layout, statusNote } = parsed.data
    entries.push({
      slug,
      title,
      status: statusOf(status),
      layout: layout ?? 'stages',
      ...(statusNote ? { statusNote } : {}),
    })
  }
  if (!seen.has(fallback)) return null
  return { default: fallback, theories: entries }
}

const STATUS_LABELS: Record<TheoryStatus, string | null> = {
  author: "Author's own",
  reconstructed: 'Reconstructed · not endorsed',
  other: null,
}

/** The words a theory's status badge says, or null for a status this editor does not know. */
export function statusLabel(theory: TheoryEntry): string | null {
  return STATUS_LABELS[theory.status]
}

export function findTheory(index: TheoryIndex, slug: string): TheoryEntry | null {
  return index.theories.find((theory) => theory.slug === slug) ?? null
}

/** The raw `theory` query value, or null when the address has none. */
export function theoryParam(search: string): string | null {
  return new URLSearchParams(search).get('theory')
}

/** The address of a theory: the bare address for the default, `/?theory=<slug>` otherwise. */
export function theoryPath(index: TheoryIndex, slug: string): string {
  return slug === index.default ? '/' : `/?theory=${encodeURIComponent(slug)}`
}
