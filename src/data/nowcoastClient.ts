// The nowCOAST WMS GetCapabilities documents behind the globe's radar (#74) and GOES (#338) time
// sliders. MapLibre fetches the tiles itself; these XML reads are the calls the Inspector shows
// (#354). They are re-read as frames arrive, so nothing is cached.

import { makeClientErrors, type ClientHttpError } from './clientErrors'
import { createLiveClient, type RequestOptions } from './liveRequest'

export const nowcoastErrors = makeClientErrors('nowCOAST', 'Nowcoast')
export const NowcoastHttpError = nowcoastErrors.HttpError
export type NowcoastHttpError = ClientHttpError

const NOWCOAST_ORIGIN = 'https://nowcoast.noaa.gov'

const { requestRaw } = createLiveClient({
  baseUrl: NOWCOAST_ORIGIN,
  headers: {},
  httpError: nowcoastErrors.httpError,
  parseError: nowcoastErrors.parseError,
})

/** A GetCapabilities document as text, given its full nowCOAST URL. */
export function getNowcoastCapabilities(url: string, { signal }: RequestOptions = {}): Promise<string> {
  if (!url.startsWith(`${NOWCOAST_ORIGIN}/`)) return Promise.reject(new Error(`Not a nowCOAST URL: ${url}`))
  return requestRaw(url.slice(NOWCOAST_ORIGIN.length), { as: 'text', signal, logBody: (xml) => ({ bytes: xml.length }) })
}
