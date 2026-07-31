// PKCE (RFC 7636) helpers for ESPRO's Keycloak login (OAuth2 Authorization
// Code + PKCE — confirmed against the real portal, see login.ts). Pure/node
// crypto only, no electron import, so it's unit-testable in plain Node.
import { randomBytes, createHash } from 'node:crypto'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 7636 code_verifier: high-entropy random string, base64url of 32 random bytes (43 chars, well within the 43-128 range). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32))
}

/** S256 code_challenge derived from a code_verifier: base64url(sha256(verifier)). */
export function generateCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

/** Random opaque token for OAuth `state`/`nonce` params — doesn't need PKCE's specific encoding, just unguessable. */
export function generateRandomToken(): string {
  return base64url(randomBytes(16))
}
