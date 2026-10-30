export interface NodePanelHeaderProps {
  sectionTitle: string
  columnNumber: number
  onClose: () => void
}

export function NodePanelHeader({ sectionTitle, columnNumber, onClose }: NodePanelHeaderProps) {
  return (
    <header className="toc-panel__header">
      <div className="toc-panel__eyebrow">
        {sectionTitle}
        <span className="toc-panel__eyebrow-col">col {columnNumber}</span>
      </div>
      <button type="button" className="toc-panel__close" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </header>
  )
}
