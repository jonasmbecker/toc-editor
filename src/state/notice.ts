import { useToCStore } from './store'

const NOTICE_DURATION_MS = 1800

let timer: number | undefined

/** Shows a short bottom-centre notice (the `.toc-toast`) and clears it after a moment. One
 * timer for the whole app, so a second notice replaces the first instead of flickering. */
export function announce(message: string, durationMs = NOTICE_DURATION_MS): void {
  window.clearTimeout(timer)
  useToCStore.getState().notify(message)
  timer = window.setTimeout(() => useToCStore.getState().notify(null), durationMs)
}
