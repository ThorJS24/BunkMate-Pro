import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Database, HardDrive, Sparkles, RefreshCw } from 'lucide-react'
import { useToastStore } from '@/store/toast-store'

interface DbStats {
  dbSizeMb: string
  walSizeMb: string
  totalSizeMb: string
  pageCount: number
  pageSize: number
}

export function DbMaintenanceCard() {
  const [stats, setStats] = useState<DbStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [vacuuming, setVacuuming] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  const fetchStats = async () => {
    if (window.bunkmate?.db?.stats) {
      setLoading(true)
      try {
        const res = await window.bunkmate.db.stats()
        if (res.success) {
          setStats(res)
        }
      } catch (err) {
        console.error('Failed to fetch DB stats:', err)
      } finally {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleVacuum = async () => {
    if (!window.bunkmate?.db?.vacuum) return
    setVacuuming(true)
    try {
      const res = await window.bunkmate.db.vacuum()
      if (res.success) {
        pushToast({
          title: 'Database Defragmented',
          description: `VACUUM operation completed cleanly. Freed ${(res.freedBytes / 1024).toFixed(1)} KB.`,
        })
        fetchStats()
      } else {
        pushToast({
          title: 'Vacuum Notice',
          description: res.error || 'Database is already fully optimized.',
        })
      }
    } catch (err) {
      pushToast({
        title: 'Vacuum Error',
        description: err instanceof Error ? err.message : 'Operation failed',
      })
    } finally {
      setVacuuming(false)
    }
  }

  return (
    <Card className="border-primary/20 bg-card/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Database Auto-Repair & Vacuum</CardTitle>
              <CardDescription className="text-xs">
                Inspect SQLite disk usage, WAL logs, and run index defragmentation
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchStats} disabled={loading} title="Refresh DB Stats">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border bg-background/50 p-2.5">
            <span className="text-muted-foreground block">Total Disk Storage</span>
            <span className="text-sm font-semibold font-mono text-foreground">
              {stats ? `${stats.totalSizeMb} MB` : '—'}
            </span>
          </div>
          <div className="rounded-md border bg-background/50 p-2.5">
            <span className="text-muted-foreground block">Main Database</span>
            <span className="text-sm font-semibold font-mono text-foreground">
              {stats ? `${stats.dbSizeMb} MB` : '—'}
            </span>
          </div>
          <div className="rounded-md border bg-background/50 p-2.5 col-span-2 sm:col-span-1">
            <span className="text-muted-foreground block">WAL Journal Log</span>
            <span className="text-sm font-semibold font-mono text-foreground">
              {stats ? `${stats.walSizeMb} MB` : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="text-[11px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <HardDrive className="h-3 w-3 mr-1" />
            SQLite WAL Mode Active
          </Badge>
          <Button size="sm" onClick={handleVacuum} disabled={vacuuming}>
            <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${vacuuming ? 'animate-spin' : ''}`} />
            {vacuuming ? 'Optimizing...' : 'Defrag & Vacuum'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
