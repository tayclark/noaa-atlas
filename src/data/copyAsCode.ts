// Pure formatters that turn a RequestLogEntry into a pasteable command (#40 AC: copy as
// curl/fetch). Kept free of DOM/clipboard access so they're trivially unit-testable.

import type { RequestLogEntry } from './requestLog'

function headerFlags(headers: Record<string, string>): string[] {
  return Object.entries(headers).map(([key, value]) => `-H '${key}: ${value}'`)
}

export function toCurlCommand(entry: RequestLogEntry): string {
  return ['curl', ...headerFlags(entry.requestHeaders), `'${entry.url}'`].join(' ')
}

export function toFetchSnippet(entry: RequestLogEntry): string {
  const headerEntries = Object.entries(entry.requestHeaders)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join('\n')
  return `fetch(${JSON.stringify(entry.url)}, {\n  headers: {\n${headerEntries}\n  },\n})`
}
