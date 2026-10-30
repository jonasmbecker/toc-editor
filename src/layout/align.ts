import type { DocumentNode, ToCDocument } from '../model/schema'
import { CARD_ANCHOR_Y, GROUP_ANCHOR_Y } from '../canvas/anchors'
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
const SWEEPS = 40
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
  /** Connection anchor height of each node that connections can attach to, relative to the unit's top. */
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
    anchors: new Map([[node.id, CARD_ANCHOR_Y]]),
  }
}

function groupUnit(group: DocumentNode, members: DocumentNode[], opts: AlignOptions): Unit {
  const slots: Slot[] = []
  const anchors = new Map<string, number>()
  let cursor = GROUP_HEAD
  for (const member of members) {
    const height = opts.heights?.get(member.id) ?? DEFAULT_CARD_HEIGHT
    slots.push({ id: member.id, top: cursor })
    anchors.set(member.id, cursor + CARD_ANCHOR_Y)
    cursor += height + MEMBER_GAP
  }
  const height = cursor - MEMBER_GAP + GROUP_PAD
  anchors.set(group.id, GROUP_ANCHOR_Y)
  return { id: group.id, top: members[0].yPosition - GROUP_HEAD, height, slots, anchors }
}

function columnUnits(nodes: DocumentNode[], opts: AlignOptions): Unit[] {
  const groups = nodes.filter(isGroupNode)
  const groupIds = new Set(groups.map((g) => g.id))
  const byY = (a: DocumentNode, b: DocumentNode) => a.yPosition - b.yPosition
  const units: Unit[] = []
  const order = new Map<string, number>()
  nodes.forEach((n, i) => {
    if (!order.has(n.id)) order.set(n.id, i)
    if (n.groupId && !order.has(n.groupId)) order.set(n.groupId, i)
  })
  for (const group of groups) {
    const members = nodes.filter((n) => n.groupId === group.id && !isGroupNode(n)).sort(byY)
    if (members.length > 0) units.push(groupUnit(group, members, opts))
  }
  const loose = nodes.filter((n) => !isGroupNode(n) && !(n.groupId && groupIds.has(n.groupId)))
  for (const node of loose) units.push(cardUnit(node, opts.heights))
  return units.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
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
  // The median, not the mean: with a fan-out the line to the middle neighbour stays dead straight
  // instead of every line leaning a little.
  const wishes = links.map((link) => link.other.top + link.theirs - link.mine).sort((a, b) => a - b)
  const middle = wishes.length >> 1
  return wishes.length % 2 === 1 ? wishes[middle] : (wishes[middle - 1] + wishes[middle]) / 2
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
  const ordered = [...units].sort((a, b) => desired.get(a)! - desired.get(b)! || a.top - b.top)
  resolveOrder(ordered, desired, gap)
}

function sweep(columns: Unit[][], links: Map<Unit, Link[]>, gap: number, pass: number): void {
  const indexes = columns.map((_, index) => index)
  for (const index of pass % 2 === 0 ? indexes : indexes.reverse()) {
    placeColumn(columns[index], links, gap)
  }
}

interface Edge {
  from: Unit
  fromAnchor: number
  to: Unit
  toAnchor: number
  /** Index of the column pair the edge spans, so only edges between the same two columns can cross. */
  span: string
}

function buildEdges(columns: Unit[][], links: Map<Unit, Link[]>): Edge[] {
  const columnOf = new Map<Unit, number>()
  columns.forEach((units, index) => units.forEach((unit) => columnOf.set(unit, index)))
  const edges: Edge[] = []
  for (const [unit, list] of links) {
    for (const link of list) {
      const [a, b] = [columnOf.get(unit)!, columnOf.get(link.other)!]
      if (a >= b) continue
      edges.push({
        from: unit,
        fromAnchor: link.mine,
        to: link.other,
        toAnchor: link.theirs,
        span: `${a}:${b}`,
      })
    }
  }
  return edges
}

const CROSSING_COST = 200

function countCrossings(group: Edge[]): number {
  let crossings = 0
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const [p, q] = [group[i], group[j]]
      const left = p.from.top + p.fromAnchor - (q.from.top + q.fromAnchor)
      const right = p.to.top + p.toAnchor - (q.to.top + q.toAnchor)
      if (left * right < 0) crossings++
    }
  }
  return crossings
}

/** What Tidy shrinks: every crossing counts heavily, then the total vertical distance between
 * the two ends of each connection. */
function skew(edges: Edge[]): number {
  let total = 0
  const bySpan = new Map<string, Edge[]>()
  for (const edge of edges) {
    total += Math.abs(edge.from.top + edge.fromAnchor - (edge.to.top + edge.toAnchor))
    bySpan.set(edge.span, [...(bySpan.get(edge.span) ?? []), edge])
  }
  for (const group of bySpan.values()) total += CROSSING_COST * countCrossings(group)
  return total
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
  const units = columns.flat()
  const edges = buildEdges(columns, links)
  // Start from a canonical stack (document order, no gaps beyond TIDY_GAP) so the result depends
  // only on the diagram's structure, never on where the cards happen to sit: pressing Tidy again
  // gives the same layout. The sweeps can swing between neighbouring orders, so the least skewed
  // layout seen is the one kept.
  for (const column of columns) {
    let cursor = 0
    for (const unit of column) {
      unit.top = cursor
      cursor += unit.height + gap
    }
  }
  let best = units.map((unit) => unit.top)
  let bestCost = skew(edges)
  for (let pass = 0; pass < SWEEPS; pass++) {
    sweep(columns, links, gap, pass)
    for (const unit of units) unit.top = snapToGrid(unit.top)
    const cost = skew(edges)
    if (cost < bestCost) {
      bestCost = cost
      best = units.map((unit) => unit.top)
    }
  }
  units.forEach((unit, i) => (unit.top = best[i]))
  const positions = collectPositions(columns)
  return mapAllNodes(doc, (node) => {
    const y = positions.get(node.id)
    return y === undefined || y === node.yPosition ? node : { ...node, yPosition: y }
  })
}
