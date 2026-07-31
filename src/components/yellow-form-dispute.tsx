// Shared between the Yellow Forms page and the Calendar day panel so
// dispute filing/viewing/resolving has exactly one UI implementation, not
// a copy per surface. Self-contained: owns its own dialog state and talks
// to useYellowFormsStore directly, so a caller only needs to render
// <YellowFormDisputeBadge form={f} subjectName={...} />.
import { useState } from 'react'
import { Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { useToastStore } from '@/store/toast-store'
import type { YellowForm, YellowFormDispute } from '../../electron/db/repositories/yellow-forms'
import type { YellowFormDisputeOutcome } from '@/db/schema'

const OUTCOME_VARIANT = {
  overturned: 'success',
  upheld: 'destructive',
} as const satisfies Record<YellowFormDisputeOutcome, 'success' | 'destructive'>

export function YellowFormDisputeBadge({ form, subjectName }: { form: YellowForm; subjectName: string }) {
  const { getDispute, fileDispute, resolveDispute } = useYellowFormsStore()
  const pushToast = useToastStore((s) => s.push)

  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [note, setNote] = useState('')
  const [filing, setFiling] = useState(false)

  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [dispute, setDispute] = useState<YellowFormDispute | null>(null)
  const [resolving, setResolving] = useState(false)

  function openFile() {
    setNote('')
    setFileDialogOpen(true)
  }

  async function handleFile(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setFiling(true)
    try {
      await fileDispute(form.id, note.trim())
      pushToast({ title: 'Dispute filed' })
      setFileDialogOpen(false)
    } catch (err) {
      pushToast({ title: 'Could not file dispute', description: err instanceof Error ? err.message : String(err) })
    } finally {
      setFiling(false)
    }
  }

  async function openView() {
    setDispute((await getDispute(form.id)) ?? null)
    setViewDialogOpen(true)
  }

  async function handleResolve(outcome: YellowFormDisputeOutcome) {
    setResolving(true)
    try {
      await resolveDispute(form.id, outcome)
      pushToast({ title: `Dispute recorded as ${outcome}` })
      setDispute((await getDispute(form.id)) ?? null)
    } catch (err) {
      pushToast({ title: 'Could not record outcome', description: err instanceof Error ? err.message : String(err) })
    } finally {
      setResolving(false)
    }
  }

  return (
    <>
      {form.disputeStatus === 'none' && form.status !== 'pending' && (
        <Button variant="ghost" size="sm" onClick={openFile}>
          <Scale /> File dispute
        </Button>
      )}
      {form.disputeStatus === 'disputed' && (
        <Button variant="ghost" size="sm" onClick={openView}>
          <Badge variant="warning">disputed</Badge>
        </Button>
      )}
      {form.disputeStatus === 'resolved' && (
        <Button variant="ghost" size="sm" onClick={openView}>
          <Badge variant="secondary">resolved</Badge>
        </Button>
      )}

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent>
          <form onSubmit={handleFile} className="space-y-4">
            <DialogHeader>
              <DialogTitle>File a dispute</DialogTitle>
              <DialogDescription>
                Contesting the {form.status} decision on {subjectName}, {form.date}
                {form.period ? ` · P${form.period}` : ' · whole day'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`dispute-note-${form.id}`}>Note</Label>
              <Input
                id={`dispute-note-${form.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why should this decision be reconsidered?"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFileDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={filing || !note.trim()}>
                File dispute
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute</DialogTitle>
            <DialogDescription>
              {subjectName}, {form.date} (originally {form.status}).
            </DialogDescription>
          </DialogHeader>
          {dispute ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Note</div>
                <div>{dispute.note}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Filed</div>
                <div>{new Date(dispute.filedAt).toLocaleString()}</div>
              </div>
              {dispute.outcome ? (
                <div>
                  <div className="text-muted-foreground">Outcome</div>
                  <Badge variant={OUTCOME_VARIANT[dispute.outcome]}>{dispute.outcome}</Badge>
                  {dispute.resolvedAt && (
                    <span className="ml-2 text-muted-foreground">resolved {new Date(dispute.resolvedAt).toLocaleString()}</span>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-muted-foreground">Record the outcome once you hear back</div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={resolving} onClick={() => handleResolve('overturned')}>
                      Overturned
                    </Button>
                    <Button variant="outline" disabled={resolving} onClick={() => handleResolve('upheld')}>
                      Upheld
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No dispute on record.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
