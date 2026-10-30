import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseDocument, type ToCDocument } from '../model/schema'
import { useToCStore } from './store'
import { addNode, deleteNode, moveNodeToColumn, updateNode } from './nodes'

/**
 * The node-editing slice's review task, as an automated check rather than a manual one: there
 * is no export/import UI yet (that's the home-files slice), but the in-memory document is
 * already exactly what a future export would serialize, so a JSON round-trip of it is the
 * meaningful check today. Covers the slice's acceptance criterion directly: edits survive
 * export and reload, and undo restores the previous state exactly.
 */

function loadStatusQuo(): ToCDocument {
  const raw = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../fixtures/theory-of-metacrisis-status-quo_v1.json'),
      'utf8',
    ),
  )
  const result = parseDocument(raw)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.document
}

describe('five edits round-trip through export/import, and undo five times restores the original', () => {
  let original: ToCDocument

  beforeEach(() => {
    original = loadStatusQuo()
    useToCStore.getState().load(original)
  })

  it('exports, reimports and undoes back to the untouched fixture', () => {
    let addedId = ''

    // 1. Add a node.
    useToCStore.getState().transform('add node', (doc) => {
      const result = addNode(doc, 0, 0)
      addedId = result.nodeId
      return result.document
    })

    // 2. Rename it.
    useToCStore
      .getState()
      .transform('rename node', (doc) => updateNode(doc, addedId, { title: 'A brand new idea' }))

    // 3. Recolour it.
    useToCStore
      .getState()
      .transform('recolour node', (doc) => updateNode(doc, addedId, { color: '#FFE0B2' }))

    // 4. Move it to a new column.
    useToCStore
      .getState()
      .transform('move node', (doc) =>
        moveNodeToColumn(doc, addedId, 0, doc.sections[0].columns.length),
      )

    // 5. Delete a pre-existing node, cascading its connections.
    const toDelete = original.sections[0].columns[0].nodes[0].id
    useToCStore.getState().transform('delete node', (doc) => deleteNode(doc, toDelete))

    const edited = useToCStore.getState().document
    expect(edited).not.toEqual(original)

    // Export (serialize) and reimport (parse): the edited document survives the round-trip
    // byte-for-byte.
    const reimported = parseDocument(JSON.parse(JSON.stringify(edited)))
    expect(reimported.ok).toBe(true)
    if (reimported.ok) expect(reimported.document).toEqual(edited)

    // Undo all five edits: back to exactly the original fixture.
    for (let i = 0; i < 5; i++) {
      const label = useToCStore.getState().undo()
      expect(label).not.toBeNull()
    }
    expect(useToCStore.getState().document).toEqual(original)
    expect(useToCStore.getState().undo()).toBeNull() // nothing left to undo
  })
})
