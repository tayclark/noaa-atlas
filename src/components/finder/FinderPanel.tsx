// "I need…" task finder (#25/#34): pick a common task, see the recommended path of NOAA Atlas
// nodes (numbered steps, each with a one-line why). Picking a task selects it in the shared
// selectionStore (#43) so the graph highlights the whole path; clicking a step selects that
// single node, reusing the highlight/fly-to wiring already built for #44/#45.

import { useRef, useState } from 'react'
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
  // node selection, but the panel should keep showing the task the user picked. Starts empty, so
  // the panel never shows a task as picked when nothing is selected (#148).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const bodyRef = useRef<HTMLDivElement>(null)

  return (
    <div className="finder-panel">
      <h2 className="finder-heading" id="finder-heading">
        I need to…
      </h2>
      <ul className="finder-task-list" aria-labelledby="finder-heading">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={`finder-task-item ${task.id === selectedTaskId ? 'finder-task-item-selected' : ''}`}
              aria-pressed={task.id === selectedTaskId}
              onClick={(event) => {
                setSelectedTaskId(task.id)
                selectTask(task.id)
                // Show the new steps from the top, next to the task the user just picked (#161).
                bodyRef.current?.scrollTo?.({ top: 0 })
                event.currentTarget.scrollIntoView?.({ block: 'nearest' })
              }}
            >
              {task.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="finder-body" ref={bodyRef}>
        {!selectedTask && <FinderIntro />}
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
    </div>
  )
}

/** What the app is and how to read it, shown until a task is picked (#148). */
function FinderIntro() {
  return (
    <section className="finder-intro" aria-label="How to read NOAA Atlas">
      <p className="finder-intro-lead">Pick a task above to see which NOAA APIs to use.</p>
      <ul>
        <li>
          The <strong>graph</strong> below maps NOAA&apos;s public APIs: NOAA at the centre, then themes, then
          services.
        </li>
        <li>
          The <strong>globe</strong> shows where a selected service has data, plus live weather alerts, the aurora
          forecast and the Kp index.
        </li>
        <li>Click anything, on either side, and the other side follows.</li>
      </ul>
    </section>
  )
}
