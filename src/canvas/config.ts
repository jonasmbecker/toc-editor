import type { CSSProperties } from 'react'
import type { ConnectionProvenance } from '../model/schema'
import { isValidHexColor } from '../model/color'

/**
 * One place for the canvas's visual constants, so the confidence-band thresholds and the
 * palette are each defined once and referenced everywhere (CardNode, ConnectionEdge, Legend,
 * buildFlow). Recorded as the "canvas visual system" design decision on the canvas-render
 * slice: node card styling, section header bar, confidence-band strokes, feedback-loop and
 * pairing styles, legend.
 */

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unrated'
export type { ConnectionProvenance }

export interface BandStyle {
  /** SVG `stroke-dasharray`; omitted means solid. */
  dashArray?: string
  /** Round caps turn the low band's short dashes into dots. */
  lineCap?: 'round'
  label: string
}

/** Thresholds are an open question in the plan (ToCB's are not published); recorded here so
 * they can move without hunting through the edge-drawing code or the panel's footnote. */
export const CONFIDENCE_HIGH_MIN = 70
export const CONFIDENCE_MEDIUM_MIN = 40

export const CONFIDENCE_BANDS: Record<ConfidenceBand, BandStyle> = {
  high: { label: `High confidence (${CONFIDENCE_HIGH_MIN} to 100)` },
  medium: {
    dashArray: '7 5',
    label: `Medium confidence (${CONFIDENCE_MEDIUM_MIN} to ${CONFIDENCE_HIGH_MIN - 1})`,
  },
  low: {
    dashArray: '2 5',
    lineCap: 'round',
    label: `Low confidence (0 to ${CONFIDENCE_MEDIUM_MIN - 1})`,
  },
  unrated: { label: 'Unrated' },
}

export function bandForConfidence(confidence: number | undefined): ConfidenceBand {
  if (confidence == null) return 'unrated'
  if (confidence >= CONFIDENCE_HIGH_MIN) return 'high'
  if (confidence >= CONFIDENCE_MEDIUM_MIN) return 'medium'
  return 'low'
}

/** The sentence under the Connection Details slider. The low-band wording is
 * theoryofchangebuilder.com's own (from the screenshot the plan cites); the others are ours. */
const BAND_SENTENCES: Record<ConfidenceBand, (confidence: number) => string> = {
  high: (n) =>
    `High confidence (${n}%). This connection is well supported by evidence or direct observation.`,
  medium: (n) =>
    `Medium confidence (${n}%). This connection is plausible, but the evidence is mixed or incomplete.`,
  low: (n) =>
    `Low confidence (${n}%). This connection has limited evidence and significant uncertainty.`,
  unrated: () =>
    'Not rated yet. Drag the slider to say how sure you are. The line stays solid until you do.',
}

export function confidenceSentence(confidence: number | undefined): string {
  return BAND_SENTENCES[bandForConfidence(confidence)](confidence ?? 0)
}

export const CANVAS_COLORS = {
  edge: '#5B5A5E',
  accent: '#C2410C',
  select: '#2563EB',
  border: '#E2DED6',
  secondary: '#6B6966',
  primary: '#2F2D2E',
  background: '#F7F5F0',
  /** A one-way link back to an earlier column. */
  backward: '#8A8580',
} as const

/** Long dashes for loops and links pointing back, distinct from the confidence dashes. */
export const BACKWARD_DASH = '10 5'

export interface EdgeAppearance {
  stroke: string
  dashArray?: string
  lineCap?: 'round'
  width: number
  showArrow: boolean
  /** A both-ways connection (`isFeedbackLoop`): a head at each end. */
  bothWays: boolean
}

/**
 * The single decision tree for how a connection is drawn: both-ways connections win (accent
 * colour, heavier line, a head at each end), then an ordinary one-way edge. Both-ways and one-way edges carry the confidence
 * band's dash, so a 30% both-ways arrow is a dotted rust line. Which route an edge takes
 * (around the cards or the plain bezier) is geometry, decided in `buildFlow`, not here.
 * Shared by `buildFlow` (which needs the colour to build the edge's markers),
 * `ConnectionEdge`/`RoutedEdge` (the full style), the Legend and the panel's swatches, so none
 * of them can drift apart.
 */
export function edgeAppearance(data: {
  confidence?: number
  provenance?: ConnectionProvenance
  isFeedbackLoop?: boolean
  backward?: boolean
}): EdgeAppearance {
  const { dashArray, lineCap } = CONFIDENCE_BANDS[bandForConfidence(data.confidence)]
  // Loops and links pointing back are long-dashed (a confidence dash still wins) and lighter,
  // so what feeds what reads from the solid forward lines (Jonas, 2026-11-01).
  const back = { dashArray: dashArray ?? BACKWARD_DASH, lineCap, width: 1.4 }
  if (data.isFeedbackLoop) {
    return { ...back, stroke: CANVAS_COLORS.accent, showArrow: true, bothWays: true }
  }
  if (data.backward) {
    return { ...back, stroke: CANVAS_COLORS.backward, showArrow: true, bothWays: false }
  }
  return {
    stroke: CANVAS_COLORS.edge,
    dashArray,
    lineCap,
    width: 1.6,
    showArrow: true,
    bothWays: false,
  }
}

/** Opacity of a link off every path through the selected card. */
export const OFF_PATH_OPACITY = 0.12

/** Stroke colour, width and opacity of a drawn link: the selection colour when picked, the
 * tint (skip-link or layer colour) otherwise; with a card selected, links on its paths are drawn
 * heavier and the rest fade back. Shared by both edge components. */
export function edgeStroke(
  data: { tint?: string; emphasis?: 'on' | 'off' } | undefined,
  appearance: EdgeAppearance,
  selected: boolean | undefined,
): { stroke: string; width: number; opacity: number } {
  const width = data?.tint ? 2 : appearance.width
  return {
    stroke: selected ? CANVAS_COLORS.select : (data?.tint ?? appearance.stroke),
    width: selected || data?.emphasis === 'on' ? width + 1 : width,
    opacity: data?.emphasis === 'off' ? OFF_PATH_OPACITY : 1,
  }
}

/** Inline style for anything painted in a node's colour (the card, the panel's end cards): the
 * fill plus the `--toc-card-chip` variable its left-edge chip reads. Guarded so a colour that
 * slipped past the schema can never reach an inline style as anything but a hex. */
export function nodeColorStyle(color: string): CSSProperties {
  const background = isValidHexColor(color) ? color : CANVAS_COLORS.background
  return { background, ['--toc-card-chip' as string]: darken(color) }
}

/** Darkens a `#rrggbb` hex colour for the card's left-edge chip, so the chip reads as the
 * card's own colour family rather than an arbitrary accent. The schema already constrains
 * `color` to 6-digit hex, but `darken` is cheap to make total on its own rather than trust
 * every future caller to have parsed through that schema first. */
export function darken(hex: string, factor = 0.55): string {
  if (!isValidHexColor(hex)) return CANVAS_COLORS.secondary
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `rgb(${r}, ${g}, ${b})`
}
