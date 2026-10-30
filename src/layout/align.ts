import type { DocumentNode, ToCDocument } from '../model/schema'
import { GROUP_HEAD, GROUP_PAD } from '../canvas/groupFlow'
import { isGroupNode } from '../state/groups'
import { mapAllNodes } from '../state/tree'

/**
 * "Tidy layout": moves cards vertically inside their columns so connections run nearly straight.
 * Only `yPosition` changes (x is derived, never stored). The work is a few barycentre sweeps over
 * the columns: each column is ordered by where its cards' neighbours sit, then every card is put
 * level with the mean of its neighbours, pushed apart just enough to clear the column gap.
 * A group and its cards move as one unit, the cards staying in their order.
 */

/** Card height assumed when the caller has no measured one. */
export const DEFAULT_CARD_HEIGHT = 100
export const TIDY_GAP = 24
const MEMBER_GAP = 16
const SWEEPS = 4
const GRID = 8

export interface AlignOptions {
  /** Measured card heights by node id; cards without an entry use DEFAULT_CARD_HEIGHT. */
  heights?: ReadonlyMap<string, number>
  gap?: number
}

interface Slot {
  id: string
  /** Offset of the card's top from the unit's top. */
  top: number
}

/** One thing that moves as a block: a plain card, or a group with its cards. */
interface Unit {
  id: string
  top: number
  height: number
  slots: Slot[]
  /** Centre height of each node that connections can attach to, relative to the unit's top. */
  anchors: Map<string, number>
}

interface Link {
  other: Unit
  mine: number
  theirs: number
}

function cardUnit(node: DocumentNode, heights: AlignOptions['heights']): Unit {
  const height = heights?.get(node.id) ?? DEFAULT_CARD_HEIGHT
  return {
    id: node.id,
    top: node.yPosition,
    height,
    slots: [{ id: node.id, top: 0 }],
    anchors: new Map([[node.id, height / 2]]),
  }
}

function groupUnit(group: DocumentNode, members: DocumentNode[], opts: AlignOptions): Unit {
  const slots: Slot[] = []
  const anchors = new Map<string, number>()
  let cursor = GROUP_HEAD
  for (const member of members) {
    const height = opts.heights?.get(member.id) ?? DEFAULT_CARD_HEIGHT
    slots.push({ id: member.id, top: cursor })
    anchors.set(member.id, cursor + height / 2)
    cursor += height + MEMBER_GAP
  }
  const height = cursor - MEMBER_GAP + GROUP_PAD
  anchors.set(group.id, height / 2)
  return { id: group.id, top: members[0].yPosition - GROUP_HEAD, height, slots, anchors }
}

function columnUnits(nodes: DocumentNode[], opts: AlignOptions): Unit[] {
  const groups = nodes.filter(isGroupNode)
  const groupIds = new Set(groups.map((g) => g.id))
  const byY = (a: DocumentNode, b: DocumentNode) => a.yPosition - b.yPosition
  const units: Unit[] = []
  for (const group of groups) {
    const members = nodes.filter((n) => n.groupId === group.id && !isGroupNode(n)).sort(byY)
    if (members.length > 0) units.push(groupUnit(group, members, opts))
  }
  const loose = nodes.filter((n) => !isGroupNode(n) && !(n.groupId && groupIds.has(n.groupId)))
  for (const node of loose) units.push(cardUnit(node, opts.heights))
  return units.sort((a, b) => a.top - b.top)
}

function buildColumns(doc: ToCDocument, opts: AlignOptions): Unit[][] {
  const columns = doc.sections.flatMap((section) => section.columns)
  return columns.map((column) => columnUnits(column.nodes, opts))
}

/** For every unit, the connections that tie it to a card in another column (both directions). */
function buildLinks(doc: ToCDocument, columns: Unit[][]): Map<Unit, Link[]> {
  const unitOf = new Map<string, Unit>()
  const columnOf = new Map<Unit, number>()
  columns.forEach((units, index) => {
    for (const unit of units) {
      columnOf.set(unit, index)
      for (const id of unit.anchors.keys()) unitOf.set(id, unit)
    }
  })
  const links = new Map<Unit, Link[]>()
  const add = (unit: Unit, link: Link) => links.set(unit, [...(links.get(unit) ?? []), link])
  for (const node of doc.sections.flatMap((s) => s.columns.flatMap((c) => c.nodes))) {
    const from = unitOf.get(node.id)
    for (const connection of node.connections) {
      const to = unitOf.get(connection.targetId)
      if (!from || !to || columnOf.get(from) === columnOf.get(to)) continue
      const mine = from.anchors.get(node.id)!
      const theirs = to.anchors.get(connection.targetId)!
      add(from, { other: to, mine, theirs })
      add(to, { other: from, mine: theirs, theirs: mine })
    }
  }
  return links
}

