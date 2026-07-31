// Pure HTTP helpers for the ESPRO login flow. Deliberately free of electron/net
// imports so they can be unit-tested in plain Node. The cookie handling is a
// minimal jar — enough to carry a session across the login POST/redirect, not
// a spec-complete (RFC 6265) implementation.

export type CookieJar = Map<string, string>

/** Kinds of login failure surfaced to the user (see EsproLoginError). */
export type EsproLoginFailure =
  | 'unreachable' // couldn't connect: DNS, TLS, timeout, 5xx
  | 'bad-credentials' // portal indicated the login was wrong (heuristic — see login.ts)
  | 'unexpected' // got a response we couldn't interpret

export class EsproLoginError extends Error {
  readonly failure: EsproLoginFailure
  constructor(failure: EsproLoginFailure, message: string) {
    super(message)
    this.failure = failure
    this.name = 'EsproLoginError'
  }
}

/** Normalizes a header value that may be a string, string[], or undefined. */
export function headerToArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** Merges Set-Cookie header values into a jar (keeps name=value; drops attrs). */
export function applySetCookies(jar: CookieJar, setCookieHeaders: string[]): CookieJar {
  for (const header of setCookieHeaders) {
    const first = header.split(';', 1)[0] ?? ''
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) jar.set(name, value)
  }
  return jar
}

/** Serializes a jar into a Cookie request-header value. */
export function serializeCookies(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

/** Encodes fields as application/x-www-form-urlencoded. */
export function formEncode(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}
