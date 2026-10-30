import type { ToCDocument } from '../model/schema'

export interface NodePositionFieldsProps {
  document: ToCDocument
  sectionIndex: number
  columnIndex: number
  onMove: (sectionIndex: number, columnIndex: number) => void
}

const NEW_COLUMN = 'new-column'

/** Section and column selects for the node panel. Changing section always targets that
 * section's first column (keeping `yPosition`, per the design); "New column" appends one and
 * moves the node there. Emptying out a column this way is harmless — `removeEmptyColumn`
 * (src/state/sections.ts) is there for a future section-menu affordance to offer cleaning it
 * up, but this slice's acceptance criteria don't call for that UI, so it stays unwired here. */
export function NodePositionFields({
  document,
  sectionIndex,
  columnIndex,
  onMove,
}: NodePositionFieldsProps) {
  const columnCount = document.sections[sectionIndex].columns.length

  return (
    <div className="toc-panel__position-group">
      <label className="toc-panel__label" htmlFor="node-section">
        Section / column
      </label>
      <div className="toc-panel__position">
        <select
          id="node-section"
          value={sectionIndex}
          onChange={(event) => onMove(Number(event.target.value), 0)}
        >
          {document.sections.map((section, index) => (
            <option key={index} value={index}>
              {section.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Column"
          value={columnIndex}
          onChange={(event) => {
            const next = event.target.value
            onMove(sectionIndex, next === NEW_COLUMN ? columnCount : Number(next))
          }}
        >
          {Array.from({ length: columnCount }, (_, index) => (
            <option key={index} value={index}>
              Column {index + 1}
            </option>
          ))}
          <option value={NEW_COLUMN}>New column</option>
        </select>
      </div>
      <p className="toc-panel__hint">
        Drag the card up or down to reorder; drag it sideways to the next column.
      </p>
    </div>
  )
}
