// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DetailSheet } from './DetailSheet'
import { clearCompare, getCompareSnapshot } from '../data/compareStore'
import { clearSelection, getSelectionSnapshot, selectNode } from '../data/selectionStore'
import { getSheetBox, setSheetBox } from '../data/sheetStore'
import { getViewSnapshot, resetView } from '../data/viewStore'

// The area the sheet sits in is 700px tall and its header 124px, so it peeks at 124 and opens to 644.
const AREA = 700
const HEADER = 124

beforeEach(() => {
  clearSelection()
  clearCompare()
  resetView()
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(AREA)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(HEADER)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(360)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setSheetBox(null)
})

const sheet = (props: Partial<Parameters<typeof DetailSheet>[0]> = {}) => <DetailSheet view="graph" startOpen={false} {...props} />
const body = () => document.querySelector('.detail-sheet-body') as HTMLElement
const header = () => document.querySelector('.detail-sheet-header') as HTMLElement
const root = () => screen.getByLabelText('Node detail')

describe('DetailSheet', () => {
  it('renders nothing without a selected node', () => {
    const { container } = render(sheet())
    expect(container.firstChild).toBeNull()
  })

  it('shows the node, its live status and its actions in the header', () => {
    selectNode('nws-api')
    render(sheet())
    expect(screen.getByRole('heading', { name: /NWS/ })).toBeTruthy()
    expect(document.querySelector('.detail-sheet-heading .node-detail-live-tag')?.textContent).toBe('Live')
    expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show on globe' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close details' })).toBeTruthy()
  })

  it('leaves the live tag and the compare button out of the body, where the header already has them', () => {
    selectNode('nws-api')
    render(sheet())
    expect(body().querySelector('.node-detail-live-tag')).toBeNull()
    expect(body().querySelector('.node-detail-compare')).toBeNull()
    expect(body().textContent).toContain('Base URL')
  })

  it('peeks by default, with the body out of reach, and opens from the grabber', () => {
    selectNode('nws-api')
    render(sheet())
    const grabber = screen.getByRole('button', { name: 'Expand details' })
    expect(grabber.getAttribute('aria-expanded')).toBe('false')
    expect(body().hasAttribute('inert')).toBe(true)
    expect(getSheetBox()?.size).toBe(HEADER)
    expect(root().style.height).toBe(`${HEADER}px`)

    fireEvent.click(grabber)
    expect(screen.getByRole('button', { name: 'Collapse details' }).getAttribute('aria-expanded')).toBe('true')
    expect(body().hasAttribute('inert')).toBe(false)
    expect(getSheetBox()?.size).toBe(AREA - 56)
    expect(root().style.height).toBe(`${AREA - 56}px`)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }))
    expect(getSheetBox()?.size).toBe(HEADER)
  })

  it('starts open when asked to, as a finder step does', () => {
    selectNode('nws-api')
    render(sheet({ startOpen: true }))
    expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
    expect(getSheetBox()?.size).toBe(AREA - 56)
  })

  it('folds again when it moves to another view', () => {
    selectNode('nws-api')
    const { rerender } = render(sheet({ view: 'tasks', startOpen: true }))
    expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
    rerender(sheet({ view: 'graph', startOpen: true }))
    expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
  })

  it('keeps its height when the selection moves to another node', () => {
    selectNode('nws-api')
    render(sheet())
    fireEvent.click(screen.getByRole('button', { name: 'Expand details' }))
    act(() => selectNode('coops-data-api'))
    expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /CO-OPS/ })).toBeTruthy()
  })

  it('releases its height when it goes away', () => {
    selectNode('nws-api')
    const { unmount } = render(sheet())
    expect(getSheetBox()?.size).toBe(HEADER)
    unmount()
    expect(getSheetBox()).toBeNull()
  })

  it('dismisses, clearing the selection, from the close button and from Escape', () => {
    selectNode('nws-api')
    const { unmount } = render(sheet())
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
    unmount()

    selectNode('nws-api')
    render(sheet())
    fireEvent.keyDown(screen.getByRole('button', { name: 'Compare' }), { key: 'Escape' })
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
  })

  it('toggles the node in and out of the compare set', () => {
    selectNode('nws-api')
    render(sheet())
    const compare = screen.getByRole('button', { name: 'Compare' })
    expect(compare.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(compare)
    expect(getCompareSnapshot()).toEqual(['nws-api'])
    expect(screen.getByRole('button', { name: '✓ Compare' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '✓ Compare' }))
    expect(getCompareSnapshot()).toEqual([])
  })

  it('switches to the globe from Show on globe', () => {
    selectNode('nws-api')
    render(sheet())
    fireEvent.click(screen.getByRole('button', { name: 'Show on globe' }))
    expect(getViewSnapshot()).toBe('globe')
  })

  it('has no compare button or live tag for a theme hub, but still opens on the globe', () => {
    selectNode('theme-weather')
    render(sheet())
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
    expect(document.querySelector('.detail-sheet-heading .node-detail-live-tag')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show on globe' })).toBeTruthy()
  })

  describe('down the side of a phone held on its side', () => {
    it('is always open, with no grabber to fold it by, and reports its width from the right', () => {
      selectNode('nws-api')
      const { container } = render(sheet({ side: true }))
      expect(container.querySelector('.detail-sheet-side')).not.toBeNull()
      expect(screen.queryByRole('button', { name: /Expand details|Collapse details/ })).toBeNull()
      expect(body().hasAttribute('inert')).toBe(false)
      expect(root().style.height).toBe('')
      expect(getSheetBox()?.edge).toBe('right')
    })

    it('keeps its close button, Compare and Show on globe', () => {
      selectNode('nws-api')
      render(sheet({ side: true }))
      expect(screen.getByRole('button', { name: 'Close details' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Show on globe' })).toBeTruthy()
    })

    it('is not dragged by its header', () => {
      selectNode('nws-api')
      render(sheet({ side: true }))
      fireEvent.pointerDown(header(), { clientY: 700 })
      fireEvent.pointerMove(header(), { clientY: 200 })
      expect(root().className).not.toContain('detail-sheet-dragging')
      fireEvent.pointerUp(header(), { clientY: 200 })
      expect(getSheetBox()?.edge).toBe('right')
    })
  })

  describe('dragging the header', () => {
    it('opens when pulled up past the middle', () => {
      selectNode('nws-api')
      render(sheet())
      fireEvent.pointerDown(header(), { clientY: 700 })
      fireEvent.pointerMove(header(), { clientY: 200 })
      expect(root().className).toContain('detail-sheet-dragging')
      expect(root().style.height).toBe(`${HEADER + 500}px`)
      fireEvent.pointerUp(header(), { clientY: 200 })
      expect(root().className).not.toContain('detail-sheet-dragging')
      expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
    })

    it('stays at peek for a touch that does not move far enough to be a drag', () => {
      selectNode('nws-api')
      render(sheet())
      fireEvent.pointerDown(header(), { clientY: 700 })
      fireEvent.pointerMove(header(), { clientY: 697 })
      expect(root().className).not.toContain('detail-sheet-dragging')
      fireEvent.pointerUp(header(), { clientY: 697 })
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
    })

    it('folds from open when pulled well down, without dismissing', () => {
      selectNode('nws-api')
      render(sheet({ startOpen: true }))
      fireEvent.pointerDown(header(), { clientY: 100 })
      fireEvent.pointerMove(header(), { clientY: 700 })
      fireEvent.pointerUp(header(), { clientY: 700 })
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
      expect(getSelectionSnapshot().selectedNodeId).toBe('nws-api')
    })

    it('dismisses when pulled down from peek', () => {
      selectNode('nws-api')
      render(sheet())
      fireEvent.pointerDown(header(), { clientY: 500 })
      fireEvent.pointerMove(header(), { clientY: 600 })
      fireEvent.pointerUp(header(), { clientY: 600 })
      expect(getSelectionSnapshot().selectedNodeId).toBeNull()
    })

    it('ignores a press that starts on one of its buttons', () => {
      selectNode('nws-api')
      render(sheet())
      const close = screen.getByRole('button', { name: 'Compare' })
      fireEvent.pointerDown(close, { clientY: 500 })
      fireEvent.pointerMove(header(), { clientY: 100 })
      fireEvent.pointerUp(header(), { clientY: 100 })
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
    })

    it('does not let the click that ends a drag toggle the sheet', () => {
      selectNode('nws-api')
      render(sheet())
      const grabber = screen.getByRole('button', { name: 'Expand details' })
      fireEvent.pointerDown(grabber, { clientY: 700 })
      fireEvent.pointerMove(header(), { clientY: 200 })
      fireEvent.pointerUp(header(), { clientY: 200 })
      expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }))
      expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()
    })

    it('puts the sheet back when the browser takes the touch over', () => {
      selectNode('nws-api')
      render(sheet())
      fireEvent.pointerDown(header(), { clientY: 700 })
      fireEvent.pointerMove(header(), { clientY: 200 })
      fireEvent.pointerCancel(header())
      expect(root().className).not.toContain('detail-sheet-dragging')
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
    })
  })
})
