import type { NodeProvenance } from '../model/schema'
import { ColorSwatches } from './ColorSwatches'

export interface NodeColorFieldProps {
  options: string[]
  value: string
  provenance?: NodeProvenance
  onChange: (color: string) => void
}

export function NodeColorField({ options, value, provenance, onChange }: NodeColorFieldProps) {
  return (
    <>
      <span className="toc-panel__label">Colour</span>
      <ColorSwatches options={options} value={value} onChange={onChange} />
      {provenance === 'interpreted' ? (
        <span className="toc-card__badge" title="Interpreted, not read verbatim from the source">
          interpreted
        </span>
      ) : null}
    </>
  )
}
