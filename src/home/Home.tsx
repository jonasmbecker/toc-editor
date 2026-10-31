import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { ToCDocument } from '../model/schema'
import { TEMPLATES, type TemplateInfo } from '../templates'
import { warmTheoryMap } from '../repo/mapSource'
import { importFromFile } from '../files/import'
import type { Draft } from '../files/draft'
import './home.css'

export interface HomeProps {
  draft: Draft | null
  onOpen: (document: ToCDocument) => void
  onRestoreDraft: () => void
  onDiscardDraft: () => void
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: Draft
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <section className="toc-home__draft" aria-label="Unsaved local draft">
      <div>
        <strong>Unsaved local draft: {draft.document.title}</strong>
        <span>Saved in this browser on {formatSavedAt(draft.savedAt)}</span>
      </div>
      <button type="button" className="toc-home__btn toc-home__btn--primary" onClick={onRestore}>
        Restore
      </button>
      <button type="button" className="toc-home__btn" onClick={onDiscard}>
        Discard
      </button>
    </section>
  )
}

function TemplateCards({ onOpen }: { onOpen: (document: ToCDocument) => void }) {
  const [openingId, setOpeningId] = useState<string | null>(null)

  // Fetch the repo's map ahead, so the click below usually opens from the cache at once.
  useEffect(() => warmTheoryMap(), [])

  async function openTemplate(template: TemplateInfo) {
    if (!template.load) return onOpen(template.create())
    setOpeningId(template.id)
    try {
      onOpen(await template.load())
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <section className="toc-home__cards" aria-label="Start a diagram">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className={`toc-home__card${template.isFeatured ? ' toc-home__card--wide' : ''}`}
          disabled={openingId !== null}
          aria-busy={openingId === template.id}
          onClick={() => void openTemplate(template)}
        >
          <span className="toc-home__card-name">{template.name}</span>
          <span className="toc-home__card-desc">
            {openingId === template.id ? 'Opening the map' : template.description}
          </span>
        </button>
      ))}
    </section>
  )
}

function ImportErrors({
  fileName,
  errors,
  onDismiss,
}: {
  fileName: string
  errors: string[]
  onDismiss: () => void
}) {
  return (
    <section className="toc-home__errors" role="alert">
      <strong>
        {fileName ? `${fileName} could not be opened` : 'The file could not be opened'}
      </strong>
      <ul>
        {errors.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <button type="button" className="toc-home__btn" onClick={onDismiss}>
        Dismiss
      </button>
    </section>
  )
}

function OpenFileZone({ onFile }: { onFile: (file: File | undefined) => void }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function onDragLeave(event: DragEvent) {
    // Moving the pointer onto the zone's own text or button fires dragleave on the zone;
    // only a leave to somewhere outside it ends the highlight.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragOver(false)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setIsDragOver(false)
    onFile(event.dataTransfer.files[0])
  }

  return (
    <section
      className={`toc-home__drop${isDragOver ? ' toc-home__drop--over' : ''}`}
      aria-label="Open a file"
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <p>Drop a theoryofchangebuilder or ToC editor .json file here</p>
      <button type="button" className="toc-home__btn" onClick={() => input.current?.click()}>
        Open a JSON file
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Open a JSON file"
        onChange={(event) => {
          onFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </section>
  )
}

export function Home({ draft, onOpen, onRestoreDraft, onDiscardDraft }: HomeProps) {
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')

  async function openFile(file: File | undefined) {
    if (!file) return
    const result = await importFromFile(file)
    if (result.ok) {
      setErrors([])
      onOpen(result.document)
    } else {
      setFileName(file.name)
      setErrors(result.errors)
    }
  }

  return (
    <main className="toc-home">
      <header className="toc-home__head">
        <h1>ToC editor</h1>
        <p>Draw and edit theory-of-change diagrams and status-quo maps.</p>
      </header>
      {draft ? (
        <DraftBanner draft={draft} onRestore={onRestoreDraft} onDiscard={onDiscardDraft} />
      ) : null}
      <TemplateCards onOpen={onOpen} />
      <OpenFileZone onFile={(file) => void openFile(file)} />
      {errors.length > 0 ? (
        <ImportErrors fileName={fileName} errors={errors} onDismiss={() => setErrors([])} />
      ) : null}
    </main>
  )
}
