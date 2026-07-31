import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settings-store'
import { THEME_PACKS } from '@/db/schema'
import { isValidHexColor, pickForegroundForHex } from '@/lib/accent-color'

const THEME_PACK_CLASSES = THEME_PACKS.map((pack) => `theme-${pack}`)

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const density = useSettingsStore((s) => s.density)
  const themePack = useSettingsStore((s) => s.themePack)
  const accentColor = useSettingsStore((s) => s.accentColor)

  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean) => root.classList.toggle('dark', dark)

    if (theme === 'dark') {
      apply(true)
      return
    }
    if (theme === 'light') {
      apply(false)
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    apply(media.matches)
    const listener = (e: MediaQueryListEvent) => apply(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('compact', density === 'compact')
  }, [density])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove(...THEME_PACK_CLASSES)
    root.classList.add(`theme-${themePack}`)
  }, [themePack])

  // A custom accent color overrides the active pack's primary/accent/ring via
  // inline style (higher specificity than any class), so switching packs
  // while a custom color is set doesn't require duplicating the override
  // into every pack. Foreground is picked for contrast since we can't
  // hand-tune it the way each pack's own primary-foreground is tuned.
  useEffect(() => {
    const root = document.documentElement
    if (!accentColor || !isValidHexColor(accentColor)) {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-foreground')
      root.style.removeProperty('--accent-foreground')
      root.style.removeProperty('--ring')
      return
    }
    const foreground = pickForegroundForHex(accentColor)
    root.style.setProperty('--primary', accentColor)
    root.style.setProperty('--primary-foreground', foreground)
    root.style.setProperty('--accent-foreground', accentColor)
    root.style.setProperty('--ring', accentColor)
  }, [accentColor])
}
