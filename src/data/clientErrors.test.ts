import { describe, expect, it } from 'vitest'
import { classifyStatus, describeClientError, makeClientErrors } from './clientErrors'

const errors = makeClientErrors('CO-OPS', 'Coops')
const other = makeClientErrors('SWPC', 'Swpc')

describe('makeClientErrors', () => {
  it('names the classes after the client and keeps the default messages', () => {
    const http = new errors.HttpError(503)
    expect([http.name, http.message, http.status, http.kind]).toEqual(['CoopsHttpError', 'CO-OPS request failed (503).', 503, 'server-error'])
    const parse = errors.parseError('/x', 'why')
    expect([parse.name, parse.message, parse.cause]).toEqual(['CoopsParseError', 'CO-OPS response for /x did not match the expected shape', 'why'])
  })

  it('builds the http error from a response and keeps each client apart for instanceof', () => {
    const err = errors.httpError(new Response(null, { status: 429 }))
    expect(err).toBeInstanceOf(errors.HttpError)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(other.HttpError)
    expect(err.kind).toBe('rate-limited')
  })

  it('takes a message override and an explicit kind', () => {
    const custom = makeClientErrors('NWS', 'Nws', (status, kind) => `${kind} ${status}`)
    expect(new custom.HttpError(500).message).toBe('server-error 500')
    expect(new custom.HttpError(404, 'unknown', 'gone').message).toBe('gone')
  })
})

describe('classifyStatus', () => {
  it('sorts statuses into kinds', () => {
    expect([403, 429, 500, 503, 404, 400].map(classifyStatus)).toEqual(['forbidden', 'rate-limited', 'server-error', 'server-error', 'unknown', 'unknown'])
  })
})

describe('describeClientError', () => {
  const labels = { http: (e: { status: number }) => `down (${e.status})`, parse: 'odd', network: 'offline', fallback: 'broken' }

  it('picks the label for the error kind', () => {
    expect(describeClientError(new errors.HttpError(502), errors, labels)).toBe('down (502)')
    expect(describeClientError(new errors.ParseError('x', null), errors, labels)).toBe('odd')
    expect(describeClientError(new TypeError('Failed to fetch'), errors, labels)).toBe('offline')
    expect(describeClientError(new Error('?'), errors, labels)).toBe('broken')
  })

  it('takes a plain http label, falls back for a network error without a label, and ignores another client', () => {
    const plain = { http: 'down', parse: 'odd', fallback: 'broken' }
    expect(describeClientError(new errors.HttpError(500), errors, plain)).toBe('down')
    expect(describeClientError(new TypeError('Failed to fetch'), errors, plain)).toBe('broken')
    expect(describeClientError(new other.HttpError(500), errors, plain)).toBe('broken')
  })
})
