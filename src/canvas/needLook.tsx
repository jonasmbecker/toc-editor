import { useSyncExternalStore, type CSSProperties } from 'react'
import type { NeedMixResult } from './needMix'

/** One slice of a card's need mix: a palette colour and its share (0..1). */
export interface NeedSegment {
  color: string
  share: number
}

export type NeedLook = 'tint' | 'bar' | 'stripe' | 'off'

const LOOKS: NeedLook[] = ['off', 'bar', 'stripe', 'tint']
const LOOK_LABELS: Record<NeedLook, string> = {
  off: 'Off',
  bar: 'Bar',
  stripe: 'Stripe',
  tint: 'Tint',
}

function initialLook(): NeedLook {
  const value = new URLSearchParams(window.location.search).get('needlook')
  return LOOKS.includes(value as NeedLook) ? (value as NeedLook) : 'bar'
}

let look: NeedLook = initialLook()
const listeners = new Set<() => void>()

export function setNeedLook(next: NeedLook): void {
  look = next
  listeners.forEach((listener) => listener())
}

export function useNeedLook(): NeedLook {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => look,
  )
}

/** Canvas switch between the three looks and off. */
export function NeedLookSwitch() {
  const current = useNeedLook()
  return (
    <div className="toc-need-switch" role="group" aria-label="Colour by needs">
      <span>Needs</span>
      {LOOKS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={current === option}
          onClick={() => setNeedLook(option)}
        >
          {LOOK_LABELS[option]}
        </button>
      ))}
    </div>
  )
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

export function needLookStyle(segments: NeedSegment[] | undefined, look: NeedLook): CSSProperties {
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
export function NeedBar({
  segments,
  look,
}: {
  segments: NeedSegment[] | undefined
  look: NeedLook
}) {
  if (look !== 'bar' || !segments || segments.length === 0) return null
  return (
    <div className="toc-card__need-bar" style={{ background: gradientOf(segments, 'to right') }} />
  )
}
