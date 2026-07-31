import { useState } from 'react'
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts'
import { ShortcutsHelpDialog } from '@/components/shortcuts-help-dialog'

export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false)
  useGlobalShortcuts(() => setHelpOpen(true))
  return <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
}
