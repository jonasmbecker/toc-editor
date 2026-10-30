import type { EdgeAppearance } from '../canvas/config'

/** A 40x12 preview of how an edge is drawn (stroke, dash, head or heads), from the same
 * `edgeAppearance()` the canvas uses, so the panel and legend can never show a style the canvas
 * doesn't. */
export function EdgeSwatch({ appearance }: { appearance: EdgeAppearance }) {
  const { stroke, width, dashArray, lineCap, showArrow, bothWays } = appearance
  return (
    <svg viewBox="0 0 40 12" className="toc-swatch-line" aria-hidden="true">
      <line
        x1={bothWays ? 7 : 0}
        y1={6}
        x2={showArrow ? 33 : 40}
        y2={6}
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dashArray}
        strokeLinecap={lineCap}
      />
      {showArrow ? <path d="M33,2 L40,6 L33,10 z" fill={stroke} /> : null}
      {bothWays ? <path d="M7,2 L0,6 L7,10 z" fill={stroke} /> : null}
    </svg>
  )
}
