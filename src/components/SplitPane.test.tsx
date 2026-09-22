// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SplitPane } from './SplitPane'
import { MAX_FRACTION, MIN_FRACTION, clampFraction } from './splitFraction'

afterEach(cleanup)

const renderPane = () => render(<SplitPane left={<p>L</p>} right={<p>R</p>} />)
const value = () => Number(screen.getByRole('separator').getAttribute('aria-valuenow'))

describe('clampFraction', () => {
  it('limits values to the allowed range', () => {
    expect(clampFraction(0)).toBe(MIN_FRACTION)
    expect(clampFraction(1)).toBe(MAX_FRACTION)
    expect(clampFraction(0.4)).toBe(0.4)
  })
})

describe('SplitPane', () => {
  it('exposes separator semantics and starts at 50%', () => {
    renderPane()
    const sep = screen.getByRole('separator')
    expect(sep.getAttribute('aria-orientation')).toBe('vertical')
    expect(sep.getAttribute('aria-valuemin')).toBe('25')
    expect(sep.getAttribute('aria-valuemax')).toBe('75')
    expect(value()).toBe(50)
  })

  it('resizes with arrow keys and snaps with Home/End', () => {
    renderPane()
    const sep = screen.getByRole('separator')
    fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(value()).toBe(52)
    fireEvent.keyDown(sep, { key: 'ArrowLeft' })
    fireEvent.keyDown(sep, { key: 'ArrowLeft' })
    expect(value()).toBe(48)
    fireEvent.keyDown(sep, { key: 'Home' })
    expect(value()).toBe(25)
    fireEvent.keyDown(sep, { key: 'End' })
    expect(value()).toBe(75)
    fireEvent.keyDown(sep, { key: 'a' })
    expect(value()).toBe(75)
  })

  it('follows the pointer while dragging and clamps', () => {
    const { container } = renderPane()
    const sep = screen.getByRole('separator')
    const root = container.firstElementChild as HTMLElement
    root.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect

    fireEvent.pointerMove(sep, { clientX: 300 })
    expect(value()).toBe(50)

    fireEvent.pointerDown(sep, { clientX: 500 })
    fireEvent.pointerMove(sep, { clientX: 300 })
    expect(value()).toBe(30)
    fireEvent.pointerMove(sep, { clientX: 50 })
    expect(value()).toBe(25)
    fireEvent.pointerUp(sep)
    fireEvent.pointerMove(sep, { clientX: 700 })
    expect(value()).toBe(25)
  })

  it('ignores drag when the container has no width', () => {
    const { container } = renderPane()
    const sep = screen.getByRole('separator')
    ;(container.firstElementChild as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, width: 0 }) as DOMRect
    fireEvent.pointerDown(sep)
    fireEvent.pointerMove(sep, { clientX: 300 })
    expect(value()).toBe(50)
  })
})
