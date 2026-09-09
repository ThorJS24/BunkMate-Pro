import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { appendCrashLog, crashLogPath } from './crash-log'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bunkmate-crash-log-test-'))
}

describe('appendCrashLog', () => {
  let userDataDir: string

  beforeEach(() => {
    userDataDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('creates the log file with a timestamped entry', () => {
    appendCrashLog(userDataDir, 'first failure')
    const content = fs.readFileSync(crashLogPath(userDataDir), 'utf8')
    expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*\] first failure\n$/)
  })

  it('appends rather than overwriting', () => {
    appendCrashLog(userDataDir, 'first')
    appendCrashLog(userDataDir, 'second')
    const content = fs.readFileSync(crashLogPath(userDataDir), 'utf8')
    expect(content).toContain('first')
    expect(content).toContain('second')
  })

  it('trims the file back down once it grows past the size cap', () => {
    // Comfortably over the 512KB cap.
    const bigMessage = 'x'.repeat(600 * 1024)
    appendCrashLog(userDataDir, bigMessage)
    appendCrashLog(userDataDir, 'final marker')

    const { size } = fs.statSync(crashLogPath(userDataDir))
    expect(size).toBeLessThanOrEqual(512 * 1024)
    const content = fs.readFileSync(crashLogPath(userDataDir), 'utf8')
    // The most recent entry survives the trim; the old one doesn't.
    expect(content).toContain('final marker')
  })
})
