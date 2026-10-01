// Calculate the base 2 logarithm of the number `x`. This differs from the
// native function in the sense that it returns the ceiling value and that it
// returns 0 instead of `Infinity`/`NaN` for `x` values smaller than/equal to 0.
// The byte readers work on a plain Uint8Array (the upstream ones need a Node Buffer).

export const log2 = (x) => {
  if (x <= 0) {
    return 0
  }
  return Math.ceil(Math.log2(x))
}

export const readUint16 = (data, offset) => (data[offset] << 8) | data[offset + 1]

export const readUint32 = (data, offset) =>
  ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0
