import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { serializeMapFile, splitDocument } from '../../../src/files/split'
import type { ToCDocument } from '../../../src/model/schema'
import { createMemoryKv } from './kv.memory'
import { handleSuggest, type SuggestDeps } from './suggestApi'
import type { PullRequestSpec, TheoryRepo } from './theoryRepo'

/** Shared fixtures for the suggestion tests: the live map, a fake theory repo that holds it, and
 * a contributor's request built by editing it. Not a test file itself. */

export const live = JSON.parse(
  readFileSync(
    new URL('../../../src/templates/status-quo-metacrisis.json', import.meta.url),
    'utf8',
  ),
) as ToCDocument
export const baseFiles = splitDocument(live)
export const BASE_SHA = 'b'.repeat(40)
export const TRAUMA = 'structure-intergenerational-war-trauma'
export const FREEZE = 'structure-collective-freeze'

export function cardsOf(doc: ToCDocument) {
  return doc.sections.flatMap((section) => section.columns.flatMap((column) => column.nodes))
}

export function card(doc: ToCDocument, id: string) {
  const found = cardsOf(doc).find((node) => node.id === id)
  if (!found) throw new Error(`no card ${id}`)
  return found
}

/** A stand-in for the theory repo, holding the live map at BASE_SHA, which records what it is
 * asked to open. */
export function fakeRepo(overrides: Partial<TheoryRepo> = {}) {
  const opened: PullRequestSpec[] = []
  const repo: TheoryRepo = {
    isOnMain: vi.fn(async (sha: string) => sha === BASE_SHA),
    readMap: vi.fn(async () => ({
      content: serializeMapFile(baseFiles.content),
      layout: serializeMapFile(baseFiles.layout),
    })),
    openPullRequest: vi.fn(async (spec: PullRequestSpec) => {
      opened.push(spec)
      return { number: 12, url: 'https://github.com/jonasmbecker/theory-of-metacrisis/pull/12' }
    }),
    ...overrides,
  }
  return { repo, opened }
}

/** A contributor's request: the live map with `change` applied, split into the two files. */
export function suggestion(
  change: (doc: ToCDocument) => void,
  extra: Record<string, unknown> = {},
) {
  const doc = structuredClone(live)
  change(doc)
  const { content, layout } = splitDocument(doc)
  return {
    content,
    layout,
    name: 'Ana',
    reason: 'It is what I see in practice.',
    baseSha: BASE_SHA,
    ...extra,
  }
}

export const addLink = (doc: ToCDocument) =>
  card(doc, TRAUMA).connections.push({ targetId: FREEZE, confidence: 60 })

export function freshDeps(
  repo: TheoryRepo | null,
): SuggestDeps & { kv: ReturnType<typeof createMemoryKv> } {
  return {
    kv: createMemoryKv(),
    ip: '203.0.113.7',
    now: () => new Date('2026-10-31T10:00:00Z'),
    repo,
  }
}

export function send(
  deps: SuggestDeps,
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  const init: RequestInit = { method: 'POST', headers }
  init.body = typeof body === 'string' ? body : JSON.stringify(body)
  return handleSuggest(
    new Request('https://toc.test/.netlify/functions/suggest-change', init),
    deps,
  )
}
