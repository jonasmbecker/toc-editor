import type { ToCDocument } from '../model/schema'
import { normalizeHexColor } from '../model/color'

export { isValidHexColor, normalizeHexColor } from '../model/color'

/** The theoryofchangebuilder.com pastel set, used to fill out the swatch row when a section
 * doesn't yet have enough colours of its own to offer a real choice. */
export const TOCB_PALETTE = [
  '#E3F2FD',
  '#FFF3E0',
  '#FFE0B2',
  '#F0F4C3',
  '#FCE4EC',
  '#E8F5E9',
] as const

/** Every colour already used in the document (in section order), followed by any ToCB pastel
 * not yet present — so a document that already has its own palette offers that first, and a
 * brand-new one still offers something to pick from. Colours are compared in their normalised
 * (uppercase) form, so an imported file mixing `#e3f2fd` and `#E3F2FD` yields one swatch. */
export function swatchOptions(doc: ToCDocument): string[] {
  const allColors = doc.sections.flatMap((section) =>
    section.columns.flatMap((column) => column.nodes.map((node) => node.color)),
  )
  const used: string[] = []
  const seen = new Set<string>()
  for (const raw of allColors) {
    const color = normalizeHexColor(raw) ?? raw
    if (seen.has(color)) continue
    seen.add(color)
    used.push(color)
  }
  const extras = TOCB_PALETTE.filter((color) => !seen.has(color))
  return [...used, ...extras]
}
