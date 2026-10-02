import { describe, expect, it } from 'vitest'
import { describeMapInitError, describeStyleError } from './globeFailure'

function namedError(name: string) {
  const error = new Error('boom')
  error.name = name
  return error
}

describe('describeMapInitError', () => {
  it('names WebGL2 for MapLibre GPU initialisation errors', () => {
    expect(describeMapInitError(namedError('GPUInitializationError'))).toMatch(/needs WebGL2/)
  })

  it('falls back to a generic message for anything else', () => {
    expect(describeMapInitError(new Error('other'))).toMatch(/couldn't start/)
    expect(describeMapInitError('a string')).toMatch(/couldn't start/)
  })

  it('says the rest of the app still works', () => {
    expect(describeMapInitError(null)).toMatch(/graph, finder, Compare and Inspector still work/)
  })
})

describe('describeStyleError', () => {
  it('includes the HTTP status when the error carries one', () => {
    expect(describeStyleError(Object.assign(new Error('x'), { status: 503 }))).toMatch(/basemap couldn't load \(HTTP 503\)/)
  })

  it('leaves the status out when there is none or it is zero (a network failure)', () => {
    expect(describeStyleError(new Error('x'))).toMatch(/basemap couldn't load, so/)
    expect(describeStyleError({ status: 0 })).toMatch(/basemap couldn't load, so/)
    expect(describeStyleError(undefined)).toMatch(/basemap couldn't load, so/)
  })
})
