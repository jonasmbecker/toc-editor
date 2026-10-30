import { useState } from 'react'
import { CONFIDENCE_BANDS, edgeAppearance, type ConfidenceBand } from './config'
import { EdgeSwatch } from '../panels/EdgeSwatch'
import './legend.css'

const CONFIDENCE_BAND_ORDER: ConfidenceBand[] = ['high', 'medium', 'low']

/** A value inside each band, so the row is drawn by the same function as the canvas. */
const SAMPLE_CONFIDENCE: Record<ConfidenceBand, number | undefined> = {
  high: 85,
  medium: 55,
  low: 20,
  unrated: undefined,
}

/** Every row is drawn by `EdgeSwatch` from `edgeAppearance()`, so the legend cannot show a line
 * style the canvas doesn't actually draw. Band rows carry a representative confidence; the
 * both-ways row shows its two heads. */
const ROWS = [
  ...CONFIDENCE_BAND_ORDER.map((band) => ({
    key: band,
    label: CONFIDENCE_BANDS[band].label,
    appearance: { ...edgeAppearance({ confidence: SAMPLE_CONFIDENCE[band] }), showArrow: false },
  })),
  {
    key: 'loop',
    label: 'Both ways (feedback loop)',
    appearance: edgeAppearance({ isFeedbackLoop: true }),
  },
  {
    key: 'pair',
    label: 'Paired rows, not causal',
    appearance: edgeAppearance({ provenance: 'verbatim-structure' }),
  },
]

export function Legend() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className={`toc-legend${isCollapsed ? ' toc-legend--collapsed' : ''}`}>
      <button
        type="button"
        className="toc-legend__toggle"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
      >
        Legend
        <span aria-hidden="true">{isCollapsed ? '+' : '−'}</span>
      </button>
      {isCollapsed ? null : (
        <ul>
          {ROWS.map((row) => (
            <li key={row.key}>
              <EdgeSwatch appearance={row.appearance} />
              {row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
