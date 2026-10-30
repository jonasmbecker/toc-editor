import { useEffect, useRef, useState, type ReactNode } from 'react'

const COPIED_MS = 1500

/** True when the text reached the clipboard by either route. */
async function copyText(input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(input.value)
    return true
  } catch {
    // Older engines, or a clipboard permission refused: copy the selected input instead.
    input.select()
    return document.execCommand('copy')
  }
}

export interface ShareLinkRowProps {
  label: string
  audience: string
  icon: ReactNode
  url: string
  who: ReactNode
  autoFocus?: boolean
}

/** One link in the Share dialog: label and audience, the URL with a Copy button, and one line
 * on what someone holding it can do. The URL selects itself whenever it gets focus, which
 * `autoFocus` triggers on mount. */
export function ShareLinkRow({ label, audience, icon, url, who, autoFocus }: ShareLinkRowProps) {
  const input = useRef<HTMLInputElement>(null)
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (!isCopied) return
    const timer = window.setTimeout(() => setIsCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [isCopied])

  async function copy() {
    if (input.current && (await copyText(input.current))) setIsCopied(true)
  }

  return (
    <div className="toc-share__link">
      <div className="toc-share__label">
        {icon}
        {label}
        <span className="toc-share__audience">{audience}</span>
      </div>
      <div className="toc-share__row">
        <input
          ref={input}
          className="toc-share__url"
          readOnly
          value={url}
          aria-label={label}
          autoFocus={autoFocus}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className={`toc-topbar__btn toc-share__copy${isCopied ? ' toc-share__copy--done' : ''}`}
          onClick={() => void copy()}
        >
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="toc-share__who">{who}</p>
    </div>
  )
}
