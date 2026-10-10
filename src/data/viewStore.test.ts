import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getViewSnapshot, resetView, resolveView, showView, subscribeView, tabsFor } from './viewStore'

beforeEach(resetView)

describe('viewStore', () => {
  it('starts on Explore and notifies subscribers when the view changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeView(listener)
    expect(getViewSnapshot()).toBe('explore')

    showView('globe')
    expect(getViewSnapshot()).toBe('globe')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    showView('compare')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when the view is already showing', () => {
    const listener = vi.fn()
    subscribeView(listener)
    showView('explore')
    expect(listener).not.toHaveBeenCalled()
  })

  it('lists the tabs for each layout', () => {
    expect(tabsFor(false, false)).toEqual(['explore', 'compare', 'inspector'])
    expect(tabsFor(false, true)).toEqual(['explore', 'compare', 'inspector'])
    expect(tabsFor(true, true)).toEqual(['tasks', 'graph', 'globe', 'compare', 'inspector'])
    expect(tabsFor(true, false)).toEqual(['tasks', 'graph', 'compare', 'inspector'])
  })

  it('resolves a requested view against the layout', () => {
    expect(resolveView('explore', true)).toBe('graph')
    expect(resolveView('graph', true)).toBe('graph')
    expect(resolveView('globe', true)).toBe('globe')
    expect(resolveView('tasks', false)).toBe('explore')
    expect(resolveView('graph', false)).toBe('explore')
    expect(resolveView('globe', false)).toBe('explore')
    expect(resolveView('compare', false)).toBe('compare')
    expect(resolveView('inspector', true)).toBe('inspector')
  })
})
