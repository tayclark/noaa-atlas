/**
 * Wraps a lazy load (#269) so it runs once and every caller shares the result. A failed load,
 * whether the import or its validation, is forgotten, so the next call retries.
 */
export function loadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = null
      throw err
    })
    return pending
  }
}
