// Decodes the GFS-Wave field in a module worker (gribDecode.worker.ts) so the seconds-long JPEG 2000
// decode doesn't freeze the page (#291). Where a worker can't run (no `Worker`, as in Vitest's node
// environment, a constructor that throws, or a worker that fails to start), it decodes on the main
// thread instead, for the rest of the session. The bytes are copied to the worker rather than
// transferred, so a request that was in flight when the worker failed can still decode here.

import { decodeGribFieldAsync, type GribField } from './grib2'
import { fromWireError, type DecodeReply, type DecodeRequest } from './gribWire'

type WorkerFactory = () => Worker

interface Pending {
  data: ArrayBuffer
  resolve: (field: GribField) => void
  reject: (err: Error) => void
}

const defaultFactory: WorkerFactory = () => new Worker(new URL('./gribDecode.worker.ts', import.meta.url), { type: 'module' })

let factory: WorkerFactory | null = defaultFactory
let worker: Worker | null = null
let broken = false
let nextId = 0
const pending = new Map<number, Pending>()

function inThread(job: Pending): void {
  decodeGribFieldAsync(job.data).then(job.resolve, job.reject)
}

/** Gives up on the worker for the session and decodes whatever it still owed here. */
function abandonWorker(): void {
  broken = true
  worker?.terminate()
  worker = null
  const owed = [...pending.values()]
  pending.clear()
  owed.forEach(inThread)
}

function onReply(event: MessageEvent<DecodeReply>): void {
  const reply = event.data
  const job = pending.get(reply.id)
  if (!job) return
  pending.delete(reply.id)
  if ('error' in reply) job.reject(fromWireError(reply.error))
  else job.resolve(reply.field)
}

function getWorker(): Worker | null {
  if (worker || broken) return worker
  if (!factory) {
    broken = true
    return null
  }
  // Without `Worker` (Vitest's node environment) the default factory throws a ReferenceError.
  try {
    worker = factory()
  } catch {
    broken = true
    return null
  }
  worker.addEventListener('message', onReply)
  worker.addEventListener('error', abandonWorker)
  worker.addEventListener('messageerror', abandonWorker)
  return worker
}

/** Decodes a GRIB2 field (any template `decodeGribFieldAsync` reads), off the main thread when it can. */
export function decodeWaveField(data: ArrayBuffer): Promise<GribField> {
  return new Promise((resolve, reject) => {
    const job = { data, resolve, reject }
    const w = getWorker()
    if (!w) return inThread(job)
    const id = nextId++
    pending.set(id, job)
    w.postMessage({ id, data } satisfies DecodeRequest)
  })
}

/** Swaps the worker factory (`null` means no worker) and forgets the current worker. For tests. */
export function setGribWorkerFactoryForTests(next: WorkerFactory | null): void {
  worker?.terminate()
  worker = null
  broken = false
  pending.clear()
  factory = next
}

/** Restores the real worker factory. For tests. */
export function resetGribWorkerFactory(): void {
  setGribWorkerFactoryForTests(defaultFactory)
}
