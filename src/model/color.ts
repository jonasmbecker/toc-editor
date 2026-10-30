/**
 * The one definition of what a colour value is in this tool. ToCB (and this tool) only ever
 * write 6-digit `#RRGGBB` hex; a document's `color` fields flow straight into inline CSS, so
 * everything that accepts a colour — the schema on import, `updateNode` on edit, the chip's
 * `darken()` — checks against this same pattern rather than each keeping its own copy.
 */

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value)
}

/** Uppercase is the canonical form (it is what every ToCB export and the bundled palette use),
 * so `#e3f2fd` typed into the hex field becomes the same string as the `#E3F2FD` swatch and the
 * two are never treated as different colours. Returns null for anything that is not a 6-digit
 * hex, so callers can refuse the value rather than store it. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  return isValidHexColor(trimmed) ? trimmed.toUpperCase() : null
}
