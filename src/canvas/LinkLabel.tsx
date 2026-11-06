import { EdgeLabelRenderer, Position } from '@xyflow/react'
import { useToCStore } from '../state/store'
import type { LabelBundle } from './linkLabels'
import './link-label.css'

/** Distance from the card edge to the pill on a bundle's shared stretch. */
const BUNDLE_OFFSET = 10

interface Point {
  x: number
  y: number
}

/** Where the pill sits and which of its edges is pinned there: next to the anchor, pushed away
 * from the card on the side the link leaves (or enters) it. */
function pillTransform(at: Point, side: Position): string {
  const shift = {
    [Position.Right]: `translate(${BUNDLE_OFFSET}px, -50%)`,
    [Position.Left]: `translate(calc(-100% - ${BUNDLE_OFFSET}px), -50%)`,
    [Position.Top]: `translate(-50%, calc(-100% - ${BUNDLE_OFFSET}px))`,
    [Position.Bottom]: `translate(-50%, ${BUNDLE_OFFSET}px)`,
  }[side]
  return `translate(${at.x}px, ${at.y}px) ${shift}`
}

export interface LinkLabelProps {
  bundle: LabelBundle
  source: Point & { position: Position }
  target: Point & { position: Position }
  /** The path's midpoint, for a label nobody shares. */
  mid: Point
}

/** One label pill for a bundle of links (see `bundleLabels`). Never takes a click: the line under
 * it stays the thing you pick. */
export function LinkLabel({ bundle, source, target, mid }: LinkLabelProps) {
  const selectedNodeId = useToCStore((s) => s.selectedNodeId)
  const selectedConnection = useToCStore((s) => s.selectedConnection)
  const isSelected = bundle.members.some(
    (m) => m.sourceId === selectedConnection?.sourceId && m.index === selectedConnection.index,
  )
  const isFaded = selectedNodeId != null && !bundle.cardIds.includes(selectedNodeId)

  const transform =
    bundle.placement === 'source'
      ? pillTransform(source, source.position)
      : bundle.placement === 'target'
        ? pillTransform(target, target.position)
        : `translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%)`

  const className = [
    'toc-link-label',
    'toc-link-label--canvas',
    isSelected && 'toc-link-label--selected',
    isFaded && 'toc-link-label--faded',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <EdgeLabelRenderer>
      <div className={`${className} nodrag nopan`} style={{ transform }} aria-hidden="true">
        {bundle.label}
      </div>
    </EdgeLabelRenderer>
  )
}
