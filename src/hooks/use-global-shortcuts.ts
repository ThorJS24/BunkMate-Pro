import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const NAV_SHORTCUTS: Record<string, string> = {
  d: '/',
  s: '/subjects',
  a: '/attendance',
  t: '/timetable',
  c: '/calendar',
  p: '/planner',
  y: '/analytics',
  x: '/settings',
}

const LEADER_TIMEOUT_MS = 1200

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

/**
 * "g" then a letter navigates (g d = dashboard, g s = subjects, ...); "?"
 * opens the shortcuts help. Both are ignored while typing in a field or
 * while any dialog is open, so they never hijack normal form input.
 */
export function useGlobalShortcuts(onOpenHelp: () => void) {
  const navigate = useNavigate()
  const [awaitingLeader, setAwaitingLeader] = useState(false)
  const leaderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"]')) return

      if (awaitingLeader) {
        setAwaitingLeader(false)
        if (leaderTimeout.current) clearTimeout(leaderTimeout.current)
        const path = NAV_SHORTCUTS[e.key.toLowerCase()]
        if (path) {
          e.preventDefault()
          navigate(path)
        }
        return
      }

      if (e.key === 'g') {
        setAwaitingLeader(true)
        leaderTimeout.current = setTimeout(() => setAwaitingLeader(false), LEADER_TIMEOUT_MS)
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        onOpenHelp()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [awaitingLeader, navigate, onOpenHelp])
}
