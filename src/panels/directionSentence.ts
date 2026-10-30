import type { Direction } from '../state/connections'

/** The line under the direction control, with the two nodes already in column order. */
export function directionSentence(direction: Direction, first: string, second: string): string {
  if (direction === 'forward') return `${first} leads to ${second}`
  if (direction === 'backward') return `${second} leads back to ${first}`
  return `${first} and ${second} reinforce each other (feedback loop)`
}
