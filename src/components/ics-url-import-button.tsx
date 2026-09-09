import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToastStore } from '@/store/toast-store'
import { friendlyError } from '@/lib/friendly-error'

/**
 * The URL counterpart to "Import .ics" (a file picker) — fetches a shared
 * calendar link's raw text via the main process (avoids browser CORS, which
 * a calendar host may not have configured for cross-origin fetch) and hands
 * it to the same ICS text the file-based path already parses, so callers
 * don't need a second review/import pipeline.
 */
export function IcsUrlImportButton({
  onIcsText,
  size,
}: {
  onIcsText: (text: string, source: string) => void
  size?: 'default' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  async function handleFetch() {
    const trimmed = url.trim()
    if (!trimmed) return
    setFetching(true)
    try {
      const text = await window.bunkmate.files.fetchTextUrl(trimmed)
      setOpen(false)
      setUrl('')
      onIcsText(text, trimmed)
    } catch (error) {
      const fe = friendlyError(error, "Couldn't read that calendar link")
      pushToast({ title: "Couldn't read that calendar link", description: fe.message, detail: fe.detail })
    } finally {
      setFetching(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        title="Import from a shared calendar link (.ics URL)"
      >
        <Link2 /> Import from link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from a calendar link</DialogTitle>
            <DialogDescription>
              Paste a public .ics link (e.g. a shared Google/Outlook calendar). Nothing is added until you review and
              confirm it on the next screen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ics-url">Calendar link</Label>
            <Input
              id="ics-url"
              type="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleFetch()
                }
              }}
              placeholder="https://…/calendar.ics"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleFetch} disabled={fetching || !url.trim()}>
              {fetching ? 'Fetching…' : 'Fetch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
