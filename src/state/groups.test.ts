import { describe, expect, it } from 'vitest'
import { GROUP_KIND, parseDocument } from '../model/schema'
import { toCompatibleJson, toFullJson } from '../files/export'
import { importFromJson } from '../files/import'
import { makeDocument, makeNode } from '../test/fixtures'
import { buildFlow } from '../canvas/buildFlow'
import { addConnection } from './connections'
import {
  addToGroup,
  createGroup,
  dissolveGroup,
  flattenGroups,
  isGroupNode,
  moveGroup,
  membersOf,
  normalizeGroups,
  removeFromGroup,
} from './groups'
import { deleteNode, moveNodeToColumn, updateNode } from './nodes'
import { useToCStore } from './store'
import { allNodes, findNodeLocation as nodeLocation, nodeAt } from './tree'

const conn = (targetId: string) => ({ targetId, confidence: 50, assumptions: '', evidence: '' })

/** The acceptance example: three traps in one column, a war in the next. */
function traps() {
  return makeDocument(
    [
      makeNode('race-to-bottom', [], { yPosition: 0 }),
      makeNode('race-to-market', [], { yPosition: 100 }),
      makeNode('arms-race', [conn('great-power-war')], { yPosition: 200 }),
      makeNode('solo', [], { yPosition: 300 }),
    ],
    [makeNode('great-power-war', [], { yPosition: 0 })],
  )
}

function grouped() {
  const made = createGroup(
    traps(),
    ['race-to-bottom', 'race-to-market', 'arms-race'],
    'Multipolar traps',
  )
  if (!made) throw new Error('group not created')
  return made
}

describe('createGroup', () => {
  it('makes a titled group node and tags its members', () => {
    const { document, groupId } = grouped()
    const group = nodeAt(document, groupId)!
    expect(isGroupNode(group)).toBe(true)
    expect(group.kind).toBe(GROUP_KIND)
    expect(group.title).toBe('Multipolar traps')
    expect(membersOf(document, groupId).map((n) => n.id)).toEqual([
      'race-to-bottom',
      'race-to-market',
      'arms-race',
    ])
    expect(nodeAt(document, 'solo')!.groupId).toBeUndefined()
  })

  it('refuses cards from different columns, a single card and already grouped cards', () => {
    expect(createGroup(traps(), ['race-to-bottom', 'great-power-war'])).toBeNull()
    expect(createGroup(traps(), ['race-to-bottom'])).toBeNull()
    const { document } = grouped()
    expect(createGroup(document, ['solo', 'race-to-bottom'])).toBeNull()
  })

  it('keeps each member description and lets a card join afterwards', () => {
    const doc = traps()
    const described = {
      ...doc,
      sections: [
        {
          ...doc.sections[0],
          columns: [
            {
              nodes: doc.sections[0].columns[0].nodes.map((n) => ({ ...n, text: `about ${n.id}` })),
            },
          ],
        },
        doc.sections[1],
      ],
    }
    const made = createGroup(described, ['race-to-bottom', 'race-to-market'])!
    const joined = addToGroup(made.document, 'arms-race', made.groupId)
    expect(membersOf(joined, made.groupId)).toHaveLength(3)
    expect(nodeAt(joined, 'arms-race')!.text).toBe('about arms-race')
  })
})

describe('connections to a group or one card', () => {
  it('lets an arrow target the whole group and one sub-card', () => {
    const { document, groupId } = grouped()
    const toGroup = addConnection(document, 'great-power-war', groupId)
    expect(toGroup.ok).toBe(true)
    const toCard = addConnection(document, 'great-power-war', 'race-to-market')
    expect(toCard.ok).toBe(true)
    // The existing Arms race -> Great power war arrow still starts at the card.
    expect(nodeAt(document, 'arms-race')!.connections[0].targetId).toBe('great-power-war')
  })

  it('refuses an arrow between a group and its own card', () => {
    const { document, groupId } = grouped()
    expect(addConnection(document, groupId, 'arms-race')).toEqual({
      ok: false,
      refused: 'same-group',
    })
    expect(addConnection(document, 'arms-race', groupId)).toEqual({
      ok: false,
      refused: 'same-group',
    })
  })

  it('draws a container around the cards and routes edges to it', () => {
    const { document, groupId } = grouped()
    const withArrow = addConnection(document, 'great-power-war', groupId)
    if (!withArrow.ok) throw new Error('refused')
    const flow = buildFlow(withArrow.document)
    const container = flow.nodes.find((n) => n.id === groupId)
    expect(container?.type).toBe('group')
    expect(flow.nodes.filter((n) => n.type === 'card')).toHaveLength(5)
    expect(flow.edges.some((e) => e.source === 'great-power-war' && e.target === groupId)).toBe(
      true,
    )
    expect(flow.droppedConnections).toEqual([])
  })
})

