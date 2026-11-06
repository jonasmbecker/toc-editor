import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TheorySwitcher } from './TheorySwitcher'
import { useTheoryStore } from '../repo/theoryStore'
import { useSuggestionStore } from '../repo/suggestionStore'
import { BUNDLED_INDEX } from '../repo/theoryIndex'

const INDEX = {
  default: 'jonas',
  theories: [
    ...BUNDLED_INDEX.theories,
    {
      slug: 'schmachtenberger',
      title: 'Daniel Schmachtenberger (reconstructed)',
      status: 'reconstructed' as const,
      layout: 'free',
      statusNote: 'Not endorsed by him.',
    },
  ],
}

function renderSwitcher() {
  const onSwitch = vi.fn()
  const onStart = vi.fn()
  render(<TheorySwitcher onSwitch={onSwitch} onStart={onStart} />)
  return { onSwitch, onStart, button: screen.getByRole('button', { name: /Switch theory/ }) }
}

beforeEach(() => {
  useTheoryStore.getState().setIndex(INDEX, false)
  useTheoryStore.getState().setCurrent('jonas')
  useSuggestionStore.getState().clear()
})

describe('TheorySwitcher', () => {
  it('names the open theory and its status', () => {
    const { button } = renderSwitcher()
    expect(button).toHaveAccessibleName(
      "Theory: Jonas Becker's theory (Author's own). Switch theory",
    )
  })

  it('renders nothing for a document that is not a theory', () => {
    useTheoryStore.getState().setCurrent(null)
    const { container } = render(<TheorySwitcher onSwitch={vi.fn()} onStart={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every theory with its badge, moves by keyboard, and opens the chosen one', () => {
    const { button, onSwitch } = renderSwitcher()
    fireEvent.click(button)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveFocus()
    expect(options[1]).toHaveTextContent('Reconstructed · not endorsed')
    fireEvent.keyDown(options[0], { key: 'ArrowDown' })
    expect(options[1]).toHaveFocus()
    fireEvent.keyDown(options[1], { key: 'Home' })
    expect(options[0]).toHaveFocus()
    fireEvent.keyDown(options[0], { key: 'End' })
    fireEvent.keyDown(options[1], { key: 'Enter' })
    expect(onSwitch).toHaveBeenCalledWith('schmachtenberger')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('gives focus back to the switcher when the open theory is chosen or Escape is pressed', () => {
    const { button, onSwitch } = renderSwitcher()
    fireEvent.click(button)
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(onSwitch).not.toHaveBeenCalled()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('offers "Start your own" from the list', () => {
    const { button, onStart } = renderSwitcher()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: /Start your own or open a file/ }))
    expect(onStart).toHaveBeenCalled()
  })

  it('stays shut while a suggestion is open, and says why', () => {
    useSuggestionStore.getState().setSuggestion({
      number: 4,
      title: 'A change',
      url: 'https://github.com/x/y/pull/4',
      theory: null,
    })
    const { button } = renderSwitcher()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('title', 'Close the suggestion to switch theories')
    fireEvent.click(button)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
