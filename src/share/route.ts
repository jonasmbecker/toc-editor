import type { ShareRole } from './api'

/** `/d/<editToken>` opens a diagram for editing, `/v/<viewToken>` for reading. Everything else
 * is the home screen. The SPA redirect in netlify.toml serves index.html for both. */

export interface ShareRoute {
  role: ShareRole
  token: string
}

const ROUTE = /^\/(d|v)\/([A-Za-z0-9_-]{22})\/?$/

export function parseShareRoute(pathname: string): ShareRoute | null {
  const match = ROUTE.exec(pathname)
  if (!match) return null
  return { role: match[1] === 'd' ? 'edit' : 'view', token: match[2] }
}

export function editPath(token: string): string {
  return `/d/${token}`
}

export function viewPath(token: string): string {
  return `/v/${token}`
}

export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`
}

/** Changes the address bar without a reload. `replace` for "this tab is now that link",
 * push for a move the back button should undo. */
export function setPath(path: string, { replace = false } = {}): void {
  if (window.location.pathname === path) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
}
