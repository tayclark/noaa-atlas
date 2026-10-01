// "I need…" task finder (#25/#34): pick a common task, see the recommended path of NOAA Atlas
// nodes (numbered steps, each with a one-line why). Picking a task selects it in the shared
// selectionStore (#43) so the graph highlights the whole path; clicking a step selects that
// single node, reusing the highlight/fly-to wiring already built for #44/#45.
//
// On a phone (#78) the finder is the whole Tasks tab, so it drills down instead of sharing the
// pane: the task list, then a page for the picked task, with Back to the list.

import { useRef, useState } from 'react'
import graphJson from '../../data/graph.json'
import { parseGraphFile, type ServiceNode } from '../../data/graphSchema'
import { addCompare } from '../../data/compareStore'
import { clearSelection, selectNode, selectTask } from '../../data/selectionStore'
import { parseTasksFile, type Task } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import { showView } from '../../data/viewStore'
import { useNarrowLayout } from '../useNarrowLayout'
import './FinderPanel.css'

const tasks = parseTasksFile(tasksJson).tasks
const nodesById = new Map<string, ServiceNode>(parseGraphFile(graphJson).nodes.map((node) => [node.id, node]))

export function FinderPanel() {
  const compact = useNarrowLayout()
  // Local, not derived from the store: a step click replaces the store's task selection with a
  // node selection, but the panel should keep showing the task the user picked. Starts empty, so
  // the panel never shows a task as picked when nothing is selected (#148).
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const bodyRef = useRef<HTMLDivElement>(null)

  if (compact) {
    return selectedTask ? (
      <TaskPage
        task={selectedTask}
        onBack={() => {
          setSelectedTaskId(null)
          clearSelection()
        }}
      />
    ) : (
      <div className="finder-panel finder-compact">
        <h2 className="finder-heading" id="finder-heading">
          I need to…
        </h2>
        <ul className="finder-task-list" aria-labelledby="finder-heading">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                className="finder-task-item"
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
        <FinderIntro compact />
      </div>
    )
  }

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
      {/* With only the intro inside there is nothing focusable, so the scroller takes focus itself
          (axe scrollable-region-focusable); the steps' buttons cover that once a task is picked. */}
      <div
        className="finder-body"
        ref={bodyRef}
        {...(selectedTask ? {} : { tabIndex: 0, role: 'region', 'aria-label': 'How to read NOAA Atlas' })}
      >
        {!selectedTask && <FinderIntro />}
        {selectedTask && (
          <>
            <TaskSteps task={selectedTask} />
            <button
              type="button"
              className="finder-compare"
              onClick={() => addCompare(selectedTask.nodes.map((n) => n.nodeId))}
            >
              Compare these
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** A task's recommended nodes, ranked, each a button that selects that one node. */
function TaskSteps({ task }: { task: Task }) {
  return (
    <ol className="finder-node-list" aria-label="Recommended nodes">
      {task.nodes.map(({ nodeId, why }, i) => {
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
  )
}

/** The picked task on a phone: Back to the list, its steps, and a way on to the graph and globe. */
function TaskPage({ task, onBack }: { task: Task; onBack: () => void }) {
  // A step click narrowed the selection to one node; these put the whole task back.
  const showOn = (view: 'graph' | 'globe') => {
    selectTask(task.id)
    showView(view)
  }
  return (
    <div className="finder-panel finder-compact">
      <div className="finder-page-header">
        <button type="button" className="finder-back" onClick={onBack}>
          <span aria-hidden="true">‹ </span>Tasks
        </button>
        <h2 className="finder-page-title">{task.label}</h2>
      </div>
      <TaskSteps task={task} />
      <div className="finder-page-actions">
        <button type="button" onClick={() => showOn('graph')}>
          Show on graph
        </button>
        <button type="button" onClick={() => showOn('globe')}>
          Show on globe
        </button>
        <button type="button" onClick={() => addCompare(task.nodes.map((n) => n.nodeId))}>
          Compare these
        </button>
      </div>
    </div>
  )
}

/** What the app is and how to read it, shown until a task is picked (#148). */
function FinderIntro({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="finder-intro" role="region" aria-label="How to read NOAA Atlas">
        <p className="finder-intro-lead">Pick a task to see which NOAA APIs to use.</p>
        <ul>
          <li>
            The <strong>Graph</strong> tab maps NOAA&apos;s public APIs: NOAA at the centre, then themes, then services.
          </li>
          <li>
            The <strong>Globe</strong> tab shows where a selected service has data, plus live weather alerts, the aurora forecast and the
            Kp index.
          </li>
          <li>Tap anything, and the other tabs follow.</li>
        </ul>
      </div>
    )
  }
  return (
    <div className="finder-intro">
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
    </div>
  )
}
