// Shared types for the ESPRO attendance-sync feature, imported by both the IPC
// contract (renderer-facing) and the main-process espro modules. Kept free of
// any electron/node imports so it's safe to pull into either side.

export interface EsproStatus {
  /**
   * safeStorage.isEncryptionAvailable(). False means the OS can't give us a
   * credential-encryption backend right now — we refuse to store rather than
   * pretend, and the UI disables ESPRO sync with an explanation.
   */
  encryptionAvailable: boolean
  /** True when an encrypted credential is stored on this device. */
  hasCredential: boolean
  /**
   * The login identifier for the stored credential, or null. Read from a
   * plaintext meta sidecar so showing "stored for <username>" never requires
   * decrypting the password (which happens only at sync time).
   */
  username: string | null
  /**
   * The ESPRO session/term number scoping the attendance-totals comparison,
   * or null if not set yet. Not a secret — see credential-store.ts.
   */
  sessionId: string | null
}

export type EsproSaveResult =
  | { ok: true }
  | {
      ok: false
      reason: 'encryption-unavailable' | 'invalid-input' | 'io-error'
      message: string
    }
