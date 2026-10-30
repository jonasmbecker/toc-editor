import { useSyncExternalStore, type CSSProperties } from 'react'
import type { NeedMixResult } from './needMix'

/** One slice of a card's need mix: a palette colour and its share (0..1). */
export interface NeedSegment {
  color: string
  share: number
}

/** Colour coding by the five needs is a display switch, on by default. */
let isOn = true
const listeners = new Set<() => void>()

export function setNeedColours(next: boolean): void {
  isOn = next
  listeners.forEach((listener) => listener())
}

export function useNeedColours(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => isOn,
  )
}

export function needSegments({ needs, mixes }: NeedMixResult, nodeId: string): NeedSegment[] {
  const mix = mixes.get(nodeId)
  if (!mix) return []
  return mix.flatMap((share, i) => (share > 0.001 ? [{ color: needs[i].color, share }] : []))
}

/** Hard-stop vertical gradient: each need's colour over its share of the stripe's height. */
export function stripeGradient(segments: NeedSegment[]): string {
  let at = 0
  const stops = segments.map(({ color, share }) => {
    const from = at
    at += share * 100
    return `${color} ${from}% ${at}%`
  })
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

/** The left-edge stripe replaces the card's dark chip; cards with no need behind them keep it. */
export function needStripeStyle(segments: NeedSegment[] | undefined, on: boolean): CSSProperties {
  if (!on || !segments || segments.length === 0) return {}
  return {
    ['--toc-card-chip' as string]: 'transparent',
    ['--toc-need-stripe' as string]: stripeGradient(segments),
  }
}
