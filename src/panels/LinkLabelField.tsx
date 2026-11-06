import { CONNECTION_LABEL_MAX } from '../model/schema'

export interface LinkLabelFieldProps {
  label: string | undefined
  /** `undefined` removes the key, so an unlabelled link stays byte-identical to a ToCB one. */
  onChange?: (label: string | undefined) => void
  /** A view link: the label shows but cannot be edited. */
  disabled?: boolean
}

/** The connection's optional label (e.g. "Wichtigkeit"). The canvas draws it once per bundle of
 * links that share it, so the hint says that rather than promising a label on every line. */
export function LinkLabelField({ label, onChange = () => {}, disabled = false }: LinkLabelFieldProps) {
  return (
    <section className="toc-field">
      <div className="toc-field__head">
        <label className="toc-panel__label" htmlFor="conn-label">
          Label
        </label>
        <span className="toc-field__hint">Optional</span>
      </div>
      <input
        id="conn-label"
        type="text"
        className="toc-label-input"
        value={label ?? ''}
        maxLength={CONNECTION_LABEL_MAX}
        placeholder="e.g. Wichtigkeit"
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          onChange(next.trim() === '' ? undefined : next)
        }}
        onBlur={(event) => {
          const trimmed = event.target.value.trim()
          if (trimmed !== (label ?? '')) onChange(trimmed === '' ? undefined : trimmed)
        }}
      />
      <p className="toc-field__note">Shown once per bundle of links with the same label.</p>
    </section>
  )
}
