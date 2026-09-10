import { useState } from 'react'
import { Cloud, FolderOpen, RefreshCw, Download, CheckCircle2, ShieldCheck, HardDrive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'

export function CloudSyncManager() {
  const backupDir = useSettingsStore((s) => s.backupDir)
  const setBackupDir = useSettingsStore((s) => s.setBackupDir)
  const backupIntervalDays = useSettingsStore((s) => s.backupIntervalDays)
  const setBackupIntervalDays = useSettingsStore((s) => s.setBackupIntervalDays)
  const lastBackupAt = useSettingsStore((s) => s.lastBackupAt)
  const pushToast = useToastStore((s) => s.push)

  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)

  async function handleChooseDir() {
    try {
      const dir = await window.bunkmate.backup.chooseDir()
      if (dir) {
        await setBackupDir(dir)
        pushToast({
          title: 'Backup Folder Set',
          description: `Automatic backups will be saved to ${dir}`,
        })
      }
    } catch {
      pushToast({ title: 'Error', description: 'Could not select backup directory.' })
    }
  }

  async function handleBackupNow() {
    setBackingUp(true)
    try {
      const path = await window.bunkmate.backup.now()
      if (path) {
        pushToast({
          title: 'Backup Complete',
          description: `Snapshot saved to ${path.split(/[\\/]/).pop()}`,
        })
      }
    } catch (err) {
      pushToast({ title: 'Backup Failed', description: String(err) })
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      const success = await window.bunkmate.backup.restore()
      if (!success) setRestoring(false)
    } catch (err) {
      setRestoring(false)
      pushToast({ title: 'Restore Failed', description: String(err) })
    }
  }

  const isCloudSynced = backupDir?.toLowerCase().includes('onedrive') ||
                        backupDir?.toLowerCase().includes('google drive') ||
                        backupDir?.toLowerCase().includes('dropbox') ||
                        backupDir?.toLowerCase().includes('icloud')

  return (
    <Card className="border bg-card/60">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Cloud className="size-5 text-primary" /> Cloud & Automatic Database Backups
          </span>
          {isCloudSynced ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-xs dark:text-emerald-400">
              <ShieldCheck className="size-3.5 text-emerald-500" /> Cloud Directory Active
            </Badge>
          ) : backupDir ? (
            <Badge variant="outline" className="bg-primary/10 text-primary gap-1 text-xs">
              <HardDrive className="size-3.5" /> Local Backup Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              Not Configured
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Automatically back up your attendance records, timetable, and Yellow Forms to local cloud folders (Google Drive, OneDrive, Dropbox).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Backup Target Folder */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Backup Target Folder (Local or Cloud-Synced)</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-muted/30 px-3 py-2 text-xs font-mono truncate text-muted-foreground">
              {backupDir || 'No backup directory selected (Click Choose Folder)'}
            </div>
            <Button variant="outline" size="sm" onClick={handleChooseDir}>
              <FolderOpen className="size-3.5 mr-1.5" /> Choose Folder
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tip: Point this to your OneDrive or Google Drive folder to automatically sync snapshots across computers.
          </p>
        </div>

        {/* Schedule & Timing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Auto-Backup Frequency</Label>
            <Select
              value={String(backupIntervalDays)}
              onValueChange={(val) => setBackupIntervalDays(Number(val))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every 24 hours (Daily)</SelectItem>
                <SelectItem value="3">Every 3 days</SelectItem>
                <SelectItem value="7">Every 7 days (Weekly)</SelectItem>
                <SelectItem value="14">Every 14 days</SelectItem>
                <SelectItem value="30">Every 30 days (Monthly)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Last Backup Snapshot</Label>
            <div className="rounded-md border p-2 bg-muted/20 text-xs flex items-center justify-between h-9">
              <span className="font-mono text-muted-foreground text-[11px]">
                {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'Never backed up'}
              </span>
              {lastBackupAt && <CheckCircle2 className="size-3.5 text-emerald-500" />}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleBackupNow} disabled={backingUp}>
              <RefreshCw className={`size-3.5 mr-1.5 ${backingUp ? 'animate-spin' : ''}`} />
              {backingUp ? 'Creating Snapshot...' : 'Backup Now'}
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleRestore} disabled={restoring}>
            <Download className="size-3.5 mr-1.5" />
            {restoring ? 'Restoring...' : 'Restore from Backup File'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
