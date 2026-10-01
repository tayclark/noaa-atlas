// A small GRIB2 reader for one lat/lon field (#229). It handles the grid definition template 3.0
// (regular lat/lon) and two data templates: 5.3 (complex packing with spatial differencing, the GFS
// 1 degree atmospheric fields, `decodeGribField`) and 5.40 (JPEG 2000 with an optional land bitmap,
// the GFS-Wave fields, `decodeGribFieldAsync`, which loads the decoder lazily). Other templates
// throw `Grib2Error` so a caller can fall back rather than draw garbage.

export class Grib2Error extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Grib2Error'
  }
}

export interface GribField {
  ni: number
  nj: number
  /** Latitude of the first row in degrees, and the (positive) row step. Rows run north to south when `southToNorth` is false. */
  lat1: number
  lon1: number
  di: number
  dj: number
  southToNorth: boolean
  /** Row-major values, `ni * nj` long. NaN marks a missing point. */
  values: Float32Array
}

class BitReader {
  private pos = 0
  private readonly bytes: Uint8Array
  private readonly base: number

  constructor(bytes: Uint8Array, base: number) {
    this.bytes = bytes
    this.base = base
  }

  read(bits: number): number {
    let out = 0
    let left = bits
    while (left > 0) {
      const byte = this.bytes[this.base + (this.pos >> 3)]
      if (byte === undefined) throw new Grib2Error('GRIB2 data section ended early')
      const free = 8 - (this.pos & 7)
      const take = Math.min(free, left)
      out = out * 2 ** take + ((byte >> (free - take)) & ((1 << take) - 1))
      this.pos += take
      left -= take
    }
    return out
  }

  /** Skips to the next byte boundary. */
  align(): void {
    this.pos = (this.pos + 7) & ~7
  }

  get bytePos(): number {
    return this.base + (this.pos >> 3)
  }
}

/** GRIB2 signed integers are sign and magnitude, not two's complement. */
function signMagnitude(value: number, bytes: number): number {
  const sign = 2 ** (bytes * 8 - 1)
  return value >= sign ? -(value - sign) : value
}

interface Sections {
  bytes: Uint8Array
  view: DataView
  grid: Omit<GribField, 'values'>
  sec5: number
  sec6: number | null
  sec7: number
  sec7Len: number
}

function readSections(data: ArrayBuffer | Uint8Array): Sections {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u32 = (at: number) => view.getUint32(at)
  const smag = (at: number, n: 2 | 4) => signMagnitude(n === 2 ? view.getUint16(at) : u32(at), n)

  if (bytes.length < 20 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'GRIB') {
    throw new Grib2Error('Not a GRIB message')
  }
  if (bytes[7] !== 2) throw new Grib2Error(`Unsupported GRIB edition ${bytes[7]}`)

  let grid: Omit<GribField, 'values'> | null = null
  let sec5: number | null = null
  let sec6: number | null = null
  let sec7: number | null = null
  let sec7Len = 0

  let at = 16
  while (at + 5 <= bytes.length && !(bytes[at] === 0x37 && bytes[at + 1] === 0x37)) {
    const len = u32(at)
    const num = bytes[at + 4]
    if (len < 5 || at + len > bytes.length) throw new Grib2Error('GRIB2 section runs past the message')
    if (num === 3) {
      const template = view.getUint16(at + 12)
      if (template !== 0) throw new Grib2Error(`Unsupported grid template 3.${template}`)
      const lat1 = smag(at + 46, 4) / 1e6
      const lat2 = smag(at + 55, 4) / 1e6
      grid = {
        ni: u32(at + 30),
        nj: u32(at + 34),
        lat1,
        lon1: smag(at + 50, 4) / 1e6,
        di: u32(at + 63) / 1e6,
        dj: u32(at + 67) / 1e6,
        southToNorth: lat2 > lat1,
      }
      if (bytes[at + 71] & 0x80) throw new Grib2Error('Unsupported scanning direction (west to east only)')
    } else if (num === 5) {
      sec5 = at
    } else if (num === 6) {
      sec6 = at
    } else if (num === 7) {
      sec7 = at
      sec7Len = len
    }
    at += len
  }
  if (!grid || sec5 === null || sec7 === null) throw new Grib2Error('GRIB2 message is missing a required section')
  return { bytes, view, grid, sec5, sec6, sec7, sec7Len }
}

