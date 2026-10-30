import type { KeyboardEvent, ReactNode } from 'react'
import type { Direction } from '../state/connections'
import { directionSentence } from './directionSentence'

export interface DirectionControlProps {
  value: Direction
  firstTitle: string
  secondTitle: string
  onChange: (direction: Direction) => void
}

const ICON = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** lucide arrow-right, arrow-left, arrow-left-right. */
const OPTIONS: { value: Direction; label: string; icon: ReactNode }[] = [
  {
    value: 'forward',
    label: 'Forward',
    icon: (
      <svg {...ICON}>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    ),
  },
  {
    value: 'backward',
    label: 'Backward',
    icon: (
      <svg {...ICON}>
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    ),
  },
  {
    value: 'both',
    label: 'Both ways',
    icon: (
      <svg {...ICON}>
        <path d="M8 3 4 7l4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </svg>
    ),
  },
]

/** Three-segment radio group: Forward, Backward, Both ways. Arrow keys move between the
 * segments and select; Enter and Space select the focused one (native button behaviour). */
export function DirectionControl({
  value,
  firstTitle,
  secondTitle,
  onChange,
}: DirectionControlProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = OPTIONS.findIndex((option) => option.value === value)
    const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length]
    onChange(next.value)
    const target = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-direction="${next.value}"]`,
    )
    target?.focus()
  }

  return (
    <div className="toc-direction">
      <div className="toc-segmented" role="radiogroup" aria-label="Direction" onKeyDown={onKeyDown}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            tabIndex={option.value === value ? 0 : -1}
            data-direction={option.value}
            className={`toc-segmented__option${option.value === value ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
      <p className="toc-direction__sentence">{directionSentence(value, firstTitle, secondTitle)}</p>
    </div>
  )
}
