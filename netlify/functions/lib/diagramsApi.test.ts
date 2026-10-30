// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryKv } from './kv.memory'
import { handleDiagrams, type ApiDeps } from './diagramsApi'
import { MAX_BODY_BYTES } from './http'
import { CREATES_PER_DAY_SITE_WIDE, CREATES_PER_HOUR } from './rateLimit'
import { sha256Hex } from './tokens'

const BASE = 'https://toc.test/api/diagrams'
const DOC = { title: 'Status quo', color: '#2F2D2E', sections: [] }

let kv: ReturnType<typeof createMemoryKv>
let deps: ApiDeps

function call(method: string, path = '', body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  return handleDiagrams(new Request(`${BASE}${path}`, init), deps)
}

async function createOne(data: unknown = DOC) {
  const response = await call('POST', '', { data })
  return (await response.json()) as { editToken: string; viewToken: string; revision: number }
}

beforeEach(() => {
  kv = createMemoryKv()
  deps = { kv, ip: '203.0.113.7', now: () => new Date('2026-10-29T10:15:00Z') }
})

describe('create', () => {
  it('returns two different 22-character tokens and revision 1, and no record id', async () => {
    const response = await call('POST', '', { data: DOC })
    expect(response.status).toBe(201)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.editToken).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(body.viewToken).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(body.editToken).not.toBe(body.viewToken)
    expect(body).toEqual({ editToken: body.editToken, viewToken: body.viewToken, revision: 1 })
  })

  it('stores the edit token only as a hash', async () => {
    const { editToken } = await createOne()
    const everything = JSON.stringify(
      await Promise.all(kv.keys().map(async (key) => [key, (await kv.get(key))?.value])),
    )
    expect(everything).not.toContain(editToken)
    expect(kv.keys()).toContain(`token/${await sha256Hex(editToken)}`)
  })

  it('refuses a body that fails the document schema, is not JSON, or is over 1 MB', async () => {
    expect((await call('POST', '', { data: { title: 'x' } })).status).toBe(400)
    const badColour = {
      ...DOC,
      sections: [
        {
          title: 's',
          columns: [
            {
              nodes: [
                { id: 'n', title: 't', text: '', color: 'red', yPosition: 0, connections: [] },
              ],
            },
          ],
        },
      ],
    }
    expect((await call('POST', '', { data: badColour })).status).toBe(400)
    expect((await call('POST', '', 'not json')).status).toBe(400)
    const asText = await call('POST', '', { data: DOC }, { 'content-type': 'text/plain' })
    expect(asText.status).toBe(415)
    const huge = { data: { ...DOC, padding: 'x'.repeat(MAX_BODY_BYTES) } }
    expect((await call('POST', '', huge)).status).toBe(413)
  })

  it('answers 429 once an address has created its hourly allowance, without counting refusals', async () => {
    for (let i = 0; i < CREATES_PER_HOUR - 1; i += 1) await createOne()
    expect((await call('POST', '', { data: { title: 'junk' } })).status).toBe(400)
    expect((await call('POST', '', { data: DOC })).status).toBe(201)
    expect((await call('POST', '', { data: DOC })).status).toBe(429)
    deps = { ...deps, ip: '198.51.100.1' }
    expect((await call('POST', '', { data: DOC })).status).toBe(201)
    deps = { ...deps, ip: '203.0.113.7', now: () => new Date('2026-10-29T11:00:00Z') }
    expect((await call('POST', '', { data: DOC })).status).toBe(201)
  })

  it('answers 429 for everyone once the site-wide daily ceiling is reached, and keeps one key per address', async () => {
    await kv.set('ratelimit/site', { bucket: '2026-10-29', count: CREATES_PER_DAY_SITE_WIDE })
    expect((await call('POST', '', { data: DOC })).status).toBe(429)
    deps = { ...deps, now: () => new Date('2026-10-30T00:00:00Z') }
    expect((await call('POST', '', { data: DOC })).status).toBe(201)
    expect(kv.keys().filter((key) => key.startsWith('ratelimit/')).length).toBe(2)
  })

  it('refuses a request with no address rather than pooling everyone', async () => {
    deps = { ...deps, ip: '' }
    expect((await call('POST', '', { data: DOC })).status).toBe(429)
  })
})

describe('read', () => {
  it('gives the edit role, the data and the view token for an edit token', async () => {
    const { editToken, viewToken } = await createOne()
    const body = await (await call('GET', `/${editToken}`)).json()
    expect(body).toEqual({ role: 'edit', data: DOC, revision: 1, viewToken })
  })

  it('never puts the edit token or the view token in a view response', async () => {
    const { editToken, viewToken } = await createOne()
    const text = await (await call('GET', `/${viewToken}`)).text()
    expect(JSON.parse(text)).toEqual({ role: 'view', data: DOC, revision: 1 })
    expect(text).not.toContain(editToken)
    expect(text).not.toContain(viewToken)
  })

  it('answers 404 for an unknown or malformed token', async () => {
    expect((await call('GET', '/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404)
    expect((await call('GET', '/short')).status).toBe(404)
  })
})

describe('save', () => {
  it('bumps the revision, and the view link reads the new content', async () => {
    const { editToken, viewToken } = await createOne()
    const changed = { ...DOC, title: 'Changed' }
    const saved = await call('PUT', `/${editToken}`, { data: changed, revision: 1 })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ revision: 2 })
    const view = await (await call('GET', `/${viewToken}`)).json()
    expect(view).toEqual({ role: 'view', data: changed, revision: 2 })
  })

  it('answers 409 with the stored revision when the caller saved from an older one', async () => {
    const { editToken } = await createOne()
    await call('PUT', `/${editToken}`, { data: DOC, revision: 1 })
    const stale = await call('PUT', `/${editToken}`, { data: DOC, revision: 1 })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ revision: 2 })
  })

  it('lets only one of two simultaneous saves from the same revision win', async () => {
    const { editToken } = await createOne()
    const results = await Promise.all([
      call('PUT', `/${editToken}`, { data: { ...DOC, title: 'A' }, revision: 1 }),
      call('PUT', `/${editToken}`, { data: { ...DOC, title: 'B' }, revision: 1 }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('refuses to save when the store hands back no etag, instead of overwriting', async () => {
    const { editToken } = await createOne()
    kv.etagOverride = ''
    const response = await call('PUT', `/${editToken}`, { data: DOC, revision: 1 })
    expect(response.status).toBe(500)
    kv.etagOverride = undefined
    const after = (await (await call('GET', `/${editToken}`)).json()) as { revision: number }
    expect(after.revision).toBe(1)
  })

  it('refuses a view token with 403', async () => {
    const { viewToken } = await createOne()
    expect((await call('PUT', `/${viewToken}`, { data: DOC, revision: 1 })).status).toBe(403)
  })
})
