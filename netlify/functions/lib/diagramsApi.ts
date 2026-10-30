import type { Kv } from './kv'
import { failure, isDiagramDocument, json, readJsonBody } from './http'
import { mayCreate, recordCreate } from './rateLimit'
import { TOKEN_PATTERN, newDiagramId, newToken, sha256Hex } from './tokens'

/**
 * The diagrams API, free of anything Netlify-specific so it can be tested against an in-memory
 * store. `diagrams.ts` adapts it to a Netlify Function and Netlify Blobs.
 *
 *   POST /api/diagrams          { data }            -> 201 { editToken, viewToken, revision }
 *   GET  /api/diagrams/{token}                      -> 200 { role, data, revision, viewToken? }
 *   PUT  /api/diagrams/{token}  { data, revision }  -> 200 { revision } | 409 { revision }
 */

type Role = 'edit' | 'view'

/** `viewToken` is kept in clear so an edit link can show the view link again later; a leaked
 * view token only grants reading. The edit token exists only as its hash. */
interface DiagramRecord {
  data: unknown
  revision: number
  editTokenHash: string
  viewTokenHash: string
  viewToken: string
  createdAt: string
  updatedAt: string
}

interface TokenRecord {
  id: string
  role: Role
}

export interface ApiDeps {
  kv: Kv
  ip: string
  now: () => Date
}

const COLLECTION_PATH = '/api/diagrams'

const diagramKey = (id: string) => `diagram/${id}`
const tokenKey = (hash: string) => `token/${hash}`

/** The token from `/api/diagrams/{token}`, '' for the collection itself, null for any other
 * path. A malformed token is treated as unknown rather than as a different route. */
function tokenFromPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '')
  if (path === COLLECTION_PATH) return ''
  if (!path.startsWith(`${COLLECTION_PATH}/`)) return null
  return path.slice(COLLECTION_PATH.length + 1)
}

async function lookup(kv: Kv, token: string) {
  if (!TOKEN_PATTERN.test(token)) return null
  const link = await kv.get<TokenRecord>(tokenKey(await sha256Hex(token)))
  if (!link) return null
  const diagram = await kv.get<DiagramRecord>(diagramKey(link.value.id))
  return diagram ? { role: link.value.role, id: link.value.id, diagram } : null
}

async function newRecord(data: unknown, now: Date) {
  const editToken = newToken()
  const viewToken = newToken()
  const [editTokenHash, viewTokenHash] = await Promise.all([
    sha256Hex(editToken),
    sha256Hex(viewToken),
  ])
  const record: DiagramRecord = {
    data,
    revision: 1,
    editTokenHash,
    viewTokenHash,
    viewToken,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  return { editToken, viewToken, record }
}

async function create(request: Request, deps: ApiDeps): Promise<Response> {
  const now = deps.now()
  // Checked before the body is read, so a refused caller costs no parse; counted only after
  // a record was actually stored, so garbage never uses up a real user's allowance.
  if (!(await mayCreate(deps.kv, deps.ip, now))) {
    return failure(429, 'Too many new diagrams right now, try again later')
  }
  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  if (!isDiagramDocument(parsed.body.data)) return failure(400, 'data is not a diagram')

  const id = newDiagramId()
  const { editToken, viewToken, record } = await newRecord(parsed.body.data, now)
  // The diagram first, then its lookups: a token never points at a record that is not there.
  if (!(await deps.kv.set(diagramKey(id), record, { ifNew: true }))) {
    return failure(500, 'Could not store the diagram, try again')
  }
  await Promise.all([
    deps.kv.set(tokenKey(record.editTokenHash), { id, role: 'edit' } satisfies TokenRecord),
    deps.kv.set(tokenKey(record.viewTokenHash), { id, role: 'view' } satisfies TokenRecord),
    recordCreate(deps.kv, deps.ip, now),
  ])
  return json(201, { editToken, viewToken, revision: 1 })
}

/** Built field by field from the role, so a view response cannot carry anything it should not. */
async function read(token: string, deps: ApiDeps): Promise<Response> {
  const found = await lookup(deps.kv, token)
  if (!found) return failure(404, 'No diagram for this link')
  const { data, revision, viewToken } = found.diagram.value
  if (found.role === 'view') return json(200, { role: 'view', data, revision })
  return json(200, { role: 'edit', data, revision, viewToken })
}

async function save(token: string, request: Request, deps: ApiDeps): Promise<Response> {
  const found = await lookup(deps.kv, token)
  if (!found) return failure(404, 'No diagram for this link')
  if (found.role !== 'edit') return failure(403, 'A view link cannot change the diagram')
  const parsed = await readJsonBody(request)
  if (!parsed.ok) return parsed.response
  const { data, revision } = parsed.body
  if (!isDiagramDocument(data)) return failure(400, 'data is not a diagram')
  if (!Number.isInteger(revision)) return failure(400, 'revision must be an integer')

  const stored = found.diagram
  if (revision !== stored.value.revision) return json(409, { revision: stored.value.revision })
  // Without an etag the write could not be conditional, and an unconditional write is exactly
  // the lost update the revision exists to prevent.
  if (!stored.etag) return failure(500, 'Could not verify the stored version, try again')
  const next: DiagramRecord = {
    ...stored.value,
    data,
    revision: stored.value.revision + 1,
    updatedAt: deps.now().toISOString(),
  }
  // Compare-and-set on the etag: two saves that both read revision N cannot both write N+1.
  if (await deps.kv.set(diagramKey(found.id), next, { ifMatch: stored.etag })) {
    return json(200, { revision: next.revision })
  }
  const latest = await deps.kv.get<DiagramRecord>(diagramKey(found.id))
  return json(409, { revision: latest?.value.revision ?? stored.value.revision })
}

export async function handleDiagrams(request: Request, deps: ApiDeps): Promise<Response> {
  const token = tokenFromPath(new URL(request.url).pathname)
  if (token === null) return failure(404, 'Not found')
  if (token === '') {
    return request.method === 'POST' ? create(request, deps) : failure(405, 'Use POST')
  }
  if (request.method === 'GET') return read(token, deps)
  if (request.method === 'PUT') return save(token, request, deps)
  return failure(405, 'Use GET or PUT')
}
