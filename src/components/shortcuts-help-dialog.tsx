import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const NAV_ROWS: [string, string][] = [
  ['g d', 'Go to Dashboard'],
  ['g s', 'Go to Subjects'],
  ['g a', 'Go to Attendance'],
  ['g t', 'Go to Timetable'],
  ['g c', 'Go to Calendar'],
  ['g p', 'Go to Planner'],
  ['g y', 'Go to Analytics'],
  ['g x', 'Go to Settings'],
]

const PAGE_ROWS: [string, string][] = [
  ['n', 'New subject / mark attendance (on their pages)'],
  ['?', 'Show this help'],
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</kbd>
  )
}

export function ShortcutsHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Ignored while typing in a field or with a dialog open.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Navigation</p>
            {NAV_ROWS.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <Kbd>{keys}</Kbd>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-sm font-semibold">Actions</p>
            {PAGE_ROWS.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <Kbd>{keys}</Kbd>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
