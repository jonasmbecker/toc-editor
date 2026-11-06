import type { ToCDocument } from '../model/schema'
import { isGroupNode, membersOf } from '../state/groups'
import { allNodes } from '../state/tree'
import type { GroupNodeData, GroupNodeType } from './GroupNode'

/** Room around a group's cards: sides and bottom, and the strip above the first card that holds
 * the group's title and description. Layout choices, not part of the document format. */
export const GROUP_PAD = 12
export const GROUP_HEAD = 64
/** Room around a free-canvas region's cards, and above them for its title. */
export const REGION_PAD = 32
export const REGION_HEAD = 48
/** Room under a band's lowest card. */
export const BAND_BOTTOM_PAD = 24
/** Card height assumed until React Flow has measured the real one (see `fitGroupHeights`). */
const ESTIMATED_CARD_HEIGHT = 96

export interface Box {
  x: number
  y: number
  width: number
}

type PositionById = Map<string, Box>

/** One container per group, sized to its members' derived positions. x, width and top come
 * from layout; the bottom is estimated here and refined from measured card heights. */
export function buildGroupNodes(doc: ToCDocument, positions: PositionById): GroupNodeType[] {
  const nodes: GroupNodeType[] = []
  for (const group of allNodes(doc).filter(isGroupNode)) {
    const members = membersOf(doc, group.id)
    const boxes = members.map((m) => positions.get(m.id)).filter((b): b is Box => !!b)
    if (boxes.length === 0) continue
    const top = Math.min(...boxes.map((b) => b.y)) - GROUP_HEAD
    const left = Math.min(...boxes.map((b) => b.x))
    const bottom = Math.max(...boxes.map((b) => b.y)) + ESTIMATED_CARD_HEIGHT
    nodes.push({
      id: group.id,
      type: 'group',
      position: { x: left - GROUP_PAD, y: top },
      // Right edge of the furthest card, not the widest card: on a free canvas members can sit
      // side by side. In a column they share one x, so this is the widest card as before.
      width: Math.max(...boxes.map((b) => b.x + b.width)) - left + GROUP_PAD * 2,
      height: bottom - top + GROUP_PAD,
      // Only the title strip drags the group, so cards inside it keep their own drags. No
      // `draggable` here: it would override the canvas-wide read-only switch.
      dragHandle: '.toc-group__head',
      zIndex: -1,
      data: {
        title: group.title,
        text: group.text,
        color: group.color,
        memberIds: members.map((m) => m.id),
      } satisfies GroupNodeData,
    })
  }
  return nodes
}

/** The container's geometry as a position entry, so an edge to or from a group routes like
 * one to a card. */
export function groupBox(node: GroupNodeType): Box {
  return { x: node.position.x, y: node.position.y, width: node.width ?? 0 }
}

interface Sized {
  id: string
  type?: string
  position: { x: number; y: number }
  height?: number
  measured?: { width?: number; height?: number }
  data: unknown
}

/** Stretches each group's container to the bottom of its lowest card once the cards have been
 * measured. Returns the same array when nothing changes, so it can run on every measurement
 * without looping. */
export function fitGroupHeights<T extends Sized>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let changed = false
  const next = nodes.map((node) => {
    // A band section's strip is fitted to its cards the same way (see `BandNode`).
    if (node.type !== 'group' && node.type !== 'band' && node.type !== 'region') return node
    const { memberIds } = node.data as GroupNodeData
    let bottom = -Infinity
    for (const id of memberIds) {
      const member = byId.get(id)
      if (!member) continue
      const height = member.measured?.height ?? ESTIMATED_CARD_HEIGHT
      bottom = Math.max(bottom, member.position.y + height)
    }
    if (bottom === -Infinity) return node
    const pad =
      node.type === 'band' ? BAND_BOTTOM_PAD : node.type === 'region' ? REGION_PAD : GROUP_PAD
    const height = Math.round(bottom - node.position.y + pad)
    if (node.height === height) return node
    changed = true
    return { ...node, height }
  })
  return changed ? next : nodes
}
