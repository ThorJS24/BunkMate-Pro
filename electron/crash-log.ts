import fs from 'node:fs'
import path from 'node:path'

// Kept small on purpose: a crash log someone might paste into a support
// message should stay pasteable, not grow across months of use into
// something nobody will read past the first screen.
const MAX_LOG_BYTES = 512 * 1024

export function crashLogPath(userDataDir: string): string {
  return path.join(userDataDir, 'crash.log')
}

/**
 * Appends one timestamped entry, trimming the file back down to its most
 * recent MAX_LOG_BYTES once it grows past that — best-effort: a failure to
 * write the log itself must never be what crashes the app, so callers should
 * treat this as fire-and-forget (wrap in try/catch) rather than propagate.
 */
export function appendCrashLog(userDataDir: string, message: string): void {
  const logPath = crashLogPath(userDataDir)
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  const { size } = fs.statSync(logPath)
  if (size > MAX_LOG_BYTES) {
    const content = fs.readFileSync(logPath, 'utf8')
    fs.writeFileSync(logPath, content.slice(-MAX_LOG_BYTES), 'utf8')
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

/**
 * Wires the main process's process-level crash hooks. `isEnabled` is checked
 * fresh at the moment of each crash (not captured once at startup) so
 * toggling the setting takes effect immediately without a restart, and is a
 * plain synchronous closure rather than a DB read — a crash handler is the
 * wrong place to risk a second failure reading from a database that may
 * itself be why things are crashing.
 *
 * Registering these listeners does change Node's default behavior (it no
 * longer exits automatically), so this deliberately still logs to stderr and
 * exits afterward — same outcome as an unhandled crash, just with a
 * best-effort log line written first when opted in.
 */
export function initCrashLogging(userDataDir: string, isEnabled: () => boolean): void {
  process.on('uncaughtException', (error) => {
    if (isEnabled()) {
      try {
        appendCrashLog(userDataDir, `Uncaught exception (main): ${describeError(error)}`)
      } catch {
        // Logging must never be why the crash handler itself fails.
      }
    }
    console.error(error)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    if (isEnabled()) {
      try {
        appendCrashLog(userDataDir, `Unhandled rejection (main): ${describeError(reason)}`)
      } catch {
        // Logging must never be why the crash handler itself fails.
      }
    }
    console.error(reason)
  })
}
