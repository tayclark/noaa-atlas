// Escape as a keyboard user's "click on empty space" (#267): it closes what is open on top, a
// globe popup first, and then clears the selection, from wherever focus is (the graph, the detail
// card, the globe). Fields keep Escape for themselves, and a modal dialog closes on its own.

import { clearSelection, getSelectionSnapshot } from '../data/selectionStore'

/** Closes something if it is open, and says whether it did. */
export type Dismisser = () => boolean

const dismissers: Dismisser[] = []

/** Adds a dismisser, tried before those added earlier. Returns a function that removes it. */
export function registerDismisser(dismiss: Dismisser): () => void {
  dismissers.unshift(dismiss)
  return () => {
    const i = dismissers.indexOf(dismiss)
    if (i >= 0) dismissers.splice(i, 1)
  }
}

interface EscapeEventLike {
  key: string
  defaultPrevented: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  target: EventTarget | null
}

const OWN_ESCAPE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open]'

/** Whether a keydown is an Escape that the app as a whole should act on. */
export function shouldHandleEscape(event: EscapeEventLike): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false
  const target = event.target
  return !(target instanceof Element && target.closest(OWN_ESCAPE))
}

/** Runs the first dismisser that closes something, or else clears the selection. Says whether anything happened. */
export function handleEscape(): boolean {
  if (dismissers.some((dismiss) => dismiss())) return true
  const { selectedNodeId, selectedPoint, selectedTaskId } = getSelectionSnapshot()
  if (!selectedNodeId && !selectedPoint && !selectedTaskId) return false
  clearSelection()
  return true
}

/** The document-level listener: one per app. */
export function onEscapeKeyDown(event: KeyboardEvent): void {
  if (shouldHandleEscape(event) && handleEscape()) event.preventDefault()
}
