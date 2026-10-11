// The error pair every live client throws (#351): an HttpError for a non-2xx response and a
// ParseError for a body that doesn't match its schema. Each client makes its own pair, so
// `instanceof SwpcHttpError` still tells SWPC's failures apart from NWS's, and every HttpError
// carries the same `kind` classification nwsClient.ts introduced.

export type HttpErrorKind = 'forbidden' | 'rate-limited' | 'server-error' | 'unknown'

export function classifyStatus(status: number): HttpErrorKind {
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server-error'
  return 'unknown'
}

export interface ClientHttpError extends Error {
  readonly status: number
  readonly kind: HttpErrorKind
}

export interface ClientParseError extends Error {
  readonly cause: unknown
}

export interface ClientErrors {
  HttpError: new (status: number, kind?: HttpErrorKind, message?: string) => ClientHttpError
  ParseError: new (message: string, cause: unknown) => ClientParseError
  /** For createLiveClient: the HttpError for a response. */
  httpError: (res: Response) => ClientHttpError
  /** For createLiveClient: the ParseError for a path whose body failed its schema. */
  parseError: (path: string, cause: unknown) => ClientParseError
}

/**
 * Makes a client's error pair. `label` is the service as users read it ("CO-OPS"), `name` the class
 * name prefix ("Coops" gives CoopsHttpError). `httpMessage` overrides the default
 * "<label> request failed (<status>)." message.
 */
export function makeClientErrors(
  label: string,
  name: string,
  httpMessage: (status: number, kind: HttpErrorKind) => string = (status) => `${label} request failed (${status}).`,
): ClientErrors {
  class HttpError extends Error implements ClientHttpError {
    readonly status: number
    readonly kind: HttpErrorKind

    constructor(status: number, kind: HttpErrorKind = classifyStatus(status), message: string = httpMessage(status, kind)) {
      super(message)
      this.name = `${name}HttpError`
      this.status = status
      this.kind = kind
    }
  }

  class ParseError extends Error implements ClientParseError {
    readonly cause: unknown

    constructor(message: string, cause: unknown) {
      super(message)
      this.name = `${name}ParseError`
      this.cause = cause
    }
  }

  return {
    HttpError,
    ParseError,
    httpError: (res) => new HttpError(res.status),
    parseError: (path, cause) => new ParseError(`${label} response for ${path} did not match the expected shape`, cause),
  }
}

export interface ErrorLabels {
  /** For an HTTP error. A function reads the error's status or kind. */
  http: string | ((err: ClientHttpError) => string)
  /** For a body that failed its schema. */
  parse: string
  /** For a fetch that got no response at all (fetch rejects with a TypeError). `fallback` when absent. */
  network?: string
  /** For anything else. */
  fallback: string
}

/** The message a popup or readout shows for a failed request, by which of the client's errors it is. */
export function describeClientError(err: unknown, errors: Pick<ClientErrors, 'HttpError' | 'ParseError'>, labels: ErrorLabels): string {
  if (err instanceof errors.HttpError) return typeof labels.http === 'string' ? labels.http : labels.http(err)
  if (err instanceof errors.ParseError) return labels.parse
  if (labels.network !== undefined && err instanceof TypeError) return labels.network
  return labels.fallback
}
