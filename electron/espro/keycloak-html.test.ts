import { describe, it, expect } from 'vitest'
import { extractLoginFormAction, isKeycloakLoginFormResponse, extractFragmentCode } from './keycloak-html'

// Trimmed fixture reproducing the structurally-relevant parts of a real
// response from studentespro.christuniversity.in:8010's Keycloak login page
// (captured 2026-07-29, "espro_login_theme"). session_code/execution/tab_id/
// client_data below are placeholders in the same shape as the real ones —
// the real values are single-use and already expired.
const LOGIN_PAGE_HTML = `
<html>
<body>
<div id="kc-form">
  <div id="kc-form-wrapper">
    <form id="kc-form-login" class="pf-v5-c-form pf-v5-u-w-100" onsubmit="login.disabled = true; return true;" action="https://studentespro.christuniversity.in:8010/auth/realms/Student/login-actions/authenticate?session_code=abc123&amp;execution=def-456&amp;client_id=react-app&amp;tab_id=ghi789&amp;client_data=eyJydSI6Imh0dHBzOi8vZXNwcm8uY2hyaXN0dW5pdmVyc2l0eS5pbjo0NDQvIn0" method="post" novalidate="novalidate">
      <input id="username" name="username" value="" type="text" autocomplete="username" autofocus aria-invalid=""/>
      <input id="password" name="password" value="" type="password" autocomplete="current-password" aria-invalid=""/>
      <input type="hidden" id="id-hidden-input" name="credentialId" />
      <button class="pf-v5-c-button pf-m-primary pf-m-block" name="login" id="kc-login" type="submit">Sign In</button>
    </form>
  </div>
</div>
</body>
</html>
`

describe('extractLoginFormAction', () => {
  it('extracts and HTML-unescapes the form action URL', () => {
    const action = extractLoginFormAction(LOGIN_PAGE_HTML)
    expect(action).toBe(
      'https://studentespro.christuniversity.in:8010/auth/realms/Student/login-actions/authenticate?session_code=abc123&execution=def-456&client_id=react-app&tab_id=ghi789&client_data=eyJydSI6Imh0dHBzOi8vZXNwcm8uY2hyaXN0dW5pdmVyc2l0eS5pbjo0NDQvIn0',
    )
  })

  it('returns null when the login form is missing', () => {
    expect(extractLoginFormAction('<html><body>nope</body></html>')).toBeNull()
  })
})

describe('isKeycloakLoginFormResponse', () => {
  it('is true for a page that still has the login form (bad credentials re-render)', () => {
    expect(isKeycloakLoginFormResponse(LOGIN_PAGE_HTML)).toBe(true)
  })

  it('is false for a page without it', () => {
    expect(isKeycloakLoginFormResponse('<html><body>Welcome</body></html>')).toBe(false)
  })
})

describe('extractFragmentCode', () => {
  it('parses code and state out of a fragment redirect Location', () => {
    const location = 'https://espro.christuniversity.in:444/#state=xyz&session_state=sess-1&code=auth-code-123'
    expect(extractFragmentCode(location)).toEqual({ code: 'auth-code-123', state: 'xyz' })
  })

  it('returns null when there is no fragment', () => {
    expect(extractFragmentCode('https://espro.christuniversity.in:444/')).toBeNull()
  })

  it('returns null when the fragment is missing a code or state', () => {
    expect(extractFragmentCode('https://espro.christuniversity.in:444/#session_state=sess-1')).toBeNull()
  })
})
