// "I need…" task taxonomy (#25): maps common user tasks to ranked graph nodes with a one-line
// why. Mirrors graphSchema.ts's authored-file + zod-validation pattern.

import { z } from 'zod'
import { slug } from './schemaPrimitives'

const nonEmpty = z.string().trim().min(1)

const taskNodeSchema = z.strictObject({
  nodeId: slug,
  why: nonEmpty,
})

export const taskSchema = z.strictObject({
  id: slug,
  label: nonEmpty,
  nodes: z.array(taskNodeSchema).min(1),
})
export type Task = z.infer<typeof taskSchema>

const tasksFileSchema = z.strictObject({
  version: z.literal(1),
  tasks: z.array(taskSchema),
})
type TasksFile = z.infer<typeof tasksFileSchema>

/** Validates untrusted task data and throws an Error with readable field paths. */
export function parseTasksFile(raw: unknown): TasksFile {
  const result = tasksFileSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid tasks data:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
