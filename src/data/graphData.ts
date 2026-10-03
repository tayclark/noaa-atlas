// The curated graph and tasks, validated once at startup (#270). Every runtime module imports them
// from here rather than parsing graph.json and tasks.json itself; graphData.test.ts enforces that.

import { buildGraph } from './buildGraph'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'
import { parseTasksFile } from './taskSchema'
import tasksJson from './tasks.json'

/** The authored file: service nodes and shared-id / data-flow edges. */
export const graphFile = parseGraphFile(graphJson)
/** The file plus the NOAA root, theme hubs and derived edges. */
export const graph = buildGraph(graphFile)
export const tasks = parseTasksFile(tasksJson).tasks