describe('keeping groups valid', () => {
  it('dissolves a group that falls below two cards, moving arrows to the first card', () => {
    const { document, groupId } = createGroup(traps(), ['race-to-bottom', 'race-to-market'])!
    const withArrow = addConnection(document, 'great-power-war', groupId)
    if (!withArrow.ok) throw new Error('refused')
    const afterDelete = deleteNode(withArrow.document, 'race-to-market')
    expect(nodeAt(afterDelete, groupId)).toBeNull()
    expect(nodeAt(afterDelete, 'race-to-bottom')!.groupId).toBeUndefined()
    expect(nodeAt(afterDelete, 'great-power-war')!.connections[0].targetId).toBe('race-to-bottom')
  })

  it('takes a card out of the group when it moves to another column', () => {
    const { document, groupId } = grouped()
    const moved = moveNodeToColumn(document, 'arms-race', 1, 0)
    expect(nodeAt(moved, 'arms-race')!.groupId).toBeUndefined()
    expect(membersOf(moved, groupId)).toHaveLength(2)
  })

  it('removeFromGroup dissolves a pair, and deleting a group keeps its cards', () => {
    const pair = createGroup(traps(), ['race-to-bottom', 'race-to-market'])!
    expect(allNodes(removeFromGroup(pair.document, 'race-to-bottom')).some(isGroupNode)).toBe(false)
    const { document, groupId } = grouped()
    const gone = deleteNode(document, groupId)
    expect(nodeAt(gone, 'arms-race')!.groupId).toBeUndefined()
    expect(allNodes(gone)).toHaveLength(5)
  })

  it('repairs a dangling groupId on import and returns clean documents untouched', () => {
    const doc = traps()
    expect(normalizeGroups(doc)).toBe(doc)
    const dangling = makeDocument([{ ...makeNode('a'), groupId: 'nope' }, makeNode('b')])
    const result = importFromJson(dangling)
    if (!result.ok) throw new Error('import failed')
    expect(nodeAt(result.document, 'a')!.groupId).toBeUndefined()
  })
})

describe('undo', () => {
  it('group, rename and ungroup each undo in one step', () => {
    const store = useToCStore.getState()
    const start = traps()
    store.load(start)
    const made = createGroup(start, ['race-to-bottom', 'race-to-market', 'arms-race'])!
    store.transform('group cards', () => made.document)
    store.transform('rename node', (d) =>
      updateNode(d, made.groupId, { title: 'Multipolar traps' }),
    )
    store.transform('ungroup', (d) => dissolveGroup(d, made.groupId))
    expect(allNodes(useToCStore.getState().document).some(isGroupNode)).toBe(false)
    expect(useToCStore.getState().undo()).toBe('ungroup')
    expect(nodeAt(useToCStore.getState().document, made.groupId)!.title).toBe('Multipolar traps')
    expect(useToCStore.getState().undo()).toBe('rename node')
    expect(useToCStore.getState().undo()).toBe('group cards')
    expect(useToCStore.getState().document).toBe(start)
  })
})

describe('round trip and ToCB export', () => {
  it('a group survives full export and re-import unchanged', () => {
    const { document } = grouped()
    const json = JSON.parse(JSON.stringify(toFullJson(document, new Date(0))))
    const parsed = parseDocument(json)
    if (!parsed.ok) throw new Error(parsed.errors.join('; '))
    const again = importFromJson(json)
    if (!again.ok) throw new Error('import failed')
    // Import stamps the current format version; nothing else changes.
    expect(toFullJson(again.document, new Date(0))).toEqual(
      toFullJson({ ...document, version: 2 }, new Date(0)),
    )
  })

  it('compatible export flattens groups: no group node, no group keys, arrows land on a card', () => {
    const { document, groupId } = grouped()
    const withArrow = addConnection(document, 'great-power-war', groupId)
    if (!withArrow.ok) throw new Error('refused')
    const out = toCompatibleJson(withArrow.document, new Date(0))
    const nodes = allNodes(out)
    expect(nodes.map((n) => n.id)).not.toContain(groupId)
    expect(nodes.every((n) => !('groupId' in n) && !('kind' in n))).toBe(true)
    const war = nodes.find((n) => n.id === 'great-power-war')!
    expect(war.connections.map((c) => c.targetId)).toEqual(['race-to-bottom'])
    expect(parseDocument(out).ok).toBe(true)
  })

  it('dissolve and flatten agree for a single group', () => {
    const { document, groupId } = grouped()
    expect(flattenGroups(document)).toEqual(dissolveGroup(document, groupId))
  })
})

describe('moveGroup', () => {
  it('moves the group and its cards down together, keeping their order', () => {
    const { document, groupId } = grouped()
    const next = moveGroup(document, groupId, 0, 0, 40)
    expect(membersOf(next, groupId).map((m) => [m.id, m.yPosition])).toEqual([
      ['race-to-bottom', 40],
      ['race-to-market', 140],
      ['arms-race', 240],
    ])
    expect(nodeAt(next, groupId)!.yPosition).toBe(40)
    expect(nodeAt(next, 'solo')!.yPosition).toBe(300)
  })

  it('clamps so the highest node never goes above 0', () => {
    const { document, groupId } = grouped()
    const next = moveGroup(document, groupId, 0, 0, -50)
    expect(membersOf(next, groupId).map((m) => m.yPosition)).toEqual([0, 100, 200])
  })

  it('carries the whole group into another column and keeps it a group', () => {
    const { document, groupId } = grouped()
    const next = moveGroup(document, groupId, 0, 1, 16)
    const location = (id: string) => ({ ...nodeLocation(next, id) })
    for (const id of [groupId, 'race-to-bottom', 'race-to-market', 'arms-race']) {
      expect(location(id).columnIndex).toBe(1)
    }
    expect(membersOf(next, groupId)).toHaveLength(3)
    expect(nodeAt(next, 'race-to-bottom')!.groupId).toBe(groupId)
    expect(nodeAt(next, 'arms-race')!.connections.map((c) => c.targetId)).toEqual([
      'great-power-war',
    ])
  })

  it('returns the same document for a drop back in place', () => {
    const { document, groupId } = grouped()
    expect(moveGroup(document, groupId, 0, 0, 0)).toBe(document)
  })

  it('is one store transform, so a single undo reverts it', () => {
    const { document, groupId } = grouped()
    useToCStore.getState().load(document)
    const store = useToCStore.getState()
    const before = store.document
    store.transform('move group', (d) => moveGroup(d, groupId, 0, 1, 24))
    expect(useToCStore.getState().document).not.toBe(before)
    useToCStore.getState().undo()
    expect(useToCStore.getState().document).toBe(before)
  })
})