function desiredTop(unit: Unit, links: Link[] | undefined): number {
  if (!links || links.length === 0) return unit.top
  let sum = 0
  for (const link of links) sum += link.other.top + link.theirs - link.mine
  return sum / links.length
}

interface Block {
  units: Unit[]
  /** Sum over its units of (desired top - offset within the block); mean is the optimal top. */
  sum: number
  height: number
  top: number
}

function newBlock(unit: Unit, desired: number): Block {
  return { units: [unit], sum: desired, height: unit.height, top: desired }
}

function mergeBlocks(upper: Block, lower: Block, gap: number): Block {
  const shift = upper.height + gap
  const units = [...upper.units, ...lower.units]
  const sum = upper.sum + lower.sum - lower.units.length * shift
  return { units, sum, height: shift + lower.height, top: sum / units.length }
}

/** Places the units in the given order, each as close to its desired top as the order and the
 * gap allow: units that would overlap are merged into a block that sits at the mean of their
 * wishes. */
function resolveOrder(ordered: Unit[], desired: Map<Unit, number>, gap: number): void {
  const blocks: Block[] = []
  for (const unit of ordered) {
    let block = newBlock(unit, desired.get(unit)!)
    let previous = blocks[blocks.length - 1]
    while (previous && previous.top + previous.height + gap > block.top) {
      blocks.pop()
      block = mergeBlocks(previous, block, gap)
      previous = blocks[blocks.length - 1]
    }
    blocks.push(block)
  }
  for (const block of blocks) {
    let cursor = block.top
    for (const unit of block.units) {
      unit.top = cursor
      cursor += unit.height + gap
    }
  }
}

function placeColumn(units: Unit[], links: Map<Unit, Link[]>, gap: number): void {
  const desired = new Map(units.map((unit) => [unit, desiredTop(unit, links.get(unit))]))
  const centre = (unit: Unit) => desired.get(unit)! + unit.height / 2
  const ordered = [...units].sort((a, b) => centre(a) - centre(b) || a.top - b.top)
  resolveOrder(ordered, desired, gap)
}

function sweep(columns: Unit[][], links: Map<Unit, Link[]>, gap: number, pass: number): void {
  const indexes = columns.map((_, index) => index)
  for (const index of pass % 2 === 0 ? indexes : indexes.reverse()) {
    placeColumn(columns[index], links, gap)
  }
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID
}

/** Final yPosition per node id, the whole diagram lifted so its highest unit sits at 0. */
function collectPositions(columns: Unit[][]): Map<string, number> {
  const units = columns.flat()
  let lift = Infinity
  for (const unit of units) lift = Math.min(lift, unit.top)
  const positions = new Map<string, number>()
  for (const unit of units) {
    const top = unit.top - (Number.isFinite(lift) ? lift : 0)
    for (const slot of unit.slots) positions.set(slot.id, snapToGrid(top + slot.top))
    if (unit.slots[0].id !== unit.id) positions.set(unit.id, positions.get(unit.slots[0].id)!)
  }
  return positions
}

/**
 * Returns the document with every card's `yPosition` set so connections run as straight as the
 * columns allow, without overlaps. Same document back (by reference) when nothing moves, so a
 * repeat call records no undo step.
 */
export function alignDocument(doc: ToCDocument, options: AlignOptions = {}): ToCDocument {
  const gap = options.gap ?? TIDY_GAP
  const columns = buildColumns(doc, options)
  const links = buildLinks(doc, columns)
  for (let pass = 0; pass < SWEEPS; pass++) sweep(columns, links, gap, pass)
  const positions = collectPositions(columns)
  return mapAllNodes(doc, (node) => {
    const y = positions.get(node.id)
    return y === undefined || y === node.yPosition ? node : { ...node, yPosition: y }
  })
}
