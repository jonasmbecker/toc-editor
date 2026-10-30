export function TidyButton({ onTidy }: { onTidy: () => void }) {
  return (
    <button
      type="button"
      className="toc-topbar__btn"
      title="Move cards up or down so connections run straight (Ctrl+Z undoes it)"
      onClick={onTidy}
    >
      Tidy layout
    </button>
  )
}
