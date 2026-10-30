import type { CSSProperties } from 'react'
import type { NeedMixResult } from './needMix'

/** One slice of a card's need mix: a palette colour and its share (0..1). */
export interface NeedSegment {
  color: string
  share: number
}

export type NeedLook = 'tint' | 'bar' | 'stripe' | 'off'

/** Mock switch: ?needlook=tint|bar|stripe|off. */
export function currentNeedLook(): NeedLook {
  const value = new URLSearchParams(window.location.search).get('needlook')
  return value === 'tint' || value === 'bar' || value === 'off' ? value : 'stripe'
}

export function needSegments({ needs, mixes }: NeedMixResult, nodeId: string): NeedSegment[] {
  const mix = mixes.get(nodeId)
  if (!mix) return []
  return mix.flatMap((share, i) => (share > 0.001 ? [{ color: needs[i].color, share }] : []))
}

/** Hard-stop linear gradient from the segments, left-to-right or top-to-bottom. */
export function gradientOf(segments: NeedSegment[], direction: string, alpha = ''): string {
  let at = 0
  const stops = segments.map(({ color, share }) => {
    const from = at
    at += share * 100
    return `${color}${alpha} ${from}% ${at}%`
  })
  return `linear-gradient(${direction}, ${stops.join(', ')})`
}

export function needLookStyle(segments: NeedSegment[] | undefined): CSSProperties {
  const look = currentNeedLook()
  if (!segments || segments.length === 0 || look === 'off') return {}
  if (look === 'tint') {
    // Blend of the needs at 22% over the card's own fill.
    return { backgroundImage: gradientOf(segments, 'to right', '38') }
  }
  if (look === 'stripe') {
    return {
      ['--toc-card-chip' as string]: 'transparent',
      ['--toc-need-stripe' as string]: gradientOf(segments, 'to bottom'),
    }
  }
  return {}
}

/** Split bar along the top of the card (bar look only). */
export function NeedBar({ segments }: { segments: NeedSegment[] | undefined }) {
  if (currentNeedLook() !== 'bar' || !segments || segments.length === 0) return null
  return (
    <div className="toc-card__need-bar" style={{ background: gradientOf(segments, 'to right') }} />
  )
}
