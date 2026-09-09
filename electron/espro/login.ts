// ESPRO login mechanism (main process). Uses Electron's `net` stack so it goes
// through the system proxy and OS certificate store — important on the managed
// campus/corporate network this runs on.
//
// CONFIRMED against a real response from studentespro.christuniversity.in on
// 2026-07-29 (redacted HTML sample) — not a guess anymore. ESPRO's "CUE"
// frontend is a Keycloak-backed OAuth2 Authorization Code + PKCE flow, not
// the classic ASP.NET WebForms shape this file originally assumed:
//
//   1. GET the Keycloak authorize endpoint (with a self-generated PKCE
//      challenge) -> Keycloak server-renders an actual login page. Its
//      <form id="kc-form-login"> action URL carries session_code/execution/
//      tab_id/client_data query params that must be echoed back verbatim
//      (Keycloak's equivalent of __VIEWSTATE) — see keycloak-html.ts.
//   2. POST username/password to that exact action URL.
//   3. Success: a redirect whose Location header has response_mode=fragment
//      -> "#code=...&state=...". Keycloak builds the fragment server-side
//      into the Location header itself, so — unlike a real browser
//      navigation — it's readable here without executing any JS.
//      Failure: a 200 that re-renders the same login form.
//   4. Exchange the code (+ the original PKCE code_verifier) for an access
//      token at Keycloak's token endpoint. That access token, not a cookie,
//      is what authenticates subsequent ESPRO API calls (Authorization:
//      Bearer ...).
//
// STILL UNCONFIRMED: the actual attendance-data API endpoint and response
// shape — sync.ts's fetchEsproAttendance is still a stub pending that.
import crypto from 'node:crypto'
import { net } from 'electron'
import {
  applySetCookies,
  serializeCookies,
  formEncode,
  headerToArray,
  EsproLoginError,
  type CookieJar,
} from './http-util'
import { generateCodeVerifier, generateCodeChallenge, generateRandomToken } from './pkce'
import { extractLoginFormAction, isKeycloakLoginFormResponse, extractFragmentCode } from './keycloak-html'

export interface DPoPKeyPair {
  privateKey: crypto.KeyObject
  publicKey: crypto.KeyObject
}

