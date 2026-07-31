import { describe, it, expect } from 'vitest'
import {
  applySetCookies,
  serializeCookies,
  formEncode,
  headerToArray,
  EsproLoginError,
  type CookieJar,
} from './http-util'

describe('cookie jar', () => {
  it('keeps name=value from Set-Cookie and drops attributes', () => {
    const jar: CookieJar = new Map()
    applySetCookies(jar, ['ASP.NET_SessionId=abc123; path=/; HttpOnly', 'foo=bar; Secure'])
    expect(jar.get('ASP.NET_SessionId')).toBe('abc123')
    expect(jar.get('foo')).toBe('bar')
  })

  it('lets a later Set-Cookie override an earlier value for the same name', () => {
    const jar: CookieJar = new Map()
    applySetCookies(jar, ['s=1; path=/'])
    applySetCookies(jar, ['s=2; path=/'])
    expect(jar.get('s')).toBe('2')
  })

  it('ignores malformed cookie headers', () => {
    const jar: CookieJar = new Map()
    applySetCookies(jar, ['', '=novalue', 'noequalsign'])
    expect(jar.size).toBe(0)
  })

  it('serializes a jar into a Cookie header', () => {
    const jar: CookieJar = new Map([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(serializeCookies(jar)).toBe('a=1; b=2')
  })
})

describe('headerToArray', () => {
  it('normalizes string, array, and undefined', () => {
    expect(headerToArray(undefined)).toEqual([])
    expect(headerToArray('x')).toEqual(['x'])
    expect(headerToArray(['x', 'y'])).toEqual(['x', 'y'])
  })
})

describe('formEncode', () => {
  it('url-encodes keys and values', () => {
    expect(formEncode({ user: 'a b', pass: 'p&d=x' })).toBe('user=a%20b&pass=p%26d%3Dx')
  })
})

describe('EsproLoginError', () => {
  it('carries a typed failure kind', () => {
    const err = new EsproLoginError('bad-credentials', 'nope')
    expect(err.failure).toBe('bad-credentials')
    expect(err).toBeInstanceOf(Error)
  })
})
