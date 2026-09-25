// Sample call section of the node detail panel (#31): a copyable request plus either a static
// response excerpt or, for nodes with a live client, a button that runs the call for real.

import { useState } from 'react'
import { toCurlCommand, toFetchSnippet } from '../../data/copyAsCode'
import type { ServiceNode } from '../../data/graphSchema'
import { getPoint } from '../../data/nwsClient'
import { getPlanetaryKp } from '../../data/swpcClient'

// Must match the `sample.url` authored in graph.json for the same node.
const RUNNABLE_SAMPLES: Partial<Record<string, () => Promise<unknown>>> = {
  'nws-api': () => getPoint(39.7456, -97.0892),
  // OVATION isn't runnable here: its ~1 MB grid is no use as a pretty-printed body.
  'swpc-geomagnetic-indices': () => getPlanetaryKp(),
}

type RunState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; body: string } | { status: 'error'; message: string }

export function NodeSampleSection({ node }: { node: ServiceNode }) {
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  const { sample } = node
  if (!sample) return null

  const runSample = RUNNABLE_SAMPLES[node.id]
  const request = { url: sample.url, requestHeaders: sample.headers ?? {} }

  const onRun = () => {
    if (!runSample) return
    setRun({ status: 'loading' })
    runSample().then(
      (result) => setRun({ status: 'done', body: JSON.stringify(result, null, 2) }),
      (err: unknown) => setRun({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    )
  }

  const showingLive = run.status === 'done'
  const body = run.status === 'done' ? run.body : sample.responseExcerpt

  return (
    <section className="node-sample" aria-label="Sample call">
      <h4>Sample call</h4>
      <code className="node-sample-url">GET {sample.url}</code>
      <div className="node-sample-actions">
        <button type="button" onClick={() => void navigator.clipboard.writeText(toCurlCommand(request))}>
          Copy as curl
        </button>
        <button type="button" onClick={() => void navigator.clipboard.writeText(toFetchSnippet(request))}>
          Copy as fetch
        </button>
        {runSample && (
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
      <pre className="node-sample-body">{body}</pre>
    </section>
  )
}
