import { useImperativeHandle, useState, type Ref } from 'react'
import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BlockListField } from './BlockListField'
import { labelsFor } from '../model/labels'

const labels = labelsFor('status-quo').mechanism

interface HarnessHandle {
  /** Replace the text from outside, the way an undo does. */
  setText: (text: string) => void
}

/** Echoes `onChange` back into the prop, as the store does in the app. */
function Harness({
  initial,
  onChange,
  ref,
}: {
  initial: string
  onChange: (text: string) => void
  ref: Ref<HarnessHandle>
}) {
  const [text, setText] = useState(initial)
  useImperativeHandle(ref, () => ({ setText }))
  return (
    <BlockListField
      id="f"
      labels={labels}
      text={text}
      onChange={(next) => {
        setText(next)
        onChange(next)
      }}
    />
  )
}

function setup(initial = 'One.\n\nTwo.') {
  const onChange = vi.fn()
  const handle = createRef<HarnessHandle>()
  render(<Harness initial={initial} onChange={onChange} ref={handle} />)
  return { onChange, handle }
}

function values(): string[] {
  return screen.queryAllByRole('textbox').map((b) => (b as HTMLTextAreaElement).value)
}

describe('BlockListField', () => {
  it('adds a focused empty block, and drops it again if left empty', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText(/Add block/))
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(3)
    expect(boxes[2]).toHaveFocus()
    fireEvent.blur(boxes[2])
    expect(values()).toEqual(['One.', 'Two.'])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a block and commits the joined text', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getAllByLabelText('Remove block')[0])
    expect(onChange).toHaveBeenLastCalledWith('Two.')
    expect(values()).toEqual(['Two.'])
  })

  it('a blank line typed inside a block splits it into two on blur', () => {
    const { onChange } = setup('One.')
    const [box] = screen.getAllByRole('textbox')
    fireEvent.change(box, { target: { value: 'One.\n\nOne and a half.' } })
    expect(onChange).toHaveBeenLastCalledWith('One.\n\nOne and a half.')
    fireEvent.blur(box)
    expect(values()).toEqual(['One.', 'One and a half.'])
  })

  it('rebuilds from the prop when the text changes from outside (undo)', () => {
    const { onChange, handle } = setup()
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Changed.' } })
    expect(onChange).toHaveBeenLastCalledWith('Changed.\n\nTwo.')
    act(() => handle.current!.setText('One.\n\nTwo.'))
    expect(values()).toEqual(['One.', 'Two.'])
  })

  it('shows the dashed empty-state button when there is nothing', () => {
    setup('')
    expect(values()).toEqual([])
    expect(screen.getByText(new RegExp(labels.empty))).toHaveClass('toc-add--empty')
  })
})
