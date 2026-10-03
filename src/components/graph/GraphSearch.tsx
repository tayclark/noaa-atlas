import { useEffect, useRef, useState } from 'react'
import './GraphSearch.css'

/** A match, listed under the search box on a phone (#78). */
export interface SearchResult {
  id: string
  name: string
  detail: string
}

/** The list stops here; the status line still counts every match. */
const MAX_RESULTS = 6

interface GraphSearchProps {
  query: string
  onQueryChange: (query: string) => void
  /** Called when the box gains focus, e.g. to start loading what search needs (#269). */
  onFocus?: () => void
  matchCount: number | null
  /** The matches to list under the box, where dimmed dots are too small to read or tap. Omit for none. */
  results?: SearchResult[]
  onPick?: (id: string) => void
  placeholder?: string
}

export function GraphSearch({ query, onQueryChange, onFocus, matchCount, results, onPick, placeholder = 'Search APIs, tags, tasks…' }: GraphSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The list closes on a tap anywhere else (the graph, say) and opens again as the query changes.
  const [open, setOpen] = useState(true)
  const trimmed = query.trim()
  let status = ''
  if (matchCount !== null) {
    status = matchCount === 0 ? `No matches for "${trimmed}"` : `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`
  }
  const listed = results && trimmed ? results.slice(0, MAX_RESULTS) : []
  const showList = open && listed.length > 0

  useEffect(() => {
    if (!showList) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showList])

  const change = (next: string) => {
    setOpen(true)
    onQueryChange(next)
  }

  return (
    <div className="graph-search" ref={rootRef}>
      <div className="graph-search-field">
        <input
          ref={inputRef}
          type="search"
          aria-label="Search graph"
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onFocus={onFocus}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') change('')
          }}
        />
        {query && (
          <button
            type="button"
            className="graph-search-clear"
            aria-label="Clear search"
            onClick={() => {
              change('')
              inputRef.current?.focus()
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      <p className="graph-search-status" role="status">
        {status}
      </p>
      {showList && (
        <ul className="graph-search-results" aria-label="Matching services">
          {listed.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  // Put the keyboard away so the selection, not the box, is what the screen shows.
                  inputRef.current?.blur()
                  onPick?.(result.id)
                }}
              >
                <span className="graph-search-result-name">{result.name}</span>
                <span className="graph-search-result-detail">{result.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
