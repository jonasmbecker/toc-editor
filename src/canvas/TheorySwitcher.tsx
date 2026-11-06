import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { useSuggestionStore } from '../repo/suggestionStore'
import { useTheoryStore } from '../repo/theoryStore'
import { findTheory, statusLabel, type TheoryEntry } from '../repo/theoryIndex'
import { StatusBadge } from './StatusBadge'
import './theory-switcher.css'

/**
 * The top bar's theory switcher (design detail "switcher-design" on f013/land-in-map): the open
 * theory's name in the brand's place, opening a list of every theory in `theories/index.json`
 * with its status badge and note. Choosing one opens it at its own address. While a suggestion
 * preview is open the switcher is locked, since switching would leave the suggestion.
 */

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

/** Where a key moves focus in a list of `count` theories from `at` (-1: from nowhere), or null
 * for a key that does not move it. From nowhere, Down starts at the first and Up at the last. */
function nextOption(key: string, at: number, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return (at + 1) % count
  if (key === 'ArrowUp') return at <= 0 ? count - 1 : at - 1
  return null
}

/** Arrow keys, Home and End move between the theories; Escape closes the list. */
function onListKey(event: KeyboardEvent, list: HTMLUListElement | null, onClose: () => void) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    onClose()
    return
  }
  const options = Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
  const at = options.indexOf(document.activeElement as HTMLElement)
  const next = nextOption(event.key, at, options.length)
  if (next === null) return
  event.preventDefault()
  options[next]?.focus()
}

function TheoryOption({
  theory,
  isCurrent,
  onChoose,
}: {
  theory: TheoryEntry
  isCurrent: boolean
  onChoose: (slug: string) => void
}) {
  return (
    <li
      role="option"
      tabIndex={-1}
      aria-selected={isCurrent}
      className="toc-theory__option"
      onClick={() => onChoose(theory.slug)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onChoose(theory.slug)
      }}
    >
      <span className="toc-theory__option-head">
        <span className="toc-theory__option-name">{theory.title}</span>
        <StatusBadge theory={theory} />
      </span>
      {theory.statusNote ? <span className="toc-theory__note">{theory.statusNote}</span> : null}
    </li>
  )
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
        onKeyDown={(event) => onListKey(event, list.current, onClose)}
      >
        {index.theories.map((theory) => (
          <TheoryOption
            key={theory.slug}
            theory={theory}
            isCurrent={theory.slug === current}
            onChoose={onChoose}
          />
        ))}
      </ul>
      {isFallback ? (
        <p className="toc-theory__note toc-theory__fallback">Other theories could not be loaded.</p>
      ) : null}
      <button
        type="button"
        className="toc-theory__start"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onClose()
        }}
        onClick={onStart}
      >
        Start your own or open a file →
      </button>
    </div>
  )
}

/** Open and closed: a press outside `root` or a tab away closes the list quietly, as leaving a
 * native select does; choosing or Escape closes it and gives focus back to the switcher. */
function useListOpen(root: RefObject<HTMLDivElement | null>) {
  const [isOpen, setIsOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const closeQuietly = useCallback(() => setIsOpen(false), [])
  const closeToButton = useCallback(() => {
    setIsOpen(false)
    button.current?.focus()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) closeQuietly()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [root, isOpen, closeQuietly])

  const onBlur = (event: FocusEvent) => {
    if (!root.current?.contains(event.relatedTarget as Node | null)) closeQuietly()
  }
  return { isOpen, setIsOpen, button, closeToButton, onBlur }
}

export function TheorySwitcher({ onSwitch, onStart }: TheorySwitcherProps) {
  const index = useTheoryStore((state) => state.index)
  const current = useTheoryStore((state) => state.current)
  const isLocked = useSuggestionStore((state) => state.suggestion !== null)
  const root = useRef<HTMLDivElement>(null)
  const { isOpen, setIsOpen, button, closeToButton, onBlur } = useListOpen(root)

  if (!current) return null
  const theory = findTheory(index, current)
  const name = theory?.title ?? current
  const status = theory ? statusLabel(theory) : null

  return (
    <div className="toc-theory" ref={root} onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        className="toc-theory__button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Theory: ${name}${status ? ` (${status})` : ''}. Switch theory`}
        aria-disabled={isLocked}
        title={isLocked ? 'Close the suggestion to switch theories' : undefined}
        onClick={() => !isLocked && setIsOpen((open) => !open)}
      >
        <span className="toc-theory__name">{name}</span>
      </button>
      {theory ? <StatusBadge theory={theory} /> : null}
      {isOpen ? (
        <TheoryPopover
          current={current}
          onChoose={(slug) => {
            closeToButton()
            if (slug !== current) onSwitch(slug)
          }}
          onStart={() => {
            setIsOpen(false)
            onStart()
          }}
          onClose={closeToButton}
        />
      ) : null}
    </div>
  )
}
