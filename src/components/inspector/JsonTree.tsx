// Foldable view of a response body (#150), replacing a flat JSON.stringify dump. Built on native
// <details>/<summary> for keyboard and screen-reader support. A branch's children only render
// while it is open, so a closed 467-item alerts array costs nothing.

import { useState } from 'react'
import { ARRAY_PAGE_SIZE, isContainer, summarizeJson, visibleChildren } from './jsonTreeFormat'

/** Levels open on first render: the top-level keys are visible, everything below is folded. */
const OPEN_DEPTH = 1

function JsonNode({ name, value, depth }: { name: string | null; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < OPEN_DEPTH)
  const [limit, setLimit] = useState(ARRAY_PAGE_SIZE)
  const label = name === null ? null : <span className="json-tree-key">{name}: </span>

  if (!isContainer(value)) {
    return (
      <div className="json-tree-leaf">
        {label}
        <span className={`json-tree-value json-tree-${value === null ? 'null' : typeof value}`}>{summarizeJson(value)}</span>
      </div>
    )
  }

  const { entries, hidden } = visibleChildren(value, limit)
  return (
    <details className="json-tree-branch" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {label}
        <span className="json-tree-summary">{summarizeJson(value)}</span>
      </summary>
      {open && (
        <div className="json-tree-children">
          {entries.map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} depth={depth + 1} />
          ))}
          {hidden > 0 && (
            <button type="button" className="json-tree-more" onClick={() => setLimit((l) => l + ARRAY_PAGE_SIZE)}>
              Show {Math.min(hidden, ARRAY_PAGE_SIZE)} more of {hidden}
            </button>
          )}
        </div>
      )}
    </details>
  )
}

export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="json-tree">
      <JsonNode name={null} value={value} depth={0} />
    </div>
  )
}
