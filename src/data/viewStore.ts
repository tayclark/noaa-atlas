// Which view of the left panel is showing (#78). A module-level store like selectionStore.ts, so
// a component that isn't LeftPanel (a "Show on globe" button) can switch views too. The value is a
// request: LeftPanel resolves it against the layout, so the same id means "the finder and graph
// together" on a wide screen and one of its own tabs on a phone.

export type ViewId = 'explore' | 'tasks' | 'graph' | 'globe' | 'compare' | 'inspector'

let activeView: ViewId = 'explore'
const listeners = new Set<() => void>()

export function showView(view: ViewId): void {
  if (view === activeView) return
  activeView = view
  for (const listener of listeners) listener()
}

/** Back to the first view. Also intended for test isolation between cases. */
export function resetView(): void {
  showView('explore')
}

export function subscribeView(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getViewSnapshot(): ViewId {
  return activeView
}

const COMPACT_VIEWS: ViewId[] = ['tasks', 'graph', 'globe', 'compare', 'inspector']
const WIDE_VIEWS: ViewId[] = ['explore', 'compare', 'inspector']

/**
 * The tab a requested view lands on. Compact layouts split Explore into Tasks and Graph, landing on
 * the graph (#349), and a wide one folds them (and the globe, which is always beside the panel
 * there) back into Explore.
 */
export function resolveView(view: ViewId, compact: boolean): ViewId {
  if (compact) return view === 'explore' ? 'graph' : view
  return WIDE_VIEWS.includes(view) ? view : 'explore'
}

export const tabsFor = (compact: boolean, withGlobe: boolean): ViewId[] =>
  compact ? COMPACT_VIEWS.filter((view) => withGlobe || view !== 'globe') : WIDE_VIEWS
