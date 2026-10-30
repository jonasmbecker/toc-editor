import type { DocumentNode } from '../model/schema'
import { edgeAppearance, nodeColorStyle } from '../canvas/config'
import type { Direction, ResolvedConnection } from '../state/connections'
import { EdgeSwatch } from './EdgeSwatch'
import { DirectionControl } from './DirectionControl'

interface EndCardProps {
  node: DocumentNode
  onSelect: (nodeId: string) => void
}

function EndCard({ node, onSelect }: EndCardProps) {
  return (
    <button
      type="button"
      className="toc-end__card"
      style={nodeColorStyle(node.color)}
      title="Select this node"
      onClick={() => onSelect(node.id)}
    >
      {node.title}
    </button>
  )
}

export interface ConnectionEndsProps {
  resolved: ResolvedConnection
  onSelectNode: (nodeId: string) => void
  onDirectionChange: (direction: Direction) => void
}

/**
 * "Between": the two nodes in column order with the direction control between them. The DOM
 * order is first card, second card, control (so Tab reaches both cards before the control, as
 * the design asks) and CSS `order` puts the control visually in the middle. A pairing has no
 * direction: it shows "is paired with" instead.
 */
export function ConnectionEnds({ resolved, onSelectNode, onDirectionChange }: ConnectionEndsProps) {
  const { connection, first, second, direction } = resolved
  const isPairing = connection.provenance === 'verbatim-structure'
  const swatch = <EdgeSwatch appearance={edgeAppearance(connection)} />

  return (
    <div className="toc-between">
      <span className="toc-end__label">Between</span>
      <div className="toc-between__first">
        <EndCard node={first} onSelect={onSelectNode} />
      </div>
      <div className="toc-between__second">
        <EndCard node={second} onSelect={onSelectNode} />
      </div>
      <div className="toc-between__middle">
        {isPairing ? (
          <div className="toc-ends__leads">
            {swatch}
            <span>is paired with</span>
          </div>
        ) : (
          <>
            <DirectionControl
              value={direction}
              firstTitle={first.title}
              secondTitle={second.title}
              onChange={onDirectionChange}
            />
            <div className="toc-ends__leads">{swatch}</div>
          </>
        )}
      </div>
    </div>
  )
}
