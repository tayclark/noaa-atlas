// Decodes the JPEG 2000 codestream inside a GRIB2 template 5.40 data section (#229). The decoder is
// vendored in ./jpx and loaded lazily by grib2.ts, so wind-only visits never download it.

import { JpxImage } from './jpx/jpx.js'

/** The integer samples of a one-component codestream, row-major, at full precision. */
export function decodeJpeg2000(codestream: Uint8Array): Float32Array {
  const image = new JpxImage()
  image.parse(codestream)
  const raw = image.tiles[0]?.raw
  if (image.tiles.length !== 1 || !raw) throw new Error('Unsupported JPEG 2000 layout')
  return raw
}
