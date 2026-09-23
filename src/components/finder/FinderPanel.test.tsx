// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSelection, getSelectionSnapshot } from '../../data/selectionStore'
import tasksJson from '../../data/tasks.json'
import { parseTasksFile } from '../../data/taskSchema'
import { FinderPanel } from './FinderPanel'

const tasks = parseTasksFile(tasksJson).tasks

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

describe('FinderPanel', () => {
  it('lists every authored task', () => {
    render(<FinderPanel />)
    for (const task of tasks) {
      expect(screen.getByText(task.label)).toBeTruthy()
    }
  })

  it('shows the first task\'s ranked nodes by default', () => {
    render(<FinderPanel />)
    const first = tasks[0]
    if (!first) throw new Error('expected at least one authored task')
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

    fireEvent.click(screen.getByText(firstNode.why))

    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.nodeId)
  })
})
