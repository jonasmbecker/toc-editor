import type { KeyboardEvent } from 'react'
import type { MapRow } from '../model/schema'

export const ALL_LAYERS = 'all'

/** One tab per layer of a matrix map, plus "All layers". A layer tab shows that layer on top
 * with only its links; "All layers" shows the stored layout, the one where cards can be moved. */
export function LayerTabs({
  rows,
  active,
  colorOf,
  onChange,
}: {
  rows: MapRow[]
  /** The chosen row id, or ALL_LAYERS. */
  active: string
  colorOf: (rowId: string) => string
  onChange: (rowId: string) => void
}) {
  const tabs = [
    ...rows.map((row) => ({ id: row.id, title: row.title })),
    { id: ALL_LAYERS, title: 'All layers' },
  ]
  // Arrow keys move between tabs, as in any tab list; only the chosen tab is in the Tab order.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === active)
    const next = tabs[(index + step + tabs.length) % tabs.length]
    onChange(next.id)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus()
  }
  return (
    <div className="toc-layer-tabs">
      <div
        className="toc-layer-tabs__list"
        role="tablist"
        aria-label="Layers"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            tabIndex={tab.id === active ? 0 : -1}
            data-tab={tab.id}
            className="toc-layer-tabs__tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.id === ALL_LAYERS ? null : (
              <span
                className="toc-layer-tabs__dot"
                aria-hidden="true"
                style={{ background: colorOf(tab.id) }}
              />
            )}
            {tab.title}
          </button>
        ))}
      </div>
      {active === ALL_LAYERS ? null : (
        <p className="toc-layer-tabs__hint">To move cards, switch to All layers.</p>
      )}
    </div>
  )
}
