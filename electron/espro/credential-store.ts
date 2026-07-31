// Encrypted storage for the ESPRO login, main process only. The password is
// encrypted with Electron's safeStorage (OS-backed: Windows DPAPI, macOS
// Keychain, libsecret on Linux) and written to a file in userData — never to
// the SQLite DB, so it can't ride along in DB backups or CSV exports. The
// username is a login identifier, not a secret, and is kept in a plaintext
// sidecar so status ("stored for <username>") never has to decrypt anything.
//
// SECURITY: the plaintext password is only ever held in a local variable long
// enough to encrypt (here) or decrypt (loadEsproCredential, called only at
// sync time). It is never logged, returned to the renderer, or written out in
// readable form.
import { safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { EsproStatus, EsproSaveResult } from './types'

const CRED_FILE = 'espro-credential.enc'
const META_FILE = 'espro-credential.meta.json'

function credPath(userDataDir: string): string {
  return path.join(userDataDir, CRED_FILE)
}
function metaPath(userDataDir: string): string {
  return path.join(userDataDir, META_FILE)
}

function readUsername(userDataDir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(userDataDir), 'utf8')) as { username?: unknown }
    return typeof meta.username === 'string' ? meta.username : null
  } catch {
    return null
  }
}

// The ESPRO "session"/term number (e.g. "13") that scopes the attendance-
// totals endpoints. Not discoverable automatically (no confirmed endpoint
// lists it), so the user finds it once via their browser's Network tab and
// enters it in Settings. Not a secret — kept in the same plaintext sidecar
// as the username, never the encrypted credential file.
export function readEsproSessionId(userDataDir: string): string | null {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(userDataDir), 'utf8')) as { sessionId?: unknown }
    return typeof meta.sessionId === 'string' && meta.sessionId ? meta.sessionId : null
  } catch {
    return null
  }
}

export function saveEsproSessionId(userDataDir: string, sessionId: string): void {
  const trimmed = sessionId.trim()
  const username = readUsername(userDataDir)
  fs.writeFileSync(
    metaPath(userDataDir),
    JSON.stringify({ username, sessionId: trimmed || undefined }),
    { mode: 0o600 },
  )
}

export function getEsproStatus(userDataDir: string): EsproStatus {
  const hasCredential = fs.existsSync(credPath(userDataDir))
  return {
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    hasCredential,
    username: hasCredential ? readUsername(userDataDir) : null,
    sessionId: readEsproSessionId(userDataDir),
  }
}

export function saveEsproCredential(
  userDataDir: string,
  input: { username: string; password: string },
): EsproSaveResult {
  const username = input.username?.trim() ?? ''
  if (!username || !input.password) {
    return { ok: false, reason: 'invalid-input', message: 'Username and password are both required.' }
  }
  // Refuse rather than store something we can't actually encrypt.
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      reason: 'encryption-unavailable',
      message: "This device doesn't have a credential-encryption backend available, so the password can't be stored securely.",
    }
  }
  try {
    const encrypted = safeStorage.encryptString(input.password)
    fs.writeFileSync(credPath(userDataDir), encrypted, { mode: 0o600 })
    // Preserve any already-stored sessionId — this write must not silently wipe it.
    const existingSessionId = readEsproSessionId(userDataDir)
    fs.writeFileSync(
      metaPath(userDataDir),
      JSON.stringify({ username, sessionId: existingSessionId ?? undefined }),
      { mode: 0o600 },
    )
    return { ok: true }
  } catch (err) {
    // Don't leave a half-written pair behind.
    removeEsproCredential(userDataDir)
    return {
      ok: false,
      reason: 'io-error',
      message: err instanceof Error ? err.message : 'Failed to write the encrypted credential.',
    }
  }
}

export function removeEsproCredential(userDataDir: string): void {
  for (const p of [credPath(userDataDir), metaPath(userDataDir)]) {
    try {
      if (fs.existsSync(p)) fs.rmSync(p)
    } catch {
      // best-effort delete; getEsproStatus reflects whatever remains
    }
  }
}

/**
 * Decrypts the stored credential into memory. Call ONLY at the moment a sync
 * runs — never to render status. Returns null if nothing is stored or if
 * encryption is unavailable (a stored file we can't decrypt is unusable).
 */
export function loadEsproCredential(userDataDir: string): { username: string; password: string } | null {
  if (!fs.existsSync(credPath(userDataDir))) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  const password = safeStorage.decryptString(fs.readFileSync(credPath(userDataDir)))
  return { username: readUsername(userDataDir) ?? '', password }
}
