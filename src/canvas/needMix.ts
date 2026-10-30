import type { ToCDocument } from '../model/schema'

/**
 * Colour coding by the five needs (display only, never written into a document).
 *
 * The needs are the cards of the first column of the first section (Daniel Brown's five). A
 * card in the next column of that section is the same need seen through NARM, so it takes the
 * seed of the card level with it. Every card further right gets a mix: the average of the mixes
 * of the cards with an arrow into it, so a card fed by two strategies that stem from different
 * needs shows both. Only forward arrows (into a later column, or down the same column) are followed, which keeps the
 * trace free of cycles, so feedback loops never change a colour.
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
  targets: string[]
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
          targets: node.connections.map((connection) => connection.targetId),
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

function average(mixes: NeedMix[], size: number): NeedMix {
  const sum = new Array<number>(size).fill(0)
  for (const mix of mixes) mix.forEach((share, i) => (sum[i] += share / mixes.length))
  return sum
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
  const mixes = new Map<string, NeedMix>()
  needCards.forEach((card, i) => mixes.set(card.id, unit(i, needs.length)))
  for (const card of placed.filter((p) => p.section === 0 && p.column === 1)) {
    const mate = needCards.findIndex((need) => need.yPosition === card.yPosition)
    if (mate >= 0) mixes.set(card.id, unit(mate, needs.length))
  }

  const byId = new Map(placed.map((p) => [p.id, p]))
  const incoming = new Map<string, string[]>()
  for (const source of placed) {
    for (const targetId of source.targets) {
      const target = byId.get(targetId)
      if (!target || !isForward(source, target)) continue
      incoming.set(targetId, [...(incoming.get(targetId) ?? []), source.id])
    }
  }

  const ordered = [...placed].sort((a, b) => a.rank - b.rank || a.yPosition - b.yPosition)
  for (const node of ordered) {
    if (mixes.has(node.id)) continue
    const parents = (incoming.get(node.id) ?? [])
      .map((id) => mixes.get(id))
      .filter((mix): mix is NeedMix => !!mix)
    if (parents.length > 0) mixes.set(node.id, average(parents, needs.length))
  }
  // A card in a group with no arrow of its own takes the group's mix.
  for (const node of ordered) {
    const groupMix = node.groupId ? mixes.get(node.groupId) : undefined
    if (!mixes.has(node.id) && groupMix) mixes.set(node.id, groupMix)
  }
  return { needs, mixes }
}
