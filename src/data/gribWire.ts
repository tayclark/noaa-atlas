// The messages between gribDecodeClient.ts and gribDecode.worker.ts (#291). Errors cross as a
// plain `{ name, message }`, because a class instance loses its prototype in `postMessage`.

import { Grib2Error, type GribField } from './grib2'

export interface WireError {
  name: string
  message: string
}

export interface DecodeRequest {
  id: number
  data: ArrayBuffer
}

export type DecodeReply = { id: number; field: GribField } | { id: number; error: WireError }

export function toWireError(err: unknown): WireError {
  return err instanceof Error ? { name: err.name, message: err.message } : { name: 'Error', message: String(err) }
}

/** Rebuilds the error a worker sent, as a `Grib2Error` when it was one. */
export function fromWireError({ name, message }: WireError): Error {
  if (name === 'Grib2Error') return new Grib2Error(message)
  const err = new Error(message)
  err.name = name
  return err
}
