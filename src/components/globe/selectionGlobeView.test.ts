import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import { nodesCoveringPoint } from '../../data/coverageLookup'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile, THEME_LABELS } from '../../data/graphSchema'
import type { Selection } from '../../data/selectionStore'
import { parseTasksFile } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import { THEME_COLORS } from '../../data/themeColors'
import { describeSelectionForGlobe, type GlobeViewContext } from './selectionGlobeView'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const tasks = parseTasksFile(tasksJson).tasks
const context: GlobeViewContext = { nodes, tasks, nodesAtPoint: (point) => nodesCoveringPoint(nodes, point) }
const none: Selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }
const findNode = (id: string): ServiceNode => {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new Error(`fixture node "${id}" not found in graph.json`)
  return node
}

describe('describeSelectionForGlobe', () => {
  it('shows nothing when nothing is selected', () => {
    const view = describeSelectionForGlobe(none, context)
    expect(view.footprint.features).toEqual([])
    expect(view.flyTarget).toBeNull()
    expect(view.card).toBeNull()
  })

  it('draws a live service in its theme colour, frames it and highlights the live layer', () => {
    const node = findNode('nws-api')
    const view = describeSelectionForGlobe({ ...none, selectedNodeId: node.id }, context)
    expect(view.footprint.features).toEqual([
      { type: 'Feature', geometry: node.coverage, properties: { nodeId: node.id, color: THEME_COLORS.weather } },
    ])
    expect(view.flyTarget?.kind).toBe('bounds')
    expect(view.liveHighlighted).toBe(true)
    expect(view.card).toEqual({
      title: node.name,
      lines: ['Coverage outlined on the globe.', 'Its live layer, active alerts, is highlighted.'],
      colors: [THEME_COLORS.weather],
    })
  })

  it('explains why a not-live service is not on the map', () => {
    const node = findNode('spc-gis-data')
    const view = describeSelectionForGlobe({ ...none, selectedNodeId: node.id }, context)
    expect(view.liveHighlighted).toBe(false)
    expect(view.card?.lines[1]).toBe(node.notLiveReason)
  })

  it('says worldwide coverage tints the globe, and stays put instead of framing the world', () => {
    const view = describeSelectionForGlobe({ ...none, selectedNodeId: 'gfs-aws-open-data' }, context)
    expect(view.flyTarget).toEqual({ kind: 'global' })
    expect(view.card?.lines[0]).toBe('Coverage worldwide, so the whole globe is tinted.')
  })

  it('draws every service of a selected theme hub', () => {
    const ocean = nodes.filter((n) => n.theme === 'ocean')
    const view = describeSelectionForGlobe({ ...none, selectedNodeId: 'theme-ocean' }, context)
    expect(view.footprint.features.map((f) => f.properties.nodeId)).toEqual(ocean.map((n) => n.id))
    expect(view.card?.title).toBe(THEME_LABELS.ocean)
    expect(view.card?.lines[0]).toMatch(new RegExp(`^Coverage of its ${ocean.length} services`))
    expect(view.card?.colors).toEqual([THEME_COLORS.ocean])
  })

  it('says an empty theme has no services and draws nothing', () => {
    const withoutSpaceWeather = { ...context, nodes: nodes.filter((n) => n.theme !== 'space-weather') }
    const view = describeSelectionForGlobe({ ...none, selectedNodeId: 'theme-space-weather' }, withoutSpaceWeather)
    expect(view.footprint.features).toEqual([])
    expect(view.card?.lines).toEqual(['No services curated yet.'])
  })

  it('draws every step of a selected task, one colour per theme involved', () => {
    const task = tasks[0]
    if (!task) throw new Error('expected at least one task')
    const view = describeSelectionForGlobe({ ...none, selectedTaskId: task.id }, context)
    expect(view.footprint.features.map((f) => f.properties.nodeId)).toEqual(task.nodes.map((n) => n.nodeId))
    expect(view.card?.title).toBe(task.label)
    expect(view.card?.lines[0]).toMatch(task.nodes.length === 1 ? /^Coverage of its API / : /^Coverage of its \d+ APIs /)
    const themes = new Set(task.nodes.map((n) => findNode(n.nodeId).theme))
    expect(view.card?.colors).toHaveLength(themes.size)
  })

  it('counts the services covering a selected point without moving the globe', () => {
    const point = [-97.5, 35.5] as const
    const view = describeSelectionForGlobe({ ...none, selectedPoint: point }, context)
    const count = nodesCoveringPoint(nodes, point).length
    expect(view.flyTarget).toBeNull()
    expect(view.footprint.features).toEqual([])
    expect(view.card?.lines).toEqual([`${count} APIs cover this spot, highlighted in the graph.`])
  })

  it('shows nothing for an id it does not know, such as the graph root', () => {
    expect(describeSelectionForGlobe({ ...none, selectedNodeId: 'noaa' }, context).card).toBeNull()
    expect(describeSelectionForGlobe({ ...none, selectedTaskId: 'nope' }, context).card).toBeNull()
  })

  it('describes every real service without throwing, as a drift guard', () => {
    for (const node of nodes) {
      const view = describeSelectionForGlobe({ ...none, selectedNodeId: node.id }, context)
      expect(view.card?.lines).toHaveLength(2)
      expect(view.flyTarget).not.toBeNull()
    }
  })
})
