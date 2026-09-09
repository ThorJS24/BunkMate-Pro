import { describe, it, expect } from 'vitest'
import { friendlyError } from './friendly-error'

describe('friendlyError', () => {
  it('maps a filesystem error to a plain sentence and keeps the raw detail', () => {
    const result = friendlyError(new Error('ENOENT: no such file or directory, open \'x.db\''))
    expect(result.message).toBe("That file couldn't be found. It may have been moved, renamed, or deleted.")
    expect(result.detail).toContain('ENOENT')
  })

  it('maps a network error', () => {
    expect(friendlyError(new Error('fetch failed')).message).toMatch(/connect/i)
  })

  it('maps an ESPRO auth failure', () => {
    expect(friendlyError(new Error('Login failed: invalid credential')).message).toMatch(/ESPRO login/)
  })

  it('falls back to the provided fallback for an unrecognized error, still keeping detail', () => {
    const result = friendlyError(new Error('some obscure internal error'), 'Could not save semester')
    expect(result.message).toBe('Could not save semester')
    expect(result.detail).toBe('some obscure internal error')
  })

  it('falls back to the default message with no detail for a non-Error, non-string value', () => {
    expect(friendlyError(null)).toEqual({ message: 'Something went wrong. Please try again.' })
    expect(friendlyError(undefined)).toEqual({ message: 'Something went wrong. Please try again.' })
  })

  it('accepts a plain string error', () => {
    const result = friendlyError('ENOSPC: no space left on device')
    expect(result.message).toMatch(/disk is full/)
  })
})
