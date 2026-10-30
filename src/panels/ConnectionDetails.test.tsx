import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ToCDocument } from '../model/schema'
import { useToCStore } from '../state/store'
import { findConnection } from '../state/connections'
import { ConnectionDetails } from './ConnectionDetails'

function node(
  id: string,
  connections: ToCDocument['sections'][0]['columns'][0]['nodes'][0]['connections'] = [],
) {
  return {
    id,
    title: `Title ${id}`,
    text: '',
    color: '#FFE0B2',
    width: 100,
    yPosition: 0,
    connections,
  }
}

function doc(diagramType?: 'status-quo' | 'theory-of-change'): ToCDocument {
  return {
    color: '#000000',
    title: 'synthetic',
    diagramType,
    sections: [
      {
        title: 'A',
        columns: [
          {
            nodes: [node('a1', [{ targetId: 'b1', assumptions: 'One.\n\nTwo.', evidence: '' }])],
          },
        ],
      },
      {
        title: 'B',
        columns: [
          { nodes: [node('b1', [{ targetId: 'a1', confidence: 25, isFeedbackLoop: true }])] },
        ],
      },
    ],
  }
}

const ref = { sourceId: 'a1', index: 0 }

describe('ConnectionDetails', () => {
  beforeEach(() => {
    useToCStore.getState().load(doc('status-quo'))
    useToCStore.getState().selectConnection(ref)
  })

  it('shows From, To, the unrated state and status-quo labels', () => {
    render(<ConnectionDetails />)
    expect(screen.getByText('Title a1')).toBeInTheDocument()
    expect(screen.getByText('Title b1')).toBeInTheDocument()
    expect(screen.getByText('Unrated')).toBeInTheDocument()
    expect(screen.getByText('Mechanism')).toBeInTheDocument()
    expect(screen.getByText(/saved as "assumptions"/)).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
  })

  it('uses theory-of-change labels when the document has no diagramType', () => {
    useToCStore.getState().load(doc())
    useToCStore.getState().selectConnection(ref)
    render(<ConnectionDetails />)
    expect(screen.getByText('Assumptions')).toBeInTheDocument()
    expect(screen.queryByText(/saved as/)).not.toBeInTheDocument()
  })

  it('writes the slider value with the band sentence, and Clear rating removes the key', () => {
    render(<ConnectionDetails />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } })
    expect(findConnection(useToCStore.getState().document, ref)?.confidence).toBe(20)
    expect(screen.getByText(/Low confidence \(20%\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear rating'))
    expect('confidence' in (findConnection(useToCStore.getState().document, ref) ?? {})).toBe(false)
    expect(screen.getByText('Unrated')).toBeInTheDocument()
  })

  it('edits a block and joins the list back into one string', () => {
    render(<ConnectionDetails />)
    const [first] = screen.getAllByRole('textbox')
    fireEvent.change(first, { target: { value: 'Changed.' } })
    expect(findConnection(useToCStore.getState().document, ref)?.assumptions).toBe(
      'Changed.\n\nTwo.',
    )
  })

  it('sets both ways from the direction control and deletes after confirming', () => {
    render(<ConnectionDetails />)
    expect(screen.getByRole('radio', { name: 'Forward' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Title a1 leads to Title b1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Both ways' }))
    expect(findConnection(useToCStore.getState().document, ref)?.isFeedbackLoop).toBe(true)
    expect(screen.getByText('Loop')).toBeInTheDocument()
    expect(screen.getByText(/reinforce each other/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Delete connection'))
    fireEvent.click(screen.getByText('Delete'))
    expect(findConnection(useToCStore.getState().document, ref)).toBeNull()
    expect(useToCStore.getState().selectedConnection).toBeNull()
    expect(useToCStore.getState().notice).toMatch(/deleted/)
  })

  it('refuses backward when the other node already has its own arrow back', () => {
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('radio', { name: 'Backward' }))
    expect(findConnection(useToCStore.getState().document, ref)?.targetId).toBe('b1')
    expect(useToCStore.getState().notice).toMatch(/already exists/)
  })

  it('backward moves the arrow to the other node and follows it with the selection', () => {
    useToCStore.getState().load(doc('status-quo'))
    // Drop b1's own arrow so a1 -> b1 can be turned around.
    const d = useToCStore.getState().document
    d.sections[1].columns[0].nodes[0].connections = []
    useToCStore.getState().load(d)
    useToCStore.getState().selectConnection(ref)
    render(<ConnectionDetails />)
    fireEvent.click(screen.getByRole('radio', { name: 'Backward' }))
    const state = useToCStore.getState()
    expect(state.selectedConnection).toEqual({ sourceId: 'b1', index: 0 })
    expect(findConnection(state.document, { sourceId: 'b1', index: 0 })?.targetId).toBe('a1')
    expect(findConnection(state.document, ref)).toBeNull()
  })

  it('close and Escape clear the selection; Escape inside the confirm row only backs out', () => {
    const { unmount } = render(<ConnectionDetails />)
    fireEvent.click(screen.getByText('Delete connection'))
    fireEvent.keyDown(screen.getByText('Delete'), { key: 'Escape' })
    expect(screen.getByText('Delete connection')).toBeInTheDocument()
    expect(useToCStore.getState().selectedConnection).toEqual(ref)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(useToCStore.getState().selectedConnection).toBeNull()
    unmount()
  })

  it('shows the Loop tag and the both-ways sentence for a flagged connection', () => {
    useToCStore.getState().selectConnection({ sourceId: 'b1', index: 0 })
    render(<ConnectionDetails />)
    expect(screen.getByText('Loop')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Both ways' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Title a1 and Title b1 reinforce each other/)).toBeInTheDocument()
  })
})
