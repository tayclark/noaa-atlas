// Calls `tick` every `intervalMs` while the tab is visible. A hidden tab skips its ticks, and
// coming back to the tab ticks at once when the last one is older than the interval, so returning
// after a long absence shows fresh data rather than waiting out the rest of the interval.
// Returns a function that stops polling.

export function pollWhileVisible(tick: () => void, intervalMs: number): () => void {
  let lastTickAt = Date.now()

  const run = () => {
    lastTickAt = Date.now()
    tick()
  }

  const timer = setInterval(() => {
    if (!document.hidden) run()
  }, intervalMs)

  const onVisibilityChange = () => {
    if (!document.hidden && Date.now() - lastTickAt >= intervalMs) run()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
