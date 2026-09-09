// Maps a raw error (often a driver/OS-level message like "ENOENT" or a raw
// SQLite exception) to one plain sentence a non-technical user can act on.
// The raw string is kept as `detail` rather than discarded, so anyone who
// wants to report a bug still has the real message available.

export interface FriendlyError {
  message: string
  detail?: string
}

const PATTERNS: { test: RegExp; message: string }[] = [
  { test: /ENOENT|no such file/i, message: "That file couldn't be found. It may have been moved, renamed, or deleted." },
  { test: /EACCES|EPERM|permission denied/i, message: "BunkMate doesn't have permission to do that. Try choosing a different folder, or running as administrator." },
  { test: /ENOSPC|no space left/i, message: 'Your disk is full. Free up some space and try again.' },
  { test: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|fetch failed/i, message: "Couldn't connect. Check your internet connection and try again." },
  { test: /safeStorage|encrypt/i, message: 'This device cannot securely store that. See the ESPRO section in Settings for details.' },
  { test: /SQLITE|database is locked/i, message: 'There was a problem saving to your data file. Try restarting BunkMate.' },
  { test: /unauthorized|401|invalid credential|login failed/i, message: 'Your ESPRO login could not be verified. Double-check your username and password in Settings.' },
]

/**
 * `fallback` should already be written in plain language for the specific
 * action that failed (e.g. "Could not save semester") — this only handles
 * the generic, cross-cutting cases above it.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): FriendlyError {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) return { message: fallback }
  const matched = PATTERNS.find((p) => p.test.test(raw))
  return { message: matched ? matched.message : fallback, detail: raw }
}
