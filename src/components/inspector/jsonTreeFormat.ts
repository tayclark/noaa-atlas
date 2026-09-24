// Pure helpers for JsonTree.tsx (#150): the one-line summary of a JSON value and which of a
// container's children to show. A response body can be thousands of lines (the active alerts
// feed), so the tree starts folded and long arrays are paged.

/** Array items shown before a "Show N more" button. */
export const ARRAY_PAGE_SIZE = 20

export type JsonContainer = Record<string, unknown> | unknown[]

export function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "{…} 3 keys", "[…] 467 items", or the value itself as JSON for a primitive. */
export function summarizeJson(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[…] ${count(value.length, 'item', 'items')}`
  if (isContainer(value)) {
    const keys = Object.keys(value).length
    return keys === 0 ? '{}' : `{…} ${count(keys, 'key', 'keys')}`
  }
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

export interface VisibleChildren {
  entries: [key: string, value: unknown][]
  hidden: number
}

/** A container's children, with arrays cut to `limit` items; objects are always shown whole. */
export function visibleChildren(value: JsonContainer, limit: number): VisibleChildren {
  if (!Array.isArray(value)) return { entries: Object.entries(value), hidden: 0 }
  const shown = value.slice(0, limit)
  return { entries: shown.map((item, i) => [String(i), item]), hidden: value.length - shown.length }
}
