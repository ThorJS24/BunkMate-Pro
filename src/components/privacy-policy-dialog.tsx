import { useState } from 'react'
import { ShieldCheck, Lock, Trash2, FileText, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export function PrivacyPolicyDialog({ triggerText }: { triggerText?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        <ShieldCheck className="size-3.5 mr-1 text-emerald-500" />
        {triggerText ?? 'Privacy Policy & Data Rights'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="size-5 text-emerald-500" />
              Privacy Policy & Legal Rights (DPDP Act & GDPR)
            </DialogTitle>
            <DialogDescription className="text-xs">
              BunkMate Pro is designed as a local-first, zero-telemetry application built for CHRIST University students.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs leading-relaxed">
            {/* Compliance Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-[11px]">
                <CheckCircle2 className="size-3" /> DPDP Act 2023 Compliant (India)
              </Badge>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1 text-[11px]">
                <CheckCircle2 className="size-3" /> GDPR Compliant (EU)
              </Badge>
              <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 gap-1 text-[11px]">
                <Lock className="size-3" /> AES-256 / DPAPI On-Device Encryption
              </Badge>
            </div>

            {/* Pillar 1 */}
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock className="size-4 text-emerald-500" /> 1. On-Device Encryption & Data Minimisation
              </div>
              <p className="text-muted-foreground text-[11px]">
                Your CHRIST Register Number and ESPRO Password are encrypted on your local machine using Windows DPAPI (OS Keychain) and AES-256-GCM. Credentials are decrypted <strong>only in memory</strong> when connecting to official University OAuth endpoints. BunkMate operates zero cloud servers — your data never leaves your device.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileText className="size-4 text-primary" /> 2. Purpose Limitation (CHRIST ESPRO Endpoint Only)
              </div>
              <p className="text-muted-foreground text-[11px]">
                Credentials are used exclusively to request your course attendance records directly from official CHRIST University servers (<code className="bg-muted px-1 rounded">espro.christuniversity.in</code>). No data is collected, sold, analyzed, or transmitted to any third party or analytics service.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Trash2 className="size-4 text-rose-500" /> 3. Right to Erasure & Revocation (Right to be Forgotten)
              </div>
              <p className="text-muted-foreground text-[11px]">
                You retain complete control over your data. You can wipe your saved ESPRO credentials at any time from the Account page or Settings with 1 click. You may also purge your complete attendance database permanently.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="size-4 text-amber-500" /> 4. Data Portability & Access
              </div>
              <p className="text-muted-foreground text-[11px]">
                You have full access to your stored records. You can export your timetable, subjects, and attendance logs to CSV or SQLite database backups at any time.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setOpen(false)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
