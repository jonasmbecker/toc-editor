import { documentSchema } from '../../../src/model/schema'

/** Small response and request helpers shared by the diagrams API. */

export const MAX_BODY_BYTES = 1024 * 1024
const MAX_BODY_LABEL = `${MAX_BODY_BYTES / 1024 / 1024} MB`

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      // A diagram changes under the same URL; a cached GET would show an old revision.
      'cache-control': 'no-store',
    },
  })
}

export function failure(status: number, error: string): Response {
  return json(status, { error })
}

export type BodyResult =
  { ok: true; body: Record<string, unknown> } | { ok: false; response: Response }

/** How large a body may be, and what to tell the caller when it is larger. */
export interface BodyLimit {
  bytes: number
  message: string
}

const DIAGRAM_LIMIT: BodyLimit = {
  bytes: MAX_BODY_BYTES,
  message: `The diagram is larger than ${MAX_BODY_LABEL}`,
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a JSON object body: 415 for anything not declared as JSON, 413 over the cap (by the
 * declared length first, then by the bytes actually read), 400 for unparseable or non-object. */
export async function readJsonBody(
  request: Request,
  limit: BodyLimit = DIAGRAM_LIMIT,
): Promise<BodyResult> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    return { ok: false, response: failure(415, 'Send the body as application/json') }
  }
  const tooLarge = { ok: false as const, response: failure(413, limit.message) }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limit.bytes) return tooLarge
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > limit.bytes) return tooLarge
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (isPlainObject(parsed)) return { ok: true, body: parsed }
  } catch {
    // Falls through to the 400 below.
  }
  return { ok: false, response: failure(400, 'The body is not a JSON object') }
}

/** The same zod schema the browser applies when it opens a file, so nothing can be stored
 * that no link could later open. The stored value is the validated (passthrough) document. */
export function isDiagramDocument(value: unknown): boolean {
  return documentSchema.safeParse(value).success
}
