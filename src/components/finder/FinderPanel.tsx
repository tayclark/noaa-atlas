// "I need…" task finder (#25): pick a common task, see the ranked NOAA Atlas nodes that answer
// it with a one-line why. Selecting a node calls the shared selectionStore (#43) so the
// highlight/fly-to wiring already built for #44/#45 works here with no new selection logic.

import { useState } from 'react'
import graphJson from '../../data/graph.json'
import { parseGraphFile, type ServiceNode } from '../../data/graphSchema'
import { selectNode } from '../../data/selectionStore'
import { parseTasksFile } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import './FinderPanel.css'

const tasks = parseTasksFile(tasksJson).tasks
const nodesById = new Map<string, ServiceNode>(parseGraphFile(graphJson).nodes.map((node) => [node.id, node]))

export function FinderPanel() {
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
              onClick={() => setSelectedTaskId(task.id)}
            >
              {task.label}
            </button>
          </li>
        ))}
      </ul>
      {selectedTask && (
        <ul className="finder-node-list" aria-label="Recommended nodes">
          {selectedTask.nodes.map(({ nodeId, why }, i) => {
            const node = nodesById.get(nodeId)
            if (!node) return null
            return (
              <li key={nodeId} className="finder-node-item">
                <button type="button" className="finder-node-button" onClick={() => selectNode(nodeId)}>
                  <span className="finder-node-rank">{i === 0 ? 'Primary' : 'Also'}</span>
                  <span className="finder-node-name">{node.name}</span>
                  <span className="finder-node-why">{why}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
