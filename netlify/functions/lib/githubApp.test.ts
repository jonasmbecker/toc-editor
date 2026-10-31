// @vitest-environment node
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  GithubError,
  appJwt,
  installationToken,
  normalizePrivateKey,
  readAppConfig,
  type FetchFn,
} from './githubApp'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  // GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"), which Web Crypto cannot import.
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})
const PEM = privateKey.trim()
const ENV = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_INSTALLATION_ID: '67890',
  GITHUB_APP_PRIVATE_KEY: PEM,
}
const NOW = 1_800_000_000

describe('normalizePrivateKey', () => {
  it('keeps a key with real newlines as it is', () => {
    expect(normalizePrivateKey(`${PEM}\n`)).toBe(PEM)
  })

  it('turns literal \\n sequences into newlines', () => {
    expect(normalizePrivateKey(PEM.replace(/\n/g, '\\n'))).toBe(PEM)
  })

  it('removes wrapping quotes', () => {
    expect(normalizePrivateKey(`"${PEM.replace(/\n/g, '\\n')}"`)).toBe(PEM)
    expect(normalizePrivateKey(`'${PEM}'`)).toBe(PEM)
  })
})

describe('readAppConfig', () => {
  it('reads all three values', () => {
    expect(readAppConfig(ENV)).toEqual({ appId: '12345', installationId: '67890', privateKey: PEM })
  })

  it('accepts a key whose newlines were typed as \\n', () => {
    const config = readAppConfig({ ...ENV, GITHUB_APP_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') })
    expect(config?.privateKey).toBe(PEM)
  })

  it.each([
    ['no variables', {}],
    ['no app id', { ...ENV, GITHUB_APP_ID: undefined }],
    ['no installation id', { ...ENV, GITHUB_APP_INSTALLATION_ID: '' }],
    ['no key', { ...ENV, GITHUB_APP_PRIVATE_KEY: undefined }],
    ['a non-numeric app id', { ...ENV, GITHUB_APP_ID: 'my-app' }],
    ['a key that is not a PEM', { ...ENV, GITHUB_APP_PRIVATE_KEY: 'not a key' }],
  ])('is null with %s', (_name, env) => {
    expect(readAppConfig(env)).toBeNull()
  })
})

describe('appJwt', () => {
  const config = readAppConfig(ENV)!
  const [header, payload, signature] = appJwt(config, NOW).split('.')
  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString()) as unknown

  it('is an RS256 token for the App, valid for under 10 minutes and not dated in the future', () => {
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = decode(payload) as { iss: string; iat: number; exp: number }
    expect(claims.iss).toBe('12345')
    expect(claims.iat).toBeLessThan(NOW)
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(10 * 60)
    expect(claims.exp).toBeGreaterThan(NOW)
  })

  it('is signed with the private key, checkable with the public key', () => {
    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'))
    expect(ok).toBe(true)
  })

  it('does not contain the key', () => {
    expect(appJwt(config, NOW)).not.toContain('PRIVATE KEY')
  })
})

describe('installationToken', () => {
  const config = readAppConfig(ENV)!

  function fakeFetch(response: Response) {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchFn: FetchFn = async (url, init) => {
      calls.push({ url, init })
      return response
    }
    return { fetchFn, calls }
  }

  it('asks GitHub for a token limited to the theory repo and two permissions', async () => {
    const { fetchFn, calls } = fakeFetch(
      Response.json({ token: 'ghs_installation' }, { status: 201 }),
    )
    expect(await installationToken(config, 'theory-of-metacrisis', fetchFn, NOW)).toBe(
      'ghs_installation',
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.github.com/app/installations/67890/access_tokens')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${appJwt(config, NOW)}`)
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      repositories: ['theory-of-metacrisis'],
      permissions: { contents: 'write', pull_requests: 'write' },
    })
  })

  it("fails with the step and status, and GitHub's own reason, but no credential", async () => {
    const { fetchFn } = fakeFetch(Response.json({ message: 'Bad credentials' }, { status: 401 }))
    const error = await installationToken(config, 'theory-of-metacrisis', fetchFn, NOW).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(GithubError)
    expect(error.message).toBe('GitHub token failed (401): Bad credentials')
    expect(error.message).not.toContain('PRIVATE KEY')
    expect(error.message).not.toContain(appJwt(config, NOW))
  })

  it('fails when GitHub answers without a token', async () => {
    const { fetchFn } = fakeFetch(Response.json({}, { status: 201 }))
    await expect(installationToken(config, 'theory-of-metacrisis', fetchFn, NOW)).rejects.toThrow(
      GithubError,
    )
  })
})
