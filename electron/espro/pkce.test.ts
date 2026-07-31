import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, generateCodeChallenge, generateRandomToken } from './pkce'

const BASE64URL_RE = /^[A-Za-z0-9\-_]+$/

describe('generateCodeVerifier', () => {
  it('produces a 43-char base64url string (32 random bytes, no padding)', () => {
    const v = generateCodeVerifier()
    expect(v).toHaveLength(43)
    expect(v).toMatch(BASE64URL_RE)
  })

  it('is different each call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier())
  })
})

describe('generateCodeChallenge', () => {
  // RFC 7636 Appendix B's official worked example — verifies the exact
  // base64url(sha256(verifier)) computation against a known-correct pair.
  it('matches the RFC 7636 Appendix B test vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(generateCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('is deterministic for the same verifier', () => {
    const v = generateCodeVerifier()
    expect(generateCodeChallenge(v)).toBe(generateCodeChallenge(v))
  })

  it('only ever produces base64url characters', () => {
    expect(generateCodeChallenge(generateCodeVerifier())).toMatch(BASE64URL_RE)
  })
})

describe('generateRandomToken', () => {
  it('is different each call and base64url-safe', () => {
    const a = generateRandomToken()
    const b = generateRandomToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(BASE64URL_RE)
  })
})