export function decodeGribField(data: ArrayBuffer | Uint8Array): GribField {
  const { bytes, view, grid, sec5, sec7, sec7Len } = readSections(data)
  const u32 = (at: number) => view.getUint32(at)
  const smag = (at: number, n: 2 | 4) => signMagnitude(n === 2 ? view.getUint16(at) : u32(at), n)

  const template = view.getUint16(sec5 + 9)
  if (template !== 3) throw new Grib2Error(`Unsupported data template 5.${template}`)

  const npts = u32(sec5 + 5)
  if (npts !== grid.ni * grid.nj) throw new Grib2Error('GRIB2 point count does not match the grid')
  const ref = view.getFloat32(sec5 + 11)
  const binary = smag(sec5 + 15, 2)
  const decimal = smag(sec5 + 17, 2)
  const refBits = bytes[sec5 + 19]
  const missingMode = bytes[sec5 + 22]
  const groups = u32(sec5 + 31)
  const widthRef = bytes[sec5 + 35]
  const widthBits = bytes[sec5 + 36]
  const lengthRef = u32(sec5 + 37)
  const lengthInc = bytes[sec5 + 41]
  const lastLength = u32(sec5 + 42)
  const lengthBits = bytes[sec5 + 46]
  const order = bytes[sec5 + 47]
  const extra = bytes[sec5 + 48]
  if (order !== 1 && order !== 2) throw new Grib2Error(`Unsupported spatial differencing order ${order}`)
  if (extra < 1 || extra > 4) throw new Grib2Error('Invalid GRIB2 extra descriptor size')

  // Section 7: extra descriptors, then group references, widths and lengths, then the packed values.
  let p = sec7 + 5
  const readInt = (n: number) => {
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + bytes[p + i]
    p += n
    return v
  }
  const first = [signMagnitude(readInt(extra), extra)]
  if (order === 2) first.push(signMagnitude(readInt(extra), extra))
  const minimum = signMagnitude(readInt(extra), extra)

  const reader = new BitReader(bytes, p)
  const refs = Array.from({ length: groups }, () => reader.read(refBits))
  reader.align()
  const widths = Array.from({ length: groups }, () => reader.read(widthBits) + widthRef)
  reader.align()
  const lengths = Array.from({ length: groups }, () => lengthRef + reader.read(lengthBits) * lengthInc)
  reader.align()
  if (groups > 0) lengths[groups - 1] = lastLength

  const packed = new BitReader(bytes, reader.bytePos)
  const ints = new Float64Array(npts)
  const missing = new Uint8Array(npts)
  let n = 0
  for (let g = 0; g < groups; g++) {
    const w = widths[g]
    const allOnes = 2 ** w - 1
    for (let i = 0; i < lengths[g]; i++, n++) {
      if (n >= npts) throw new Grib2Error('GRIB2 group lengths exceed the point count')
      const raw = w === 0 ? 0 : packed.read(w)
      if (missingMode > 0 && w > 0 && raw === allOnes) missing[n] = 1
      else ints[n] = refs[g] + raw
    }
  }
  if (n !== npts) throw new Grib2Error('GRIB2 group lengths do not cover the point count')
  if (sec7 + sec7Len < packed.bytePos) throw new Grib2Error('GRIB2 data section ended early')

  // Undo the spatial differencing: add the minimum back, restore the seed values, integrate.
  for (let i = order; i < npts; i++) if (!missing[i]) ints[i] += minimum
  for (let i = 0; i < order; i++) ints[i] = first[i]
  if (order === 1) {
    for (let i = 1; i < npts; i++) ints[i] += ints[i - 1]
  } else {
    for (let i = 2; i < npts; i++) ints[i] += 2 * ints[i - 1] - ints[i - 2]
  }

  const scale = 2 ** binary
  const divisor = 10 ** decimal
  const values = new Float32Array(npts)
  for (let i = 0; i < npts; i++) values[i] = missing[i] ? NaN : (ref + ints[i] * scale) / divisor
  return { ...grid, values }
}

/** Like `decodeGribField`, and also reads template 5.40 (JPEG 2000), with or without a bitmap. */
export async function decodeGribFieldAsync(data: ArrayBuffer | Uint8Array): Promise<GribField> {
  const sections = readSections(data)
  const { bytes, view, grid, sec5, sec6, sec7, sec7Len } = sections
  const template = view.getUint16(sec5 + 9)
  if (template !== 40) return decodeGribField(bytes)

  const npts = view.getUint32(sec5 + 5)
  const ref = view.getFloat32(sec5 + 11)
  const binary = signMagnitude(view.getUint16(sec5 + 15), 2)
  const decimal = signMagnitude(view.getUint16(sec5 + 17), 2)
  const total = grid.ni * grid.nj

  // Section 6: indicator 0 is a bitmap (one bit per grid point, 1 = present), 255 means no bitmap.
  let present: Uint8Array | null = null
  if (sec6 !== null && bytes[sec6 + 5] !== 255) {
    if (bytes[sec6 + 5] !== 0) throw new Grib2Error('Unsupported GRIB2 bitmap indicator')
    if (sec6 + 6 + Math.ceil(total / 8) > sec6 + view.getUint32(sec6)) throw new Grib2Error('GRIB2 bitmap section ended early')
    present = new Uint8Array(total)
    let count = 0
    for (let i = 0; i < total; i++) {
      if ((bytes[sec6 + 6 + (i >> 3)] >> (7 - (i & 7))) & 1) {
        present[i] = 1
        count++
      }
    }
    if (count !== npts) throw new Grib2Error('GRIB2 bitmap does not match the packed point count')
  } else if (npts !== total) {
    throw new Grib2Error('GRIB2 point count does not match the grid')
  }

  const { decodeJpeg2000 } = await import('./jpeg2000Decode')
  const ints = bitsPerValue(bytes, sec5) === 0 ? new Float32Array(npts) : decodeJpeg2000(bytes.subarray(sec7 + 5, sec7 + sec7Len))
  if (ints.length !== npts) throw new Grib2Error('GRIB2 JPEG 2000 sample count does not match the point count')

  const scale = 2 ** binary
  const divisor = 10 ** decimal
  const values = new Float32Array(total)
  let k = 0
  for (let i = 0; i < total; i++) values[i] = present && !present[i] ? NaN : (ref + ints[k++] * scale) / divisor
  return { ...grid, values }
}

/** Template 5.40 packs a constant field as zero bits per value, with no codestream to decode. */
function bitsPerValue(bytes: Uint8Array, sec5: number): number {
  return bytes[sec5 + 19]
}
