import { diagramTypeSchema, type DiagramType } from '../model/schema'
import { DEFAULT_DIAGRAM_TYPE, labelsFor } from '../model/labels'
import { useToCStore } from '../state/store'
import { setDiagramType } from '../state/document'
import { TopBarActions } from './TopBarActions'
import { TidyButton } from './TidyButton'

export interface CanvasTopBarProps {
  title: string
  diagramType?: DiagramType
  cardCount: number
  connectionCount: number
  droppedCount: number
  onHome: () => void
  /** Shown as a "Tidy layout" button when given and the diagram is editable. */
  onTidy?: () => void
}

const DIAGRAM_TYPES = diagramTypeSchema.options

export function CanvasTopBar({
  title,
  diagramType,
  cardCount,
  connectionCount,
  droppedCount,
  onHome,
  onTidy,
}: CanvasTopBarProps) {
  const transform = useToCStore((state) => state.transform)
  const isReadOnly = useToCStore((state) => state.isReadOnly)
  function onDiagramTypeChange(type: DiagramType) {
    transform('change diagram type', (document) => setDiagramType(document, type))
  }

  return (
    <header className="toc-topbar">
      <span className="toc-topbar__brand">ToC editor</span>
      <span className="toc-topbar__divider" />
      <span className="toc-topbar__title">{title}</span>
      {/* The diagram-type setting: a pill that is really a select. It only changes wording
          (Mechanism vs Assumptions, the footnote); no JSON key changes with it. A view link
          shows the same pill without the select. */}
      {isReadOnly ? (
        <span className="toc-topbar__pill">{labelsFor(diagramType).typeName}</span>
      ) : (
        <DiagramTypeSelect value={diagramType} onChange={onDiagramTypeChange} />
      )}
      <span className="toc-topbar__counts">
        {cardCount} nodes &middot; {connectionCount} connections
        {droppedCount > 0 ? (
          <span className="toc-topbar__warning">
            {' '}
            &middot; {droppedCount} connection{droppedCount === 1 ? '' : 's'} dropped (unknown
            target)
          </span>
        ) : null}
      </span>
      {onTidy && !isReadOnly ? <TidyButton onTidy={onTidy} /> : null}
      <TopBarActions onHome={onHome} />
    </header>
  )
}

function DiagramTypeSelect({
  value,
  onChange,
}: {
  value: DiagramType | undefined
  onChange: (type: DiagramType) => void
}) {
  return (
    <select
      className="toc-topbar__pill toc-topbar__pill--select"
      aria-label="Diagram type"
      value={value ?? DEFAULT_DIAGRAM_TYPE}
      onChange={(event) => onChange(diagramTypeSchema.parse(event.target.value))}
    >
      {DIAGRAM_TYPES.map((type) => (
        <option key={type} value={type}>
          {labelsFor(type).typeName}
        </option>
      ))}
    </select>
  )
}
