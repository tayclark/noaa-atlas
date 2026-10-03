// Decodes a GRIB2 field off the main thread (#291). The GFS-Wave field is JPEG 2000 and takes
// seconds to decode, so gribDecodeClient.ts posts its bytes here, and grib2.ts loads the JPX
// decoder lazily inside this worker. Only the client should construct it; never import it into
// page code, where `self` is the window.

import { decodeGribFieldAsync } from './grib2'
import { toWireError, type DecodeReply, type DecodeRequest } from './gribWire'

/** The reply for one request, plus the buffers to transfer with it. */
export async function handleDecodeMessage({ id, data }: DecodeRequest): Promise<{ reply: DecodeReply; transfer: ArrayBuffer[] }> {
  try {
    const field = await decodeGribFieldAsync(data)
    return { reply: { id, field }, transfer: [field.values.buffer as ArrayBuffer] }
  } catch (err) {
    return { reply: { id, error: toWireError(err) }, transfer: [] }
  }
}

if (typeof self !== 'undefined') {
  self.addEventListener('message', async (event: MessageEvent<DecodeRequest>) => {
    const { reply, transfer } = await handleDecodeMessage(event.data)
    self.postMessage(reply, { transfer })
  })
}
