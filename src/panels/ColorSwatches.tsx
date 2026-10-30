import { useState } from 'react'
import { normalizeHexColor } from './colorPalette'

export interface ColorSwatchesProps {
  options: string[]
  value: string
  onChange: (color: string) => void
}

/**
 * Swatch row plus a free-entry hex field, so a colour already in the document is one click and
 * anything else is still reachable. `draft` holds only an in-progress *invalid* hex string —
 * once typing produces a valid one, or the field loses focus, it goes back to `null` and the
 * field displays `value` directly. That's deliberate: `value` can change from outside this
 * component (undo, another edit), and a draft that lingered after a valid commit would mask
 * that change, showing a hex that's no longer what the node actually has.
 */
export function ColorSwatches({ options, value, onChange }: ColorSwatchesProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const displayedHex = draft ?? value
  // Swatches are matched against the normalised value so a lowercase colour in an imported
  // document still highlights its (uppercase) swatch.
  const current = normalizeHexColor(value) ?? value

  function handleHexChange(next: string) {
    const normalized = normalizeHexColor(next)
    if (normalized) {
      setDraft(null)
      onChange(normalized)
    } else {
      setDraft(next)
    }
  }

  return (
    <div className="toc-panel__color">
      <div className="toc-panel__swatches" role="radiogroup" aria-label="Node colour">
        {options.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={color === current}
            aria-label={color}
            className={`toc-swatch${color === current ? ' toc-swatch--selected' : ''}`}
            style={{ background: color }}
            onClick={() => {
              setDraft(null)
              onChange(color)
            }}
          />
        ))}
      </div>
      <input
        type="text"
        className={`toc-panel__hex${draft !== null ? ' toc-panel__hex--error' : ''}`}
        value={displayedHex}
        onChange={(event) => handleHexChange(event.target.value)}
        onBlur={() => setDraft(null)}
        aria-label="Colour hex code"
      />
      {draft !== null ? (
        <p className="toc-panel__hex-error">Use a 6-digit hex like #E3F2FD</p>
      ) : null}
    </div>
  )
}
