import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useToCStore } from '../state/store'
import { hasChanges, layoutLine, summarizeChanges } from '../files/changeSummary'
import { CloseIcon, CopyIcon } from '../share/icons'
import type { TheoryOrigin } from '../repo/mapSource'
import { useOriginStore } from './originStore'
import {
  clearForm,
  loadForm,
  NAME_LIMIT,
  REASON_LIMIT,
  saveForm,
  sendSuggestion,
  type SuggestForm,
} from './submit'
import '../home/home.css'
import '../share/share-dialog.css'
import './suggest-dialog.css'

export interface SuggestDialogProps {
  origin: TheoryOrigin
  onClose: () => void
}

type Phase = { kind: 'form' } | { kind: 'sending' } | { kind: 'sent'; url: string }

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]'

function isTextField(target: EventTarget): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

/** Escape closes; Tab stays inside the dialog; undo and redo belong to the canvas behind the
 * scrim, so outside the text fields they are swallowed. */
function onDialogKey(event: KeyboardEvent, root: HTMLElement | null, onClose: () => void): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    onClose()
    return
  }
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
    if (!isTextField(event.target)) event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.key !== 'Tab' || !root) return
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true',
  )
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = window.document.activeElement
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * The Suggest a change dialog (design detail "suggest-dialog-design"): the contributor's edits
 * in plain words, a name and a reason, a line saying it is public, then the link to the
 * suggestion. The edits stay on the map and the words stay in local storage until a link comes
 * back, so a failed send loses nothing.
 */
export function SuggestDialog({ origin, onClose }: SuggestDialogProps) {
  const document = useToCStore((state) => state.document)
  const summary = useMemo(() => summarizeChanges(origin.document, document), [origin, document])
  const extra = layoutLine(summary)
  const lines = summary.lines.length > 0 && extra ? [...summary.lines, extra] : summary.lines
  const changed = hasChanges(summary)
  const sent = useOriginStore((state) => state.sent)
  const [form, setForm] = useState<SuggestForm>(loadForm)
  const [sending, setSending] = useState(false)
  // Unchanged since the last suggestion went through: show its link, never a second send.
  const phase: Phase =
    sent && sent.document === document
      ? { kind: 'sent', url: sent.url }
      : sending
        ? { kind: 'sending' }
        : { kind: 'form' }
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const nameField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (changed) nameField.current?.focus()
    else dialog.current?.focus()
  }, [changed])

  function update(next: SuggestForm) {
    setForm(next)
    saveForm(next)
  }

  const canSend =
    phase.kind === 'form' && changed && form.name.trim() !== '' && form.reason.trim() !== ''

  async function send() {
    if (!canSend) return
    setError(null)
    setSending(true)
    const result = await sendSuggestion(document, origin.sha, form)
    setSending(false)
    if (result.ok) {
      clearForm()
      setForm({ name: '', reason: '' })
      useOriginStore.getState().markSent(document, result.url)
    } else {
      setError(result.message)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // The link is on screen and selectable.
    }
  }

  return (
    <div className="toc-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="toc-share toc-suggest"
        role="dialog"
        aria-modal="true"
        aria-labelledby="toc-suggest-title"
        tabIndex={-1}
        onKeyDown={(e) => onDialogKey(e, dialog.current, onClose)}
      >
        <header className="toc-share__head">
          <div>
            <div className="toc-panel__eyebrow">Suggest a change</div>
            <h2 className="toc-share__title" id="toc-suggest-title">
              {phase.kind === 'sent' ? 'Thank you' : 'Your changes to the map'}
            </h2>
          </div>
          <button type="button" className="toc-share__close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {phase.kind === 'sent' ? (
          <Sent
            url={phase.url}
            copied={copied}
            onCopy={() => void copy(phase.url)}
            onDone={onClose}
          />
        ) : !changed ? (
          <>
            <p className="toc-suggest__empty">
              You have not changed anything yet. Edit a card, text or link on the map, then come
              back to suggest it.
            </p>
            <div className="toc-suggest__actions">
              <button type="button" className="toc-topbar__btn" onClick={onClose}>
                Back to the map
              </button>
            </div>
          </>
        ) : (
          <form
            className="toc-suggest__form"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            {error ? (
              <div className="toc-share__error" role="alert">
                <span>{error} Nothing is lost: your edits and words are still here.</span>
              </div>
            ) : null}
            {lines.length > 0 ? (
              <ul className="toc-suggest__changes" aria-label="What you changed">
                {lines.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="toc-suggest__empty">
                {extra}. Positions only: the theory itself is unchanged.
              </p>
            )}
            <label className="toc-suggest__field">
              Your name
              <input
                ref={nameField}
                type="text"
                value={form.name}
                maxLength={NAME_LIMIT}
                autoComplete="name"
                onChange={(e) => update({ ...form, name: e.target.value })}
              />
            </label>
            <label className="toc-suggest__field">
              <span>
                Why this change? <small>One or two sentences help the reviewer.</small>
              </span>
              <textarea
                value={form.reason}
                maxLength={REASON_LIMIT}
                rows={3}
                onChange={(e) => update({ ...form, reason: e.target.value })}
              />
            </label>
            {/* The honeypot: people never see or reach it. The send always posts it empty, so
                only a script posting to the function directly can trip it. */}
            <input
              type="text"
              name="website"
              className="toc-suggest__honey"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              defaultValue=""
            />
            <p className="toc-share__foot">
              Your name, reason and changes will be public on GitHub. We never ask for an account or
              email. A maintainer reviews every suggestion before it changes the map.
            </p>
            <div className="toc-suggest__actions">
              <button type="button" className="toc-topbar__btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="toc-topbar__btn toc-topbar__btn--primary"
                disabled={!canSend}
              >
                {phase.kind === 'sending' ? 'Sending…' : 'Send suggestion'}
              </button>
            </div>
            <div className="toc-suggest__sr" role="status">
              {phase.kind === 'sending' ? 'Sending your suggestion' : ''}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Sent({
  url,
  copied,
  onCopy,
  onDone,
}: {
  url: string
  copied: boolean
  onCopy: () => void
  onDone: () => void
}) {
  return (
    <>
      <div className="toc-suggest__sent" role="status">
        <strong>Your suggestion was sent.</strong>
        <span>You can follow it here, no account needed:</span>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url.replace(/^https:\/\//, '')}
        </a>
      </div>
      <p className="toc-share__foot">
        A maintainer will review it. Your edits stay on this map until you leave it.
      </p>
      <div className="toc-suggest__actions">
        <button type="button" className="toc-topbar__btn" onClick={onCopy}>
          <CopyIcon />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="toc-topbar__btn toc-topbar__btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}
