// The module-level store behind selectionStore.ts, requestLog.ts and the other shared state (#351):
// one value, the listeners `useSyncExternalStore` subscribes, and a set that only notifies when the
// value changes. This codebase has no state library; each store module wraps one of these and
// exports its own named actions.

export interface Store<T> {
  /** The current value. The same object until it changes, as `useSyncExternalStore` needs. */
  get: () => T
  /** Replaces the value and notifies, unless `equals` says it is the same as the current one. */
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (equals(value, next)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
