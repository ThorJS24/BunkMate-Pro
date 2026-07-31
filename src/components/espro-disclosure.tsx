import { ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Plain-language disclosure shown before any ESPRO credential can be entered,
// and viewable again anytime from the "About ESPRO sync & your data" link. A
// few honest sentences — not a wall of legal text.
export function EsproDisclosure() {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <ShieldCheck className="size-4 text-success" /> How your ESPRO login is stored
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Your ESPRO password is <span className="font-medium text-foreground">encrypted on this device</span> using
          your operating system's built-in credential encryption (Electron <code>safeStorage</code>, Windows DPAPI on
          this PC). BunkMate never keeps a readable copy.
        </li>
        <li>
          It stays <span className="font-medium text-foreground">only on this computer</span>. It is never uploaded or
          sent anywhere except directly to ESPRO's own login page (<code>espro.christuniversity.in</code>) when you sync
          your attendance.
        </li>
        <li>
          It's decrypted only in memory, only at the moment a sync runs. It's never written back out in readable form,
          and never included in your data backups.
        </li>
        <li>
          You can <span className="font-medium text-foreground">remove it at any time</span> from this screen; removal
          deletes the encrypted file completely.
        </li>
      </ul>
    </div>
  )
}

// The reopenable version of the disclosure (Part A: viewable again later).
export function EsproAboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About ESPRO sync &amp; your data</DialogTitle>
          <DialogDescription>What BunkMate does with your ESPRO login, in plain terms.</DialogDescription>
        </DialogHeader>
        <EsproDisclosure />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
