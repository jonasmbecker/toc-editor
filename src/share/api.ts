import { z } from 'zod'
import type { ToCDocument } from '../model/schema'
import { importFromJson } from '../files/import'

/**
 * The browser side of `netlify/functions/diagrams.ts`. Every response is checked with zod and
 * every stored document goes through `importFromJson`, the same door files and templates use.
 * Failures throw `ShareError`, whose `kind` says what went wrong.
 */

export type ShareRole = 'edit' | 'view'

const API = '/api/diagrams'

/** Bodies this large and above are refused by browsers when `keepalive` is set (the limit is
 * 64 KiB of outstanding keepalive bodies); such a save goes out as an ordinary request. */
const KEEPALIVE_MAX_BYTES = 60 * 1024

/** The same shape `share/route.ts` accepts, so a link the dialog shows is one the app opens. */
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/)

export type ShareErrorKind = 'network' | 'http' | 'unreadable'

export class ShareError extends Error {
  readonly kind: ShareErrorKind
  /** The HTTP status for `kind: 'http'`; 0 otherwise. */
  readonly status: number
  constructor(kind: ShareErrorKind, status: number, message: string) {
    super(message)
    this.name = 'ShareError'
    this.kind = kind
    this.status = status
  }
}

const createdSchema = z.object({
  editToken: tokenSchema,
  viewToken: tokenSchema,
  revision: z.number().int(),
})
const readSchema = z.object({
  role: z.enum(['edit', 'view']),
  data: z.unknown(),
  revision: z.number().int(),
  viewToken: tokenSchema.optional(),
})
const revisionSchema = z.object({ revision: z.number().int() })

interface ApiResponse {
  status: number
  body: unknown
}

async function send(method: string, path: string, body?: unknown, keepalive = false) {
  const text = body === undefined ? undefined : JSON.stringify(body)
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method,
      keepalive: keepalive && (text?.length ?? 0) < KEEPALIVE_MAX_BYTES,
      headers: text === undefined ? undefined : { 'content-type': 'application/json' },
      body: text,
    })
  } catch {
    throw new ShareError('network', 0, 'No connection')
  }
  const parsed: unknown = await response.json().catch(() => null)
  return { status: response.status, body: parsed } satisfies ApiResponse
}

function fail({ status, body }: ApiResponse): never {
  const message = (body as { error?: unknown } | null)?.error
  throw new ShareError('http', status, typeof message === 'string' ? message : `HTTP ${status}`)
}

export async function createShared(document: ToCDocument) {
  const response = await send('POST', '', { data: document })
  if (response.status !== 201) fail(response)
  return createdSchema.parse(response.body)
}

export interface OpenedShare {
  role: ShareRole
  document: ToCDocument
  revision: number
  viewToken?: string
}

export async function openShared(token: string): Promise<OpenedShare> {
  const response = await send('GET', `/${token}`)
  if (response.status !== 200) fail(response)
  const { role, data, revision, viewToken } = readSchema.parse(response.body)
  const imported = importFromJson(data)
  if (!imported.ok) throw new ShareError('unreadable', 0, 'The stored diagram could not be read')
  return { role, document: imported.document, revision, viewToken }
}

export type SaveOutcome =
  { kind: 'saved'; revision: number } | { kind: 'conflict'; revision: number }

/** `isLeaving` asks for `keepalive`, so a small last save survives the tab closing. */
export async function saveShared(
  editToken: string,
  document: ToCDocument,
  revision: number,
  isLeaving = false,
): Promise<SaveOutcome> {
  const response = await send('PUT', `/${editToken}`, { data: document, revision }, isLeaving)
  if (response.status === 200) return { kind: 'saved', ...revisionSchema.parse(response.body) }
  if (response.status === 409) return { kind: 'conflict', ...revisionSchema.parse(response.body) }
  fail(response)
}
