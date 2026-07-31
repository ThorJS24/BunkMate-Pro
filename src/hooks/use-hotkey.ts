import { useEffect } from 'react'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

/** Fires `handler` when `key` is pressed with no modifiers, outside inputs/dialogs. */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key.toLowerCase() === key) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, handler, enabled])
}
