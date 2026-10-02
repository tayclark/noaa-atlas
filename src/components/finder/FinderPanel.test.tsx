// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearCompare, getCompareSnapshot } from '../../data/compareStore'
import { clearSelection, getHighlightedNodeIds, getSelectionSnapshot, selectNode, selectTask } from '../../data/selectionStore'
import { getViewSnapshot, resetView } from '../../data/viewStore'
import { mockNarrowLayout, unmockNarrowLayout } from '../narrowLayoutTestUtils'
import tasksJson from '../../data/tasks.json'
import { parseTasksFile } from '../../data/taskSchema'
import { FinderPanel } from './FinderPanel'

const tasks = parseTasksFile(tasksJson).tasks

beforeEach(() => {
  clearSelection()
  clearCompare()
  resetView()
})

afterEach(() => {
  cleanup()
  unmockNarrowLayout()
})

describe('FinderPanel', () => {
  it('lists every authored task', () => {
    render(<FinderPanel />)
    for (const task of tasks) {
      expect(screen.getByText(task.label)).toBeTruthy()
    }
  })

  it('starts with no task picked and explains the app instead (#148)', () => {
    render(<FinderPanel />)
    expect(screen.getByRole('region', { name: 'How to read NOAA Atlas' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Recommended nodes' })).toBeNull()
    for (const task of tasks) {
      expect(screen.getByText(task.label).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('picks a task selected from elsewhere, such as a link or Back (#266)', () => {
    const [first, second] = tasks
    if (!first || !second) throw new Error('expected at least two authored tasks')
    selectTask(first.id)
    render(<FinderPanel />)
    expect(screen.getByText(first.label).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('list', { name: 'Recommended nodes' })).toBeTruthy()
    act(() => selectTask(second.id))
    expect(screen.getByText(second.label).getAttribute('aria-pressed')).toBe('true')
    // A step's node replaces the task in the store, and the panel keeps showing the task.
    act(() => selectNode('nws-api'))
    expect(screen.getByText(second.label).getAttribute('aria-pressed')).toBe('true')
  })

  it('makes the intro scroller keyboard-focusable only while the intro is showing', () => {
    const first = tasks[0]
    if (!first) throw new Error('expected at least one authored task')
    render(<FinderPanel />)
    const intro = screen.getByRole('region', { name: 'How to read NOAA Atlas' })
    expect(intro.getAttribute('tabindex')).toBe('0')
    expect(intro.classList.contains('finder-body')).toBe(true)

    fireEvent.click(screen.getByText(first.label))
    expect(document.querySelector('.finder-body')?.hasAttribute('tabindex')).toBe(false)
  })

  it('replaces the intro with the picked task\'s ranked nodes', () => {
    const first = tasks[0]
    if (!first) throw new Error('expected at least one authored task')
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(first.label))
    expect(screen.queryByRole('region', { name: 'How to read NOAA Atlas' })).toBeNull()
    for (const { why } of first.nodes) {
      expect(screen.getByText(why)).toBeTruthy()
    }
  })

  it('shows a different task\'s ranked nodes on selection', () => {
    const other = tasks.find((task) => task.id !== tasks[0]?.id)
    if (!other) throw new Error('expected at least two authored tasks')
    render(<FinderPanel />)

    fireEvent.click(screen.getByText(other.label))

    for (const { why } of other.nodes) {
      expect(screen.getByText(why)).toBeTruthy()
    }
  })

  it('selects the clicked node via the shared selection store', () => {
    const task = tasks[0]
    const firstNode = task?.nodes[0]
    if (!task || !firstNode) throw new Error('expected at least one authored task with a node')
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))

    fireEvent.click(screen.getByText(firstNode.why))

    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.nodeId)
  })

  it("selects the clicked task in the store, highlighting its whole path (#34)", () => {
    const other = tasks.find((task) => task.id !== tasks[0]?.id)
    if (!other) throw new Error('expected at least two authored tasks')
    render(<FinderPanel />)

    fireEvent.click(screen.getByText(other.label))

    expect(getSelectionSnapshot().selectedTaskId).toBe(other.id)
    expect(getHighlightedNodeIds()).toEqual(other.nodes.map((n) => n.nodeId))
  })

  it('does not select anything until the user acts', () => {
    render(<FinderPanel />)
    expect(getSelectionSnapshot().selectedTaskId).toBeNull()
  })

  it('numbers the path steps in order', () => {
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(tasks[0]?.label ?? ''))
    const steps = screen.getAllByText(/^\d+\. (Primary|Also)$/)
    expect(steps.map((el) => el.textContent)).toEqual(
      (tasks[0]?.nodes ?? []).map((_, i) => `${i + 1}. ${i === 0 ? 'Primary' : 'Also'}`),
    )
  })

  it('keeps showing the picked task after a step click replaces the task selection', () => {
    const other = tasks.find((task) => task.id !== tasks[0]?.id)
    const step = other?.nodes[0]
    if (!other || !step) throw new Error('expected at least two authored tasks')
    render(<FinderPanel />)

    fireEvent.click(screen.getByText(other.label))
    fireEvent.click(screen.getByText(step.why))

    expect(getSelectionSnapshot()).toMatchObject({ selectedNodeId: step.nodeId, selectedTaskId: null })
    for (const { why } of other.nodes) {
      expect(screen.getByText(why)).toBeTruthy()
    }
  })
})

describe('FinderPanel on a phone (#78)', () => {
  const task = tasks[0]!
  const other = tasks[1]!

  beforeEach(() => {
    mockNarrowLayout(true)
  })

  it('opens on the task list with a note on how to read the app, and no steps', () => {
    render(<FinderPanel />)
    for (const { label } of tasks) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'How to read NOAA Atlas' }).textContent).toContain('Graph tab')
    expect(screen.queryByRole('list', { name: 'Recommended nodes' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Back|Tasks/ })).toBeNull()
  })

  it('drills into the picked task, replacing the list with its steps', () => {
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))

    expect(screen.getByRole('heading', { name: task.label })).toBeTruthy()
    for (const { why } of task.nodes) expect(screen.getByText(why)).toBeTruthy()
    expect(screen.queryByText(other.label)).toBeNull()
    expect(getSelectionSnapshot().selectedTaskId).toBe(task.id)
  })

  it('goes back to the list, clearing the selection', () => {
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))
    fireEvent.click(screen.getByRole('button', { name: /Tasks/ }))

    expect(screen.getByText(other.label)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Recommended nodes' })).toBeNull()
    expect(getSelectionSnapshot()).toMatchObject({ selectedTaskId: null, selectedNodeId: null })
  })

  it('keeps the task page when a step narrows the selection to one node', () => {
    const step = task.nodes[0]!
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))
    fireEvent.click(screen.getByText(step.why))

    expect(getSelectionSnapshot()).toMatchObject({ selectedNodeId: step.nodeId, selectedTaskId: null })
    expect(screen.getByRole('heading', { name: task.label })).toBeTruthy()
  })

  it('puts the whole task back and goes to the graph or the globe', () => {
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))
    selectNode(task.nodes[0]!.nodeId)

    fireEvent.click(screen.getByRole('button', { name: 'Show on graph' }))
    expect(getSelectionSnapshot()).toMatchObject({ selectedTaskId: task.id, selectedNodeId: null })
    expect(getViewSnapshot()).toBe('graph')

    fireEvent.click(screen.getByRole('button', { name: 'Show on globe' }))
    expect(getViewSnapshot()).toBe('globe')
  })

  it('adds the whole path to the comparison', () => {
    render(<FinderPanel />)
    fireEvent.click(screen.getByText(task.label))
    fireEvent.click(screen.getByRole('button', { name: 'Compare these' }))
    expect(getCompareSnapshot()).toEqual(task.nodes.map((n) => n.nodeId))
  })
})
