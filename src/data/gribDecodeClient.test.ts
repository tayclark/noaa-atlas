import { afterEach, describe, expect, it, vi } from 'vitest'
import waveB64 from './fixtures/gfswave-htsgw-f024.grib2.b64?raw'
import { Grib2Error, type GribField } from './grib2'
import { handleDecodeMessage } from './gribDecode.worker'
import { decodeWaveField, resetGribWorkerFactory, setGribWorkerFactoryForTests } from './gribDecodeClient'
import { fromWireError, toWireError, type DecodeReply, type DecodeRequest } from './gribWire'

const waveBuffer = () => Uint8Array.from(atob(waveB64.trim()), (c) => c.charCodeAt(0)).buffer
const field = (ni: number): GribField => ({ ni, nj: 1, lat1: 0, lon1: 0, di: 1, dj: 1, southToNorth: false, values: new Float32Array(ni) })

/** A stand-in Worker: records requests and lets the test reply or fail it. */
class FakeWorker {
  readonly requests: DecodeRequest[] = []
  readonly listeners = new Map<string, ((event: unknown) => void)[]>()
  terminated = false

  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }

  postMessage(request: DecodeRequest) {
    this.requests.push(request)
  }

  terminate() {
    this.terminated = true
  }

  emit(type: string, data?: DecodeReply) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data })
  }
}

function useFakeWorker() {
  const fake = new FakeWorker()
  const factory = vi.fn(() => fake as unknown as Worker)
  setGribWorkerFactoryForTests(factory)
  return { fake, factory }
}

afterEach(() => resetGribWorkerFactory())

describe('decodeWaveField', () => {
  it('decodes in-thread when there is no Worker', async () => {
    const decoded = await decodeWaveField(waveBuffer())
    expect([decoded.ni, decoded.nj]).toEqual([1440, 721])
  })

  it('decodes in-thread when there is no worker factory', async () => {
    setGribWorkerFactoryForTests(null)
    expect((await decodeWaveField(waveBuffer())).ni).toBe(1440)
  })

  it('posts to one worker and matches concurrent replies by id', async () => {
    const { fake, factory } = useFakeWorker()
    const first = decodeWaveField(new ArrayBuffer(1))
    const second = decodeWaveField(new ArrayBuffer(2))
    expect(factory).toHaveBeenCalledTimes(1)
    const [a, b] = fake.requests
    expect(a.data.byteLength).toBe(1)
    fake.emit('message', { id: b.id, field: field(2) })
    fake.emit('message', { id: a.id, field: field(1) })
    expect((await first).ni).toBe(1)
    expect((await second).ni).toBe(2)
  })

  it('ignores a reply it is not waiting for', async () => {
    const { fake } = useFakeWorker()
    const pending = decodeWaveField(new ArrayBuffer(1))
    fake.emit('message', { id: 999, field: field(9) })
    fake.emit('message', { id: fake.requests[0].id, field: field(1) })
    expect((await pending).ni).toBe(1)
  })

  it('rebuilds a Grib2Error the worker sent', async () => {
    const { fake } = useFakeWorker()
    const pending = decodeWaveField(new ArrayBuffer(1))
    fake.emit('message', { id: fake.requests[0].id, error: { name: 'Grib2Error', message: 'Not a GRIB message' } })
    const err = await pending.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Grib2Error)
    expect((err as Error).message).toBe('Not a GRIB message')
  })

  it('falls back in-thread for pending and later requests when the worker fails to start', async () => {
    const { fake, factory } = useFakeWorker()
    const pending = decodeWaveField(waveBuffer())
    fake.emit('error')
    expect(fake.terminated).toBe(true)
    expect((await pending).ni).toBe(1440)
    expect((await decodeWaveField(waveBuffer())).ni).toBe(1440)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('falls back in-thread when a reply cannot be deserialised', async () => {
    const { fake } = useFakeWorker()
    const pending = decodeWaveField(waveBuffer())
    fake.emit('messageerror')
    expect((await pending).ni).toBe(1440)
  })

  it('falls back in-thread when the worker constructor throws', async () => {
    setGribWorkerFactoryForTests(() => {
      throw new Error('SecurityError')
    })
    expect((await decodeWaveField(waveBuffer())).ni).toBe(1440)
  })

  it('rejects in-thread with the decoder error', async () => {
    await expect(decodeWaveField(new ArrayBuffer(8))).rejects.toBeInstanceOf(Grib2Error)
  })
})

describe('wire errors', () => {
  it('keeps the name and message of an Error', () => {
    expect(toWireError(new Grib2Error('bad'))).toEqual({ name: 'Grib2Error', message: 'bad' })
    expect(toWireError(new TypeError('oops'))).toEqual({ name: 'TypeError', message: 'oops' })
  })

  it('wraps a non-Error throw', () => {
    expect(toWireError('boom')).toEqual({ name: 'Error', message: 'boom' })
  })

  it('rebuilds other errors as a plain Error carrying the name', () => {
    const err = fromWireError({ name: 'TypeError', message: 'oops' })
    expect(err).not.toBeInstanceOf(Grib2Error)
    expect([err.name, err.message]).toEqual(['TypeError', 'oops'])
  })
})

describe('handleDecodeMessage', () => {
  it('replies with the field and transfers its values', async () => {
    const { reply, transfer } = await handleDecodeMessage({ id: 3, data: waveBuffer() })
    if (!('field' in reply)) throw new Error('expected a field')
    expect(reply.id).toBe(3)
    expect([reply.field.ni, reply.field.nj]).toEqual([1440, 721])
    expect(transfer).toEqual([reply.field.values.buffer])
  })

  it('replies with a wire error for a truncated message', async () => {
    const bytes = new Uint8Array(waveBuffer())
    const { reply, transfer } = await handleDecodeMessage({ id: 4, data: bytes.slice(0, bytes.length - 200).buffer })
    expect(reply).toEqual({ id: 4, error: { name: 'Grib2Error', message: expect.any(String) } })
    expect(transfer).toEqual([])
  })
})
