import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useSuggestionStore } from '../repo/suggestionStore'
import { useTheoryStore } from '../repo/theoryStore'
import { findTheory, type TheoryEntry } from '../repo/theoryIndex'
import './theory-switcher.css'

/**
 * The top bar's theory switcher (design detail "switcher-design" on f013/land-in-map): the open
 * theory's name in the brand's place, opening a list of every theory in `theories/index.json`
 * with its status badge and note. Choosing one opens it at its own address. While a suggestion
 * preview is open the switcher is locked, since switching would leave the suggestion.
 */

export function StatusBadge({ theory }: { theory: TheoryEntry }) {
  if (theory.status === 'other') return null
  const isReconstructed = theory.status === 'reconstructed'
  return (
    <span
      className={`toc-topbar__pill toc-theory-badge${isReconstructed ? ' toc-theory-badge--reconstructed' : ''}`}
      title={theory.statusNote}
    >
      {isReconstructed ? 'Reconstructed · not endorsed' : "Author's own"}
    </span>
  )
}

export interface TheorySwitcherProps {
  onSwitch: (slug: string) => void
  onStart: () => void
}

interface PopoverProps {
  current: string
  onChoose: (slug: string) => void
  onStart: () => void
  /** Closes the list and gives focus back to the switcher. */
  onClose: () => void
}

function optionKey(event: KeyboardEvent, choose: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose()
  }
}

/** Arrow keys move between the theories, Escape closes the list. */
function moveFocus(event: KeyboardEvent, list: HTMLUListElement | null, onClose: () => void) {
  const found = list?.querySelectorAll<HTMLElement>('[role="option"]')
  const options = found ? Array.from(found) : []
  const at = options.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Escape') {
    event.stopPropagation()
    onClose()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    options[(at + step + options.length) % options.length]?.focus()
  }
}

function TheoryPopover({ current, onChoose, onStart, onClose }: PopoverProps) {
  const index = useTheoryStore((state) => state.index)
  const isFallback = useTheoryStore((state) => state.isIndexFallback)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const selected = list.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    ;(selected ?? list.current?.querySelector<HTMLElement>('[role="option"]'))?.focus()
  }, [])

  return (
    <div className="toc-theory__popover">
      <ul
        ref={list}
        className="toc-theory__list"
        role="listbox"
        aria-label="Theories"
        onKeyDown={(event) => moveFocus(event, list.current, onClose)}
      >
        {index.theories.map((entry) => (
          <li
            key={entry.slug}
            role="option"
            tabIndex={-1}
            aria-selected={entry.slug === current}
            className="toc-theory__option"
            onClick={() => onChoose(entry.slug)}
            onKeyDown={(event) => optionKey(event, () => onChoose(entry.slug))}
          >
            <span className="toc-theory__option-head">
              <span className="toc-theory__option-name">{entry.title}</span>
              <StatusBadge theory={entry} />
            </span>
            {entry.statusNote ? <span className="toc-theory__note">{entry.statusNote}</span> : null}
          </li>
        ))}
      </ul>
      {isFallback ? (
        <p className="toc-theory__note toc-theory__fallback">Other theories could not be loaded.</p>
      ) : null}
      <button
        type="button"
        className="toc-theory__start"
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        onClick={onStart}
      >
        Start your own or open a file →
      </button>
    </div>
  )
}

/** A press anywhere outside `root` closes the list, as a native select would. */
function useCloseOnOutsideClick(
  root: RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [root, isOpen, close])
}

export function TheorySwitcher({ onSwitch, onStart }: TheorySwitcherProps) {
  const index = useTheoryStore((state) => state.index)
  const current = useTheoryStore((state) => state.current)
  const isLocked = useSuggestionStore((state) => state.suggestion !== null)
  const [isOpen, setIsOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useCloseOnOutsideClick(root, isOpen, () => setIsOpen(false))

  if (!current) return null
  const theory = findTheory(index, current)
  const name = theory?.title ?? current

  return (
    <div className="toc-theory" ref={root}>
      <button
        ref={button}
        type="button"
        className="toc-theory__button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Theory: ${name}. Switch theory`}
        disabled={isLocked}
        title={isLocked ? 'Close the suggestion to switch theories' : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="toc-theory__name">{name}</span>
      </button>
      {theory ? <StatusBadge theory={theory} /> : null}
      {isOpen ? (
        <TheoryPopover
          current={current}
          onChoose={(slug) => {
            setIsOpen(false)
            if (slug !== current) onSwitch(slug)
          }}
          onStart={() => {
            setIsOpen(false)
            onStart()
          }}
          onClose={() => {
            setIsOpen(false)
            button.current?.focus()
          }}
        />
      ) : null}
    </div>
  )
}
