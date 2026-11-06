import type { ConnectionRef } from '../state/connections'

/**
 * Where a connection's label is drawn. Labels repeat across many links (two cards × a dozen needs,
 * each link "Wichtigkeit" or "Dringlichkeit"), so the canvas draws one pill per bundle rather than
 * one per line: links that leave the same card with the same label share a pill just after their
 * common start; failing that, links that enter the same card with the same label share one just
 * before their common end; a label nobody shares sits on its link's midpoint. The label itself
 * stays on every link in the data.
 */

export type LabelPlacement = 'source' | 'target' | 'mid'

export interface LabelBundle {
  label: string
  placement: LabelPlacement
  /** Every link the pill stands for, so it can follow their selection. */
  members: ConnectionRef[]
  /** End cards of those links, so the pill fades when a card none of them touches is selected. */
  cardIds: string[]
}

export interface LabelledLink {
  edgeId: string
  source: string
  target: string
  ref: ConnectionRef
  label?: string
}

/** Edge id → the bundle that edge draws. Only one edge per bundle (its first) is a key. */
export function bundleLabels(links: LabelledLink[]): Map<string, LabelBundle> {
  const labelled = links.filter((l): l is LabelledLink & { label: string } => Boolean(l.label))
  const groups = (key: (l: LabelledLink) => string) => {
    const out = new Map<string, (LabelledLink & { label: string })[]>()
    for (const link of labelled) out.set(key(link), [...(out.get(key(link)) ?? []), link])
    return out
  }
  const bySource = groups((l) => `${l.source}\u0000${l.label}`)
  const byTarget = groups((l) => `${l.target}\u0000${l.label}`)

  const placed = new Set<string>()
  const result = new Map<string, LabelBundle>()
  const add = (members: (LabelledLink & { label: string })[], placement: LabelPlacement) => {
    for (const m of members) placed.add(m.edgeId)
    result.set(members[0].edgeId, {
      label: members[0].label,
      placement,
      members: members.map((m) => m.ref),
      cardIds: [...new Set(members.flatMap((m) => [m.source, m.target]))],
    })
  }
  for (const members of bySource.values()) if (members.length > 1) add(members, 'source')
  for (const members of byTarget.values()) {
    const open = members.filter((m) => !placed.has(m.edgeId))
    if (open.length > 1) add(open, 'target')
  }
  for (const link of labelled) if (!placed.has(link.edgeId)) add([link], 'mid')
  return result
}

/** Each distinct label and how many links carry it, in first-seen order, for the legend. */
export function labelCounts(labels: (string | undefined)[]): { label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const label of labels) if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count }))
}
