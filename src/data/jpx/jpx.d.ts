export class JpxImage {
  width: number
  height: number
  componentsCount: number
  tiles: { width: number; height: number; items: Uint8ClampedArray; raw?: Float32Array }[]
  parse(data: Uint8Array): void
}
