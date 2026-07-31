// Pure helpers for the user-picked custom accent color (Settings →
// Appearance). Kept separate from use-theme.ts so the WCAG luminance math is
// unit-testable without a DOM.

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

/** WCAG relative luminance (0=black, 1=white) of a "#rrggbb" color. */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * Picks a readable near-black or near-white foreground for a background hex
 * — used for `--primary-foreground` when the user's custom accent replaces
 * `--primary`, since we can't hand-tune contrast per pick the way the
 * built-in theme packs are hand-tuned.
 */
export function pickForegroundForHex(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#1a1a1a' : '#fafafa'
}
