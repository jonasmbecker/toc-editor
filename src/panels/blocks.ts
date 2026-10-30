/**
 * The `assumptions` and `evidence` fields stay single strings in the file (as ToCB writes them);
 * the panel shows them as a list of paragraphs. Blank lines are the separator both ways.
 */

export function splitBlocks(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export function joinBlocks(blocks: string[]): string {
  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n')
}
