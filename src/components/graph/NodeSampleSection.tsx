// Sample call section of the node detail panel (#31): a copyable request plus either a static
// response excerpt or, for nodes with a live client, a button that runs the call for real.

import { useState } from 'react'
import { toCurlCommand, toFetchSnippet } from '../../data/copyAsCode'
import type { ServiceNode } from '../../data/graphSchema'
import { getPoint } from '../../data/nwsClient'
import { getPlanetaryKp } from '../../data/swpcClient'
import { CopyButton } from '../CopyButton'
import { COOPS_TRY_ITS } from './coopsTryIt'
import { NCEI_TRY_ITS } from './nceiTryIt'
import { SWPC_TRY_ITS } from './swpcTryIt'
import type { TryItTable } from './tryItTable'

// Must match the `sample.url` authored in graph.json for the same node.
const RUNNABLE_SAMPLES: Partial<Record<string, () => Promise<unknown>>> = {
  'nws-api': () => getPoint(39.7456, -97.0892),
  // OVATION isn't runnable here: its ~1 MB grid is no use as a pretty-printed body.
  'swpc-geomagnetic-indices': () => getPlanetaryKp(),
  // The CO-OPS Data API isn't runnable either: the client returns a parsed result (latest row, `ok` wrapper), not
  // the raw body the sample excerpt shows, so the live output wouldn't match the sample it replaces.
}

// Nodes whose Run sample shows tables rather than a raw body.
const TRY_ITS = { ...SWPC_TRY_ITS, ...COOPS_TRY_ITS, ...NCEI_TRY_ITS }

type RunState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; body: string; tables?: undefined }
  | { status: 'done'; body?: undefined; tables: TryItTable[] }
  | { status: 'error'; message: string }

export function NodeSampleSection({ node }: { node: ServiceNode }) {
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  const { sample } = node
  if (!sample) return null

  const runSample = RUNNABLE_SAMPLES[node.id]
  const runTables = TRY_ITS[node.id]
  const request = { url: sample.url, requestHeaders: sample.headers ?? {} }

  const onRun = () => {
    if (!runSample && !runTables) return
    setRun({ status: 'loading' })
    const onError = (err: unknown) => setRun({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    if (runTables) runTables().then((tables) => setRun({ status: 'done', tables }), onError)
    else if (runSample) runSample().then((result) => setRun({ status: 'done', body: JSON.stringify(result, null, 2) }), onError)
  }

  const showingLive = run.status === 'done'
  const body = run.status === 'done' && run.body !== undefined ? run.body : sample.responseExcerpt
  const tables = run.status === 'done' ? run.tables : undefined

  return (
    <section className="node-sample" aria-label="Sample call">
      <h4>Sample call</h4>
      <code className="node-sample-url">GET {sample.url}</code>
      <div className="node-sample-actions">
        <CopyButton label="Copy as curl" text={toCurlCommand(request)} />
        <CopyButton label="Copy as fetch" text={toFetchSnippet(request)} />
        {(runSample || runTables) && (
          <button type="button" onClick={onRun} disabled={run.status === 'loading'}>
            {run.status === 'loading' ? 'Running…' : 'Run sample'}
          </button>
        )}
      </div>
      {run.status === 'error' && (
        <p className="node-sample-error" role="alert">
          Sample call failed: {run.message}
        </p>
      )}
      <span className="node-sample-label">{showingLive ? 'Live response (parsed)' : 'Static sample'}</span>
      {tables ? (
        tables.map((table) => (
          <div className="node-sample-table-wrap" key={table.caption} tabIndex={0} role="region" aria-label={table.caption}>
            <table className="node-sample-table">
              <caption>{table.caption}</caption>
              <thead>
                <tr>
                  {table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.join('|')}>
                    {row.map((cell, i) => (
                      <td key={table.columns[i]}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <pre className="node-sample-body" tabIndex={0} aria-label="Sample response">{body}</pre>
      )}
    </section>
  )
}
