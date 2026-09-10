import { useEffect, useState } from 'react'
import { Download, Sparkles, X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface UpdateStatusPayload {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: any
  progress?: {
    percent?: number
    bytesPerSecond?: number
    transferred?: number
    total?: number
  }
  error?: string
}

export function AutoUpdateNotifier() {
  const [updateState, setUpdateState] = useState<UpdateStatusPayload>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!window.bunkmate?.updater?.onStatusChange) return

    const unsubscribe = window.bunkmate.updater.onStatusChange((payload: any) => {
      setUpdateState(payload)
      if (payload.status === 'available' || payload.status === 'downloading' || payload.status === 'downloaded') {
        // Reset dismissal on active update states
        setDismissed(false)
      }
      if (payload.status === 'downloading') {
        setDownloading(true)
      } else if (payload.status === 'downloaded' || payload.status === 'error') {
        setDownloading(false)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  if (dismissed || !['available', 'downloading', 'downloaded'].includes(updateState.status)) {
    return null
  }

  const version = updateState.info?.version ?? 'New Version'

  async function handleDownload() {
    if (!window.bunkmate?.updater) return
    setDownloading(true)
    try {
      await window.bunkmate.updater.downloadUpdate()
    } catch (err) {
      setDownloading(false)
      setUpdateState((prev) => ({ ...prev, status: 'error', error: String(err) }))
    }
  }

  function handleInstall() {
    if (!window.bunkmate?.updater) return
    window.bunkmate.updater.quitAndInstall()
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-background/95 backdrop-blur p-4 shadow-2xl space-y-3">
        {/* Top Header line */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              {updateState.status === 'downloaded' ? (
                <CheckCircle2 className="size-5 text-emerald-500" />
              ) : updateState.status === 'downloading' ? (
                <Download className="size-5 animate-bounce text-primary" />
              ) : (
                <Sparkles className="size-5 text-amber-500" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {updateState.status === 'downloaded'
                  ? 'Update Ready to Install'
                  : updateState.status === 'downloading'
                    ? 'Downloading Update...'
                    : `BunkMate Pro ${version} Available`}
              </h4>
              <p className="text-xs text-muted-foreground">
                {updateState.status === 'downloaded'
                  ? 'Restart app now to complete the update in-place.'
                  : updateState.status === 'downloading'
                    ? `${(updateState.progress?.percent ?? 0).toFixed(1)}% downloaded`
                    : 'A new version with features and fixes is ready.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
            title="Dismiss notification"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Download Progress Bar */}
        {updateState.status === 'downloading' && (
          <div className="space-y-1.5 pt-1">
            <Progress value={updateState.progress?.percent ?? 0} className="h-2" />
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>
                {Math.round((updateState.progress?.bytesPerSecond ?? 0) / 1024)} KB/s
              </span>
              <span>
                {updateState.progress?.transferred ? (updateState.progress.transferred / (1024 * 1024)).toFixed(1) : 0} MB /{' '}
                {updateState.progress?.total ? (updateState.progress.total / (1024 * 1024)).toFixed(1) : 0} MB
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
          {updateState.status === 'available' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
                Later
              </Button>
              <Button size="sm" onClick={handleDownload} disabled={downloading}>
                <Download className="size-3.5 mr-1.5" />
                {downloading ? 'Starting...' : 'Update Now'}
              </Button>
            </>
          )}

          {updateState.status === 'downloaded' && (
            <Button size="sm" onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="size-3.5 mr-1.5" /> Restart & Install
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
