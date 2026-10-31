import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

// The home screen fetches the theory repo's map ahead of a click. Tests must never reach the
// network: by default GitHub is unreachable, so the bundled map opens. A test that wants a
// response stubs `fetch` itself.
beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network disabled in tests')))
  // The server-function tests run in a node environment, which has no sessionStorage.
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())
