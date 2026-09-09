// Pure parsing for ESPRO's Keycloak login pages/responses — no electron/node
// imports, so it's unit-testable against a captured HTML fixture. Confirmed
// against a real response from studentespro.christuniversity.in on
// 2026-07-29 (Keycloak's default "espro_login_theme", PatternFly form
// classes, id="kc-form-login").

/**
 * Extracts the login form's POST target from the Keycloak-rendered login
 * page. This URL carries session_code/execution/tab_id/client_data query
 * params that must be echoed back verbatim (Keycloak's equivalent of
 * ASP.NET's __VIEWSTATE) — there's nothing to compute, just copy the
 * action="..." attribute HTML-entity-decoded (Keycloak emits &amp; between
 * query params).
 */
export function extractLoginFormAction(html: string): string | null {
  // 1. Check for form with id="kc-form-login" (action attribute before or after id)
  let m = /<form\b[^>]*\bid=["']?kc-form-login["']?[^>]*\baction=["']([^"']+)["']/i.exec(html)
  if (!m) {
    m = /<form\b[^>]*\baction=["']([^"']+)["'][^>]*\bid=["']?kc-form-login["']?/i.exec(html)
  }
  // 2. Fallback: Match any form on the page that has an action attribute
  if (!m) {
    m = /<form\b[^>]*\baction=["']([^"']+)["']/i.exec(html)
  }
  if (!m) return null
  return m[1].replace(/&amp;/g, '&')
}

/** True when the response body is (still) the Keycloak login form — i.e. login was rejected and the same page was re-rendered. */
export function isKeycloakLoginFormResponse(html: string): boolean {
  return /\bid=["']?kc-form-login["']?/i.test(html) || /type=["']password["']/i.test(html)
}

/**
 * Parses `code` and `state` out of a `response_mode=fragment` redirect
 * Location header, e.g. ".../#state=...&session_state=...&code=...". Unlike
 * a browser navigation, the fragment IS visible here because Keycloak builds
 * it server-side into the Location header value itself.
 */
export function extractFragmentCode(locationHeader: string): { code: string; state: string } | null {
  let paramStr = ''
  const hashIdx = locationHeader.indexOf('#')
  if (hashIdx !== -1) {
    paramStr = locationHeader.slice(hashIdx + 1)
  } else {
    const qIdx = locationHeader.indexOf('?')
    if (qIdx !== -1) {
      paramStr = locationHeader.slice(qIdx + 1)
    }
  }
  if (!paramStr) return null
  const params = new URLSearchParams(paramStr)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return null
  return { code, state }
}
