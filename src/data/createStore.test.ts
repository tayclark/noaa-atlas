import { describe, expect, it, vi } from 'vitest'
import { createStore } from './createStore'

describe('createStore', () => {
  it('holds a value and notifies subscribers when it changes', () => {
    const store = createStore(1)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(2)
    expect(store.get()).toBe(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify for the same value, by Object.is or the given equality', () => {
    const store = createStore({ n: 1 }, (a, b) => a.n === b.n)
    const before = store.get()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ n: 1 })
    expect(store.get()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    const plain = createStore('a')
    plain.subscribe(listener)
    plain.set('a')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const store = createStore(0)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set(1)
    expect(listener).not.toHaveBeenCalled()
  })
})