export function generateDPoPKeyPair(): DPoPKeyPair {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function generateDPoPProof(
  method: string,
  url: string,
  keyPair: DPoPKeyPair,
  nonce?: string,
): string {
  const htu = url.split('?')[0].split('#')[0]
  const jwkFull = keyPair.publicKey.export({ format: 'jwk' })
  const jwk = { kty: jwkFull.kty, crv: jwkFull.crv, x: jwkFull.x, y: jwkFull.y }

  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk }
  const payload: Record<string, unknown> = {
    jti: crypto.randomBytes(16).toString('hex'),
    htm: method.toUpperCase(),
    htu,
    iat: Math.floor(Date.now() / 1000),
  }
  if (nonce) {
    payload.nonce = nonce
  }

  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  const sig = crypto.sign('SHA256', Buffer.from(dataToSign), {
    key: keyPair.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${dataToSign}.${base64UrlEncode(sig)}`
}

function extractHeaderValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const lcName = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lcName) {
      return Array.isArray(v) ? v[0] : v
    }
  }
  return undefined
}

export interface EsproSession {
  accessToken: string
  refreshToken: string
  tokenType: string
  /** Epoch ms when accessToken expires. */
  expiresAt: number
  /** The SPA's own origin (not the Keycloak auth server) — where attendance API calls are made. */
  baseUrl: string
  dpopKeys?: DPoPKeyPair
}

export const ESPRO_BASE = 'https://espro.christuniversity.in:444'
export const CUE_REDIRECT_URI = 'https://cue.christuniversity.in/'
const KEYCLOAK_BASE = 'https://studentespro.christuniversity.in'
const AUTHORIZE_URL = `${KEYCLOAK_BASE}/auth/realms/Student/protocol/openid-connect/auth`
const TOKEN_URL = `${KEYCLOAK_BASE}/auth/realms/Student/protocol/openid-connect/token`
const CLIENT_ID = 'react-app'

export interface RawResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

/**
 * Exported so sync.ts can make authenticated Bearer-token requests through
 * the same net stack. `step` is a short human description of what this call
 * is for (e.g. "loading the ESPRO login page") — every network-level failure
 * gets wrapped as EsproLoginError regardless of which of the several calls
 * in the login+fetch chain it came from, so without this the error message
 * alone can't tell you which one broke.
 */
export function httpRequest(opts: {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: string
  step: string
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    // redirect: 'manual' so we can read the post-login redirect's fragment
    // ourselves rather than have `net` follow it away. IMPORTANT: under
    // 'manual', a 3xx is delivered via a separate 'redirect' event, NOT
    // 'response' — without handling it explicitly the request just hangs on
    // exactly the response we need (the code-bearing redirect on a
    // successful login).
    const req = net.request({ method: opts.method, url: opts.url, redirect: 'manual' })
    for (const [k, v] of Object.entries(opts.headers ?? {})) req.setHeader(k, v)
    req.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
      req.abort()
      resolve({
        status: statusCode,
        headers: { ...(responseHeaders as Record<string, string | string[] | undefined>), location: redirectUrl },
        body: '',
      })
    })
    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
      res.on('error', (e: Error) => reject(new EsproLoginError('unreachable', `${opts.step}: ${e.message}`)))
    })
    req.on('error', (e) => reject(new EsproLoginError('unreachable', `${opts.step}: ${e.message}`)))
    // Content-Length is deliberately NOT set manually — Electron's net
    // module computes it from what's written, and a hand-set value here is
    // a known source of net::ERR_INVALID_ARGUMENT when it doesn't line up
    // exactly with what the module itself would compute.
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function exchangeCodeForSession(params: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<EsproSession> {
  const body = formEncode({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: CLIENT_ID,
    code_verifier: params.codeVerifier,
  })

  const dpopKeys = generateDPoPKeyPair()

  let dpopProof = generateDPoPProof('POST', TOKEN_URL, dpopKeys)
  let res = await httpRequest({
    method: 'POST',
    url: TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body,
    step: 'exchanging the ESPRO login code for an access token',
  })

  const dpopNonce = extractHeaderValue(res.headers, 'dpop-nonce')
  if (res.status !== 200 && dpopNonce) {
    dpopProof = generateDPoPProof('POST', TOKEN_URL, dpopKeys, dpopNonce)
    res = await httpRequest({
      method: 'POST',
      url: TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        DPoP: dpopProof,
      },
      body,
      step: 'exchanging the ESPRO login code for an access token (with nonce)',
    })
  }

  if (res.status !== 200 && params.redirectUri.endsWith('/')) {
    const fallbackUri = params.redirectUri.slice(0, -1)
    const fallbackBody = formEncode({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: fallbackUri,
      client_id: CLIENT_ID,
      code_verifier: params.codeVerifier,
    })
    let fallbackDpop = generateDPoPProof('POST', TOKEN_URL, dpopKeys)
    let fallbackRes = await httpRequest({
      method: 'POST',
      url: TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        DPoP: fallbackDpop,
      },
      body: fallbackBody,
      step: 'exchanging the ESPRO login code for an access token (fallback)',
    })
    const fallbackNonce = extractHeaderValue(fallbackRes.headers, 'dpop-nonce')
    if (fallbackRes.status !== 200 && fallbackNonce) {
      fallbackDpop = generateDPoPProof('POST', TOKEN_URL, dpopKeys, fallbackNonce)
      fallbackRes = await httpRequest({
        method: 'POST',
        url: TOKEN_URL,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: fallbackDpop,
        },
        body: fallbackBody,
        step: 'exchanging the ESPRO login code for an access token (fallback with nonce)',
      })
    }
    if (fallbackRes.status === 200) {
      res = fallbackRes
    }
  }
  if (res.status !== 200) {
    let errDetail = ''
    try {
      const errObj = JSON.parse(res.body)
      if (errObj.error_description) errDetail = `: ${errObj.error_description}`
      else if (errObj.error) errDetail = `: ${errObj.error}`
    } catch {
      if (res.body) errDetail = `: ${res.body.slice(0, 150)}`
    }
    throw new EsproLoginError('unexpected', `ESPRO token exchange failed (HTTP ${res.status}${errDetail}).`)
  }
  let parsed: { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string }
  try {
    parsed = JSON.parse(res.body)
  } catch {
    throw new EsproLoginError('unexpected', "ESPRO's token response wasn't valid JSON.")
  }
  if (!parsed.access_token) {
    throw new EsproLoginError('unexpected', "ESPRO's token response didn't include an access token.")
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? '',
    tokenType: parsed.token_type ?? 'Bearer',
    expiresAt: Date.now() + (parsed.expires_in ?? 300) * 1000,
    baseUrl: ESPRO_BASE,
    dpopKeys,
  }
}

/**
 * Logs into ESPRO with the given (already-decrypted, in-memory) credentials via
 * Keycloak's Authorization Code + PKCE flow and returns an access-token session.
 * Throws EsproLoginError on failure.
 */
export async function esproLogin(creds: { username: string; password: string }): Promise<EsproSession> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateRandomToken()
  const nonce = generateRandomToken()
  const redirectUri = CUE_REDIRECT_URI

  const authorizeUrl = `${AUTHORIZE_URL}?${formEncode({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    response_mode: 'fragment',
    response_type: 'code',
    scope: 'openid profile email',
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`

  const jar: CookieJar = new Map()

  // 1. GET the authorize URL -> Keycloak's rendered login form. Follow 3xx
  // redirects so we fetch the actual rendered HTML form page, not just the 302 header.
  let authPage = await httpRequest({ method: 'GET', url: authorizeUrl, step: 'loading the ESPRO login page' })
  applySetCookies(jar, headerToArray(authPage.headers['set-cookie']))

  let effectiveUrl = authorizeUrl
  let redirectCount = 0
  while (authPage.status >= 300 && authPage.status < 400 && redirectCount < 5) {
    const loc = headerToArray(authPage.headers['location'])[0]
    if (!loc) break
    effectiveUrl = loc.startsWith('http') ? loc : new URL(loc, effectiveUrl).href
    authPage = await httpRequest({
      method: 'GET',
      url: effectiveUrl,
      headers: { Cookie: serializeCookies(jar) },
      step: 'following ESPRO login redirect',
    })
    applySetCookies(jar, headerToArray(authPage.headers['set-cookie']))
    redirectCount++
  }

  const formAction = extractLoginFormAction(authPage.body)
  if (!formAction) {
    throw new EsproLoginError(
      'unexpected',
      "Couldn't find the ESPRO login form. The portal's login page may have changed.",
    )
  }

  const resolvedFormAction = formAction.startsWith('http')
    ? formAction
    : new URL(formAction, effectiveUrl).href

  // 2. POST credentials to that exact action URL. credentialId stays empty —
  // it's Keycloak's WebAuthn/passkey selector, unused for password login.
  const body = formEncode({ username: creds.username, password: creds.password, credentialId: '' })
  const loginPost = await httpRequest({
    method: 'POST',
    url: resolvedFormAction,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: serializeCookies(jar),
    },
    body,
    step: 'submitting your ESPRO login',
  })
  applySetCookies(jar, headerToArray(loginPost.headers['set-cookie']))

  if (loginPost.status >= 500) {
    throw new EsproLoginError('unreachable', `ESPRO returned ${loginPost.status}.`)
  }

  const redirected = loginPost.status >= 300 && loginPost.status < 400
  const location = headerToArray(loginPost.headers['location'])[0]
  if (redirected && location) {
    const fragment = extractFragmentCode(location)
    if (!fragment) {
      throw new EsproLoginError(
        'unexpected',
        "ESPRO redirected after login but didn't include an authorization code.",
      )
    }
    if (fragment.state !== state) {
      throw new EsproLoginError('unexpected', 'ESPRO login response failed a security check (state mismatch).')
    }
    return exchangeCodeForSession({ code: fragment.code, codeVerifier, redirectUri })
  }
  if (loginPost.status === 200 && isKeycloakLoginFormResponse(loginPost.body)) {
    throw new EsproLoginError('bad-credentials', 'ESPRO rejected the username or password.')
  }
  throw new EsproLoginError(
    'unexpected',
    "Couldn't confirm the ESPRO login. The portal's response wasn't recognized.",
  )
}
