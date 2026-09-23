import './GraphSearch.css'

interface GraphSearchProps {
  query: string
  onQueryChange: (query: string) => void
  matchCount: number | null
}

export function GraphSearch({ query, onQueryChange, matchCount }: GraphSearchProps) {
  const trimmed = query.trim()
  let status = ''
  if (matchCount !== null) {
    status = matchCount === 0 ? `No matches for "${trimmed}"` : `${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`
  }

  return (
    <div className="graph-search">
      <input
        type="search"
        aria-label="Search graph"
        placeholder="Search APIs, tags, tasks…"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onQueryChange('')
        }}
      />
      <p className="graph-search-status" role="status">
        {status}
      </p>
    </div>
  )
}
