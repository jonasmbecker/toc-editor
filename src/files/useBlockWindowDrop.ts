import { useEffect } from 'react'

/** A file dropped anywhere but a drop zone would make the browser navigate to it and unload
 * the app, edits and all. Swallow the window default for the whole app's lifetime; the home
 * screen's drop zone handles its own `drop` before this sees it. */
export function useBlockWindowDrop(): void {
  useEffect(() => {
    const block = (event: Event) => event.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])
}
