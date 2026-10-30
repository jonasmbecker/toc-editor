import type { Node, NodeProps } from '@xyflow/react'

export interface SectionHeaderData extends Record<string, unknown> {
  title: string
  count: number
}

export type SectionHeaderNodeType = Node<SectionHeaderData, 'sectionHeader'>

export function SectionHeaderNode({ data }: NodeProps<SectionHeaderNodeType>) {
  return (
    <div className="toc-section-header" title={data.title}>
      <span className="toc-section-header__title">{data.title}</span>
      <span className="toc-section-header__count" aria-label={`${data.count} cards`}>{data.count}</span>
    </div>
  )
}
