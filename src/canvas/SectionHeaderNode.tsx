import type { Node, NodeProps } from '@xyflow/react'

export interface SectionHeaderData extends Record<string, unknown> {
  title: string
  count: number
}

export type SectionHeaderNodeType = Node<SectionHeaderData, 'sectionHeader'>

export function SectionHeaderNode({ data }: NodeProps<SectionHeaderNodeType>) {
  return (
    <div className="toc-section-header">
      <span>{data.title}</span>
      <span className="toc-section-header__count">{data.count}</span>
    </div>
  )
}
