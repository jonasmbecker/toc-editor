/**
 * Share tokens: 128 random bits from Web Crypto, base64url without padding (22 characters).
 * The store keeps only their SHA-256, so reading the store does not hand out edit rights.
 */

const TOKEN_BYTES = 16
const ID_BYTES = 9
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function newToken(): string {
  return base64url(randomBytes(TOKEN_BYTES))
}

/** The record id: never shown to users, only joins a token lookup to its diagram. */
export function newDiagramId(): string {
  return `d_${base64url(randomBytes(ID_BYTES))}`
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
