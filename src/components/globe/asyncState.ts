// One shape for a globe layer's loading state (#354): the SPC outlook, storm tracks, alerts, aurora,
// Kp and the buoy lists all report it, and the e2e specs read its `status` from data attributes.
// 'empty' is a good answer with nothing to draw, which a layer shows as a message, not an error.

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string }

export const LOADING: AsyncState<never> = { status: 'loading' }

export const loadedWith = <T>(data: T): AsyncState<T> => ({ status: 'ok', data })

export const failedWith = (message: string): AsyncState<never> => ({ status: 'error', message })

/** The loaded data, or null while loading, empty or failed. */
export function dataOf<T>(state: AsyncState<T>): T | null {
  return state.status === 'ok' ? state.data : null
}

/** The error message, or null. */
export function errorOf(state: AsyncState<unknown>): string | null {
  return state.status === 'error' ? state.message : null
}

/** Reports loaded data that has nothing to draw as 'empty'. */
export function withEmpty<T>(state: AsyncState<T>, isEmpty: (data: T) => boolean): AsyncState<T> {
  return state.status === 'ok' && isEmpty(state.data) ? { status: 'empty' } : state
}
