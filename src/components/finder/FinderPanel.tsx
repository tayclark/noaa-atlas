// "I need…" task finder (#25/#34): pick a common task, see the recommended path of NOAA Atlas
// nodes (numbered steps, each with a one-line why). Picking a task selects it in the shared
// selectionStore (#43) so the graph highlights the whole path; clicking a step selects that
// single node, reusing the highlight/fly-to wiring already built for #44/#45.

import { useState } from 'react'
import graphJson from '../../data/graph.json'
import { parseGraphFile, type ServiceNode } from '../../data/graphSchema'
import { selectNode, selectTask } from '../../data/selectionStore'
import { parseTasksFile } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import './FinderPanel.css'

const tasks = parseTasksFile(tasksJson).tasks
const nodesById = new Map<string, ServiceNode>(parseGraphFile(graphJson).nodes.map((node) => [node.id, node]))

export function FinderPanel() {
  // Local, not derived from the store: a step click replaces the store's task selection with a
  // node selection, but the panel should keep showing the task the user picked.
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? null)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  return (
    <div className="finder-panel">
      <ul className="finder-task-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={`finder-task-item ${task.id === selectedTaskId ? 'finder-task-item-selected' : ''}`}
              aria-pressed={task.id === selectedTaskId}
              onClick={() => {
                setSelectedTaskId(task.id)
                selectTask(task.id)
              }}
            >
              {task.label}
            </button>
          </li>
        ))}
      </ul>
      {selectedTask && (
        <ol className="finder-node-list" aria-label="Recommended nodes">
          {selectedTask.nodes.map(({ nodeId, why }, i) => {
            const node = nodesById.get(nodeId)
            if (!node) return null
            return (
              <li key={nodeId} className="finder-node-item">
                <button type="button" className="finder-node-button" onClick={() => selectNode(nodeId)}>
                  <span className="finder-node-rank">
                    {i + 1}. {i === 0 ? 'Primary' : 'Also'}
                  </span>
                  <span className="finder-node-name">{node.name}</span>
                  <span className="finder-node-why">{why}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
