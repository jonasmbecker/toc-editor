export interface NodeIdentityFieldsProps {
  title: string
  text: string
  onTitleChange: (title: string) => void
  onTextChange: (text: string) => void
}

/** The title and text textareas. Kept separate from `NodePanel` mainly to keep that component's
 * own body short; there's no state here, just two controlled fields. */
export function NodeIdentityFields({
  title,
  text,
  onTitleChange,
  onTextChange,
}: NodeIdentityFieldsProps) {
  return (
    <>
      <textarea
        className="toc-panel__title"
        value={title}
        placeholder="Untitled node"
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <label className="toc-panel__label" htmlFor="node-text">
        Text
      </label>
      <textarea
        id="node-text"
        className="toc-panel__text"
        value={text}
        rows={3}
        onChange={(event) => onTextChange(event.target.value)}
      />
    </>
  )
}
