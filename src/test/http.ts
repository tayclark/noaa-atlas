// Response builders shared by the client tests.

/** A JSON response with the given body and status. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}
