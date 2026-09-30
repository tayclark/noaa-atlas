import { describe, expect, it } from 'vitest'
import { selectionAnnouncement } from './a11yAnnouncements'

const nodes = new Map([['nws-api', 'NWS API']])
const tasks = new Map([['t1', 'Get a forecast']])
const none = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }

describe('selectionAnnouncement', () => {
  it('is empty with no selection', () => {
    expect(selectionAnnouncement(none, nodes, tasks, 0)).toBe('')
  })

  it('names a selected node', () => {
    expect(selectionAnnouncement({ ...none, selectedNodeId: 'nws-api' }, nodes, tasks, 1)).toBe('Selected NWS API')
  })

  it('is empty for an unknown node or task', () => {
    expect(selectionAnnouncement({ ...none, selectedNodeId: 'nope' }, nodes, tasks, 0)).toBe('')
    expect(selectionAnnouncement({ ...none, selectedTaskId: 'nope' }, nodes, tasks, 0)).toBe('')
  })

  it('counts a task path in steps', () => {
    expect(selectionAnnouncement({ ...none, selectedTaskId: 't1' }, nodes, tasks, 3)).toBe('Selected task: Get a forecast, 3 steps')
    expect(selectionAnnouncement({ ...none, selectedTaskId: 't1' }, nodes, tasks, 1)).toBe('Selected task: Get a forecast, 1 step')
  })

  it('counts the services covering a map point', () => {
    expect(selectionAnnouncement({ ...none, selectedPoint: [0, 0] }, nodes, tasks, 2)).toBe('Selected a map point covered by 2 services')
    expect(selectionAnnouncement({ ...none, selectedPoint: [0, 0] }, nodes, tasks, 1)).toBe('Selected a map point covered by 1 service')
  })
})
