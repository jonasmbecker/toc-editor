import { useState } from 'react'
import { joinBlocks, splitBlocks } from './blocks'

export interface Block {
  /** Local identity for React keys and focus; never written to the file. */
  id: number
  text: string
}

let nextBlockId = 1

function toBlocks(text: string | undefined): Block[] {
  return splitBlocks(text).map((block) => ({ id: nextBlockId++, text: block }))
}

function joined(blocks: Block[]): string {
  return joinBlocks(blocks.map((block) => block.text))
}

/**
 * One string in the file, a list of paragraphs on screen. Local `blocks` state exists so an
 * empty block (just added, or emptied while typing) can sit in the list until the field is
 * left; every change still commits the joined text to the store at once. `committed` is what
 * this hook last wrote: when the incoming `text` differs from it, the change came from outside
 * (undo, redo) and the list is rebuilt from the prop. `settle` (on blur) re-splits, which is
 * how a blank line typed inside a block becomes a new block and an emptied block disappears.
 */
export function useBlockList(text: string | undefined, onChange: (text: string) => void) {
  const [blocks, setBlocks] = useState(() => toBlocks(text))
  const [committed, setCommitted] = useState(() => joinBlocks(splitBlocks(text)))
  const [pendingFocus, setPendingFocus] = useState<number | null>(null)

  const incoming = joinBlocks(splitBlocks(text))
  if (incoming !== committed) {
    setCommitted(incoming)
    setBlocks(toBlocks(text))
  }

  function commit(next: Block[]) {
    const value = joined(next)
    setPendingFocus(null)
    setBlocks(next)
    setCommitted(value)
    onChange(value)
  }

  return {
    blocks,
    pendingFocus,
    update(id: number, value: string) {
      commit(blocks.map((b) => (b.id === id ? { ...b, text: value } : b)))
    },
    remove(id: number) {
      commit(blocks.filter((b) => b.id !== id))
    },
    add() {
      const block = { id: nextBlockId++, text: '' }
      setPendingFocus(block.id)
      setBlocks([...blocks, block])
    },
    settle() {
      const resplit = splitBlocks(joined(blocks))
      const unchanged =
        resplit.length === blocks.length && resplit.every((b, i) => b === blocks[i].text)
      if (!unchanged) setBlocks(toBlocks(joined(blocks)))
    },
  }
}
