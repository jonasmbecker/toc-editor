import type { KeyboardEvent } from 'react'
import { bandForConfidence, confidenceSentence, edgeAppearance } from '../canvas/config'
import { NEW_CONNECTION_CONFIDENCE } from '../state/connections'
import { EdgeSwatch } from './EdgeSwatch'

export interface ConfidenceFieldProps {
  confidence: number | undefined
  isFeedbackLoop: boolean
  /** `undefined` clears the rating (removes the key from the file). Absent on a view link. */
  onChange?: (confidence: number | undefined) => void
  /** A view link: the slider shows the value but cannot move, and there is no "Clear". */
  disabled?: boolean
}

const SHIFT_STEP = 10

/** Shift+arrow moves the slider by ten; the native range only knows its own step of one. */
function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, onChange: (n: number) => void) {
  if (!event.shiftKey) return
  const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
  if (!direction) return
  event.preventDefault()
  const current = Number(event.currentTarget.value)
  onChange(Math.min(100, Math.max(0, current + direction * SHIFT_STEP)))
}

export function ConfidenceField({
  confidence,
  isFeedbackLoop,
  onChange = () => {},
  disabled = false,
}: ConfidenceFieldProps) {
  const band = bandForConfidence(confidence)
  const isRated = confidence != null
  const value = confidence ?? NEW_CONNECTION_CONFIDENCE
  const appearance = edgeAppearance({ confidence, isFeedbackLoop })

  return (
    <section className={`toc-field${isRated ? '' : ' toc-field--unrated'}`}>
      <div className="toc-field__head">
        <span className="toc-panel__label">Confidence</span>
        <span className="toc-field__value">{isRated ? `${value}%` : 'Unrated'}</span>
      </div>
      <input
        type="range"
        className="toc-slider"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        style={{ ['--toc-fill' as string]: `${value}%` }}
        aria-label="Confidence, 0 to 100"
        aria-valuetext={isRated ? `${value} percent, ${band} confidence` : 'not rated'}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={(event) => handleKeyDown(event, onChange)}
      />
      <p className="toc-band">
        <EdgeSwatch appearance={{ ...appearance, showArrow: false }} />
        <span>{disabled && !isRated ? 'Not rated yet.' : confidenceSentence(confidence)}</span>
      </p>
      {isRated && !disabled ? (
        <button type="button" className="toc-linkbtn" onClick={() => onChange(undefined)}>
          Clear rating
        </button>
      ) : null}
    </section>
  )
}
