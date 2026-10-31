import type { ToCDocument } from '../model/schema'
import { splitDocument } from '../files/split'

/** The name, reason and sha limits the function enforces, repeated so the form can stop early. */
export const NAME_LIMIT = 80
export const REASON_LIMIT = 1000

const ENDPOINT = '/.netlify/functions/suggest-change'
const FORM_KEY = 'toc-editor:suggest-form'
const GENERIC_ERROR = 'The suggestion could not be sent. Check your connection and try again.'

export interface SuggestForm {
  name: string
  reason: string
}

export type SuggestResult = { ok: true; url: string } | { ok: false; message: string }

/** The name and reason survive a failed send, a closed dialog and a reload, until a suggestion
 * goes through. Storage can be blocked; then they simply are not kept. */
export function loadForm(): SuggestForm {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FORM_KEY) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null) {
      const { name, reason } = parsed as Record<string, unknown>
      return {
        name: typeof name === 'string' ? name : '',
        reason: typeof reason === 'string' ? reason : '',
      }
    }
  } catch {
    // Fall through to an empty form.
  }
  return { name: '', reason: '' }
}

export function saveForm(form: SuggestForm): void {
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(form))
  } catch {
    // Not kept: nothing else depends on it.
  }
}

export function clearForm(): void {
  try {
    localStorage.removeItem(FORM_KEY)
  } catch {
    // Nothing to clear.
  }
}

function isGithubUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/github\.com\//.test(value)
}

/** Sends the edited map. Never throws: a failure is a friendly sentence for the dialog. The
 * `website` field is the honeypot, always empty from a person. */
export async function sendSuggestion(
  document: ToCDocument,
  baseSha: string,
  form: SuggestForm,
  doFetch: typeof fetch = fetch,
): Promise<SuggestResult> {
  const { content, layout } = splitDocument(document)
  let response: Response
  try {
    response = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        layout,
        name: form.name.trim(),
        reason: form.reason.trim(),
        baseSha,
        website: '',
      }),
    })
  } catch {
    return { ok: false, message: GENERIC_ERROR }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // A non-JSON answer (a gateway page) is handled below.
  }
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (response.ok && isGithubUrl(fields.url)) return { ok: true, url: fields.url }
  const message =
    typeof fields.error === 'string' && fields.error.length > 0 && fields.error.length < 300
      ? fields.error
      : GENERIC_ERROR
  return { ok: false, message }
}
