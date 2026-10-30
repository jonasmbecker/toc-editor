import { useToCStore } from '../state/store'
import { announce } from '../state/notice'
import { createShared, openShared } from './api'
import { useShareStore } from './shareStore'
import { editPath, setPath, type ShareRoute } from './route'

/**
 * What the share UI does, kept out of the components: open a link, share the open document,
 * copy a view-only one, reload after a conflict. Each leaves the document store, the share
 * store and the address bar agreeing with each other. The two creates are deduplicated: a
 * second caller while one is in flight (a reopened dialog, a double click) joins it instead
 * of making a second record.
 */

const COPY_NOTICE_MS = 3200

let pendingCreate: Promise<void> | null = null

function once(run: () => Promise<void>): Promise<void> {
  if (!pendingCreate) {
    pendingCreate = run().finally(() => {
      pendingCreate = null
    })
  }
  return pendingCreate
}

/** Opens the diagram behind `/d/…` or `/v/…`. A view link loads read-only. Throws ShareError. */
export async function openRoute(route: ShareRoute): Promise<void> {
  const opened = await openShared(route.token)
  useToCStore.getState().load(opened.document, { readOnly: opened.role === 'view' })
  useShareStore.getState().setShared({
    role: opened.role,
    editToken: opened.role === 'edit' ? route.token : null,
    viewToken: opened.viewToken ?? null,
    revision: opened.revision,
    storedDocument: opened.document,
  })
}

/** First share of a local document: store it, and this tab becomes its edit link. Resolves
 * at once when the document is already shared. */
export function ensureShared(): Promise<void> {
  if (useShareStore.getState().editToken) return Promise.resolve()
  return once(async () => {
    const document = useToCStore.getState().document
    const created = await createShared(document)
    useShareStore.getState().setShared({ role: 'edit', ...created, storedDocument: document })
    setPath(editPath(created.editToken), { replace: true })
    announce('Stored. This tab now opens the edit link.')
  })
}

/** From a view link: a new record with the same content, opened here for editing. The back
 * button returns to the view link. */
export function makeOwnCopy(): Promise<void> {
  return once(async () => {
    announce('Making your copy')
    const document = useToCStore.getState().document
    const created = await createShared(document).catch(() => null)
    if (!created) {
      announce('The copy could not be made. Try again in a moment.', COPY_NOTICE_MS)
      return
    }
    useToCStore.getState().load(document)
    useShareStore.getState().setShared({ role: 'edit', ...created, storedDocument: document })
    setPath(editPath(created.editToken))
    announce('This is your copy. Your edit link is under Share.', COPY_NOTICE_MS)
  })
}

/** After a conflict: replace this tab's document with the stored one. */
export async function reloadShared(): Promise<void> {
  const { editToken, viewToken } = useShareStore.getState()
  if (!editToken) return
  try {
    const opened = await openShared(editToken)
    useToCStore.getState().load(opened.document)
    useShareStore.getState().setShared({
      role: 'edit',
      editToken,
      viewToken: opened.viewToken ?? viewToken,
      revision: opened.revision,
      storedDocument: opened.document,
    })
    announce('Reloaded the latest version')
  } catch {
    announce('Could not reload. Check the connection and try again.')
  }
}
