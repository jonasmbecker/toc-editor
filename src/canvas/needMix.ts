import type { ToCDocument } from '../model/schema'

/**
 * Colour coding by the five needs (display only, never written into a document).
 *
 * The needs are the cards of the first column of the first section (Daniel Brown's five). A
 * card in the next column of that section is the same need seen through NARM, so it takes the
 * seed of the card level with it. Every card further right gets a mix: the average of the mixes
 * of the cards with an arrow into it, weighted by each arrow's confidence, so a card fed by two
 * strategies that stem from different needs shows both. Only forward arrows (into a later
 * column, or down the same column) are followed, which keeps the trace free of cycles, so
 * feedback loops never change a colour. A grouped card with no arrow of its own takes its
 * group's mix.
 */

/** Okabe-Ito colours, chosen to stay apart for the common kinds of colour blindness. */
export const NEED_PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#F0E442'] as const

/** Share of each need in a card, by need index; shares sum to 1. */
export type NeedMix = number[]

export interface NeedMixResult {
  /** The need cards, in palette order. */
  needs: { id: string; title: string; color: string }[]
  /** Mix per node id; a node with no path back to a need is absent. */
  mixes: Map<string, NeedMix>
}

interface Placed {
  id: string
  title: string
  yPosition: number
  rank: number
  section: number
  column: number
  groupId?: string
  targets: { id: string; weight: number }[]
}

/** How strongly an arrow carries its source's needs: its confidence, with a floor so a
 * 0% arrow still shows a trace, and unrated arrows counting as medium. */
function arrowWeight(confidence: number | undefined): number {
  return Math.max(confidence ?? 50, 5) / 100
}

function placeNodes(doc: ToCDocument): Placed[] {
  const placed: Placed[] = []
  doc.sections.forEach((section, s) =>
    section.columns.forEach((column, c) =>
      column.nodes.forEach((node) =>
        placed.push({
          id: node.id,
          title: node.title,
          yPosition: node.yPosition,
          rank: s * 1000 + c,
          section: s,
          column: c,
          groupId: node.groupId,
          targets: node.connections.map((connection) => ({
            id: connection.targetId,
            weight: arrowWeight(connection.confidence),
          })),
        }),
      ),
    ),
  )
  return placed
}

/** An arrow into a later column, or down a column; both keep the trace free of cycles. */
function isForward(source: Placed, target: Placed): boolean {
  return (
    target.rank > source.rank ||
    (target.rank === source.rank && target.yPosition > source.yPosition)
  )
}

function unit(index: number, size: number): NeedMix {
  return Array.from({ length: size }, (_, i) => (i === index ? 1 : 0))
}

function weightedAverage(parents: { mix: NeedMix; weight: number }[], size: number): NeedMix {
  const total = parents.reduce((sum, parent) => sum + parent.weight, 0)
  const result = new Array<number>(size).fill(0)
  for (const { mix, weight } of parents)
    mix.forEach((share, i) => (result[i] += (share * weight) / total))
  return result
}

type Incoming = Map<string, { id: string; weight: number }[]>

/** Each need card gets its own colour; a NARM card level with one takes that need's colour. */
function seedMixes(placed: Placed[], needCards: Placed[]): Map<string, NeedMix> {
  const mixes = new Map<string, NeedMix>()
  needCards.forEach((card, i) => mixes.set(card.id, unit(i, needCards.length)))
  for (const card of placed.filter((p) => p.section === 0 && p.column === 1)) {
    const mate = needCards.findIndex((need) => need.yPosition === card.yPosition)
    if (mate >= 0) mixes.set(card.id, unit(mate, needCards.length))
  }
  return mixes
}

function forwardArrowsInto(placed: Placed[]): Incoming {
  const byId = new Map(placed.map((p) => [p.id, p]))
  const incoming: Incoming = new Map()
  for (const source of placed) {
    for (const { id: targetId, weight } of source.targets) {
      const target = byId.get(targetId)
      if (!target || !isForward(source, target)) continue
      incoming.set(targetId, [...(incoming.get(targetId) ?? []), { id: source.id, weight }])
    }
  }
  return incoming
}

function mixFor(node: Placed, incoming: Incoming, mixes: Map<string, NeedMix>, size: number) {
  const parents = (incoming.get(node.id) ?? []).flatMap(({ id, weight }) => {
    const mix = mixes.get(id)
    return mix ? [{ mix, weight }] : []
  })
  if (parents.length > 0) return weightedAverage(parents, size)
  return node.groupId ? mixes.get(node.groupId) : undefined
}

/** Left to right; within a column, group members after the group they inherit from. */
function traceOrder(placed: Placed[]): Placed[] {
  const grouped = (p: Placed) => Number(p.groupId !== undefined)
  return [...placed].sort(
    (a, b) => a.rank - b.rank || grouped(a) - grouped(b) || a.yPosition - b.yPosition,
  )
}

export function computeNeedMixes(doc: ToCDocument): NeedMixResult {
  const empty: NeedMixResult = { needs: [], mixes: new Map() }
  if (doc.diagramType !== 'status-quo') return empty
  const placed = placeNodes(doc)
  const needCards = placed.filter((p) => p.rank === 0).sort((a, b) => a.yPosition - b.yPosition)
  if (needCards.length < 2 || needCards.length > NEED_PALETTE.length) return empty

  const needs = needCards.map((card, i) => ({
    id: card.id,
    title: card.title,
    color: NEED_PALETTE[i],
  }))
  const mixes = seedMixes(placed, needCards)
  const incoming = forwardArrowsInto(placed)
  for (const node of traceOrder(placed)) {
    if (mixes.has(node.id)) continue
    const mix = mixFor(node, incoming, mixes, needs.length)
    if (mix) mixes.set(node.id, mix)
  }
  return { needs, mixes }
}
