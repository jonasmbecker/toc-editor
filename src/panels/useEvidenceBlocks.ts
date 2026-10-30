import { useState } from 'react'
import { flattenEvidence, splitEvidence, storedBlocks } from '../model/evidence'
import type { Connection, EvidenceBlock, EvidenceLink } from '../model/schema'
import type { ConnectionPatch } from '../state/connections'

export interface EvidenceRow extends EvidenceBlock {
  /** Local identity for React keys and focus; never written to the file. */
  rid: number
}

let nextRowId = 1

const isFilled = (b: EvidenceBlock) => b.text.trim() !== '' || (b.links?.length ?? 0) > 0

function toRows(blocks: EvidenceBlock[]): EvidenceRow[] {
  return blocks.map((block) => ({ ...block, rid: nextRowId++ }))
}

function plain(rows: EvidenceRow[]): EvidenceBlock[] {
  return rows.map(({ rid: _rid, ...block }) => {
    void _rid
    return block
  })
}

/** The patch that stores `blocks`: the readable string always, the structured extension only
 * when some block carries a tag or link. */
export function evidencePatch(blocks: EvidenceBlock[]): ConnectionPatch {
  return { evidence: flattenEvidence(blocks), evidenceBlocks: storedBlocks(blocks) }
}

/** Compared through the stored form on both sides, so a trailing space or blank line the user
 * is still typing (trimmed away in the plain string) is not mistaken for an outside change. */
const signature = (blocks: EvidenceBlock[]) => JSON.stringify(evidencePatch(blocks))

/**
 * Evidence blocks as list state over `evidence` / `evidenceBlocks`. Same shape as
 * `useBlockList`: local rows let an empty block sit in the list until the field is left,
 * every change commits at once, and a change that did not come from here (undo, redo, a
 * mechanism block removed and its tags renumbered) rebuilds the rows from the connection.
 */
export function useEvidenceBlocks(
  connection: Pick<Connection, 'evidence' | 'evidenceBlocks'>,
  onCommit: (patch: ConnectionPatch) => void,
) {
  const incoming = splitEvidence(connection)
  const [rows, setRows] = useState(() => toRows(incoming))
  const [committed, setCommitted] = useState(() => signature(incoming))
  const [pendingFocus, setPendingFocus] = useState<number | null>(null)

  if (signature(incoming) !== committed) {
    setCommitted(signature(incoming))
    setRows(toRows(incoming))
  }

  function commit(next: EvidenceRow[]) {
    const blocks = plain(next)
    setPendingFocus(null)
    setRows(next)
    setCommitted(signature(blocks))
    onCommit(evidencePatch(blocks))
  }

  const change = (rid: number, fn: (block: EvidenceRow) => EvidenceRow) =>
    commit(rows.map((row) => (row.rid === rid ? fn(row) : row)))

  return {
    rows,
    pendingFocus,
    setText: (rid: number, text: string) => change(rid, (row) => ({ ...row, text })),
    /** A pasted bare url becomes the block's link in one commit (text cleared). */
    makeLink: (rid: number) =>
      change(rid, (row) => ({ ...row, text: '', links: [{ url: row.text.trim() }] })),
    toggleSupport(rid: number, n: number) {
      change(rid, (row) => {
        const has = row.supports?.includes(n)
        const supports = (
          has ? row.supports!.filter((s) => s !== n) : [...(row.supports ?? []), n]
        ).sort((a, b) => a - b)
        const { supports: _old, ...rest } = row
        void _old
        return supports.length ? { ...rest, supports } : rest
      })
    },
    setLinks(rid: number, links: EvidenceLink[]) {
      change(rid, (row) => {
        const { links: _old, ...rest } = row
        void _old
        return links.length ? { ...rest, links } : rest
      })
    },
    remove: (rid: number) => commit(rows.filter((row) => row.rid !== rid)),
    add() {
      const row = { rid: nextRowId++, text: '' }
      setPendingFocus(row.rid)
      setRows([...rows, row])
    },
    /** On leaving the field: drop blocks that ended up empty. */
    settle() {
      const kept = rows.filter(isFilled)
      if (kept.length !== rows.length) setRows(kept)
    },
  }
}
