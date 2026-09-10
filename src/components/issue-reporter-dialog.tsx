import { useState, useEffect, useRef } from 'react'
import {
  Bug,
  Plus,
  Paperclip,
  Trash2,
  Copy,
  ExternalLink,
  MessageSquare,
  FileText,
  X,
  Image as ImageIcon,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useIssueReportsStore, type IssueReportItem } from '@/store/issue-reports-store'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'
import type { IssueCategory, IssueSeverity, MediaAttachment } from '@/db/schema'

export function IssueReporterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    issues,
    commentsByIssueId,
    activeIssueId,
    setActiveIssueId,
    load,
    loadComments,
    createIssue,
    updateIssueStatus,
    deleteIssue,
    addComment,
  } = useIssueReportsStore()

  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const pushToast = useToastStore((s) => s.push)

  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<IssueCategory>('bug')
  const [severity, setSeverity] = useState<IssueSeverity>('medium')
  const [description, setDescription] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [attachments, setAttachments] = useState<MediaAttachment[]>([])

  const [commentText, setCommentText] = useState('')
  const [commentAttachments, setCommentAttachments] = useState<MediaAttachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [previewMedia, setPreviewMedia] = useState<MediaAttachment | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const commentFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      load()
    }
  }, [open, load])

  const activeIssue = issues.find((i) => i.id === activeIssueId) ?? issues[0]

  useEffect(() => {
    if (activeIssue) {
      loadComments(activeIssue.id)
    }
  }, [activeIssue?.id, loadComments])

  const getDiagnosticsText = () => {
    return JSON.stringify(
      {
        appName: 'BunkMate Pro',
        version: '2.1.2',
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        activeSemester: currentSemester,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )
  }

  const handleSelectMedia = async (isComment = false) => {
    if (window.bunkmate?.issues?.selectMedia) {
      try {
        const media = await window.bunkmate.issues.selectMedia()
        if (media.length > 0) {
          if (isComment) setCommentAttachments((prev) => [...prev, ...media])
          else setAttachments((prev) => [...prev, ...media])
        }
      } catch (err) {
        console.error('Failed to select media via IPC:', err)
      }
      return
    }
    if (isComment) commentFileInputRef.current?.click()
    else fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, isComment = false) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const readPromises: Promise<MediaAttachment>[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > 10 * 1024 * 1024) continue
      readPromises.push(
        new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            resolve({
              name: file.name,
              type: file.type || 'application/octet-stream',
              dataUrl: reader.result as string,
            })
          }
          reader.readAsDataURL(file)
        }),
      )
    }

    Promise.all(readPromises).then((newItems) => {
      if (isComment) setCommentAttachments((prev) => [...prev, ...newItems])
      else setAttachments((prev) => [...prev, ...newItems])
    })
  }

  const handleRemoveAttachment = (index: number, isComment = false) => {
    if (isComment) {
      setCommentAttachments((prev) => prev.filter((_, i) => i !== index))
    } else {
      setAttachments((prev) => prev.filter((_, i) => i !== index))
    }
  }

  const handleSubmitIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      pushToast({ title: 'Validation Error', description: 'Please provide both an issue title and description.' })
      return
    }
    setSubmitting(true)
    try {
      const created = await createIssue({
        title: title.trim(),
        category,
        severity,
        description: description.trim(),
        mediaAttachments: attachments,
        systemDiagnostics: includeDiagnostics ? getDiagnosticsText() : undefined,
      })
      pushToast({ title: 'Issue Reported', description: `Report #${created.id} saved successfully.` })
      setTitle('')
      setDescription('')
      setAttachments([])
      setActiveTab('history')
    } catch (err) {
      pushToast({ title: 'Failed to Report Issue', description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeIssue || !commentText.trim()) return
    setSubmitting(true)
    try {
      await addComment({
        issueId: activeIssue.id,
        author: 'User',
        comment: commentText.trim(),
        mediaAttachments: commentAttachments,
      })
      setCommentText('')
      setCommentAttachments([])
      pushToast({ title: 'Comment Added', description: 'Your comment has been attached to the issue thread.' })
    } catch (err) {
      pushToast({ title: 'Failed to Add Comment', description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSubmitting(false)
    }
  }

  const formatMarkdownReport = (issue: IssueReportItem) => {
    const comments = commentsByIssueId[issue.id] ?? []
    let md = `## [${issue.category.toUpperCase()}] ${issue.title}\n\n`
    md += `**Severity**: ${issue.severity.toUpperCase()} | **Status**: ${issue.status.toUpperCase()} | **Date**: ${new Date(issue.createdAt).toLocaleString()}\n\n`
    md += `### Description\n${issue.description}\n\n`

    if (issue.systemDiagnostics) {
      md += `### System Diagnostics\n\`\`\`json\n${issue.systemDiagnostics}\n\`\`\`\n\n`
    }
    if (comments.length > 0) {
      md += `### Comments Thread (${comments.length})\n`
      comments.forEach((c, idx) => {
        md += `\n**Comment #${idx + 1} by ${c.author}** (${new Date(c.createdAt).toLocaleString()}):\n${c.comment}\n`
      })
    }
    return md
  }

  const handleCopyMarkdown = (issue: IssueReportItem) => {
    const md = formatMarkdownReport(issue)
    navigator.clipboard.writeText(md)
    pushToast({ title: 'Copied to Clipboard', description: 'Formatted Markdown issue report copied.' })
  }

  const handleOpenGitHub = (issue?: IssueReportItem) => {
    const titleText = issue ? `[${issue.category}] ${issue.title}` : title || 'Bug Report'
    const bodyText = issue ? formatMarkdownReport(issue) : description || 'Describe your issue here...'
    const url = `https://github.com/ThorJS24/BunkMate-Pro/issues/new?title=${encodeURIComponent(titleText)}&body=${encodeURIComponent(bodyText)}`
    window.open(url, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bug className="size-5 text-primary" />
            <DialogTitle>Bug & Issue Center</DialogTitle>
          </div>
          <DialogDescription>
            Report bugs, request features, add media attachments, and track issue history.
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept="image/*,.log,.txt,.json"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFileInputChange(e, false)}
        />
        <input
          type="file"
          ref={commentFileInputRef}
          className="hidden"
          multiple
          accept="image/*,.log,.txt,.json"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFileInputChange(e, true)}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-1.5">
              <Plus className="size-3.5" />
              Report Issue / Bug
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <MessageSquare className="size-3.5" />
              My Reported Issues ({issues.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4 pt-2">
            <form onSubmit={handleSubmitIssue} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="issue-title">Issue Title *</Label>
                <Input
                  id="issue-title"
                  placeholder="e.g., Timetable period 5 shows incorrect subject name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as IssueCategory)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug / Error</SelectItem>
                      <SelectItem value="espro_sync">ESPRO Sync Problem</SelectItem>
                      <SelectItem value="ui">UI / Layout Issue</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as IssueSeverity)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (Cosmetic)</SelectItem>
                      <SelectItem value="medium">Medium (Annoying)</SelectItem>
                      <SelectItem value="high">High (Breaks Feature)</SelectItem>
                      <SelectItem value="critical">Critical (Crash / Data Loss)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue-desc">Detailed Description & Steps *</Label>
                <textarea
                  id="issue-desc"
                  rows={4}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Describe what happened, what you expected, and steps to reproduce..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="size-3.5" />
                    Media & File Attachments ({attachments.length})
                  </Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleSelectMedia(false)}>
                    <ImageIcon className="mr-1.5 size-3.5" />
                    Add Screenshot / Media
                  </Button>
                </div>

                {attachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="group relative flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs"
                      >
                        {att.dataUrl && att.type.startsWith('image/') ? (
                          <img
                            src={att.dataUrl}
                            alt={att.name}
                            className="size-8 rounded object-cover cursor-pointer hover:opacity-80"
                            onClick={() => setPreviewMedia(att)}
                          />
                        ) : (
                          <FileText className="size-6 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate flex-1 font-medium">{att.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemoveAttachment(idx, false)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  id="diag-toggle"
                  checked={includeDiagnostics}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeDiagnostics(e.target.checked)}
                  className="rounded border-input"
                />
                <label htmlFor="diag-toggle">Auto-include anonymous system diagnostics (App v2.1.2, OS, DB status)</label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => handleOpenGitHub()}>
                  <ExternalLink className="mr-1.5 size-3.5" />
                  GitHub Issue
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Save Issue Report'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="history" className="space-y-4 pt-2">
            {issues.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No issue reports filed yet. Switch to "Report Issue / Bug" to log one.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-1 border-r pr-2 max-h-[50vh] overflow-y-auto">
                  {issues.map((iss) => {
                    const isActive = iss.id === activeIssue?.id
                    return (
                      <div
                        key={iss.id}
                        onClick={() => setActiveIssueId(iss.id)}
                        className={`cursor-pointer rounded-lg border p-2.5 text-left transition-colors ${
                          isActive ? 'bg-primary/10 border-primary' : 'bg-card hover:bg-accent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <Badge variant={iss.category === 'bug' ? 'destructive' : 'secondary'} className="text-[10px]">
                            {iss.category}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {iss.status}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold line-clamp-1">{iss.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {new Date(iss.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {activeIssue && (
                  <div className="space-y-4 md:col-span-2 max-h-[50vh] overflow-y-auto pl-1">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <h4 className="text-sm font-semibold">{activeIssue.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          Filed #{activeIssue.id} · {new Date(activeIssue.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Copy Markdown Report"
                          onClick={() => handleCopyMarkdown(activeIssue)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          title="Delete Report"
                          onClick={() => deleteIssue(activeIssue.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="whitespace-pre-wrap rounded-md bg-muted/30 p-2.5 leading-relaxed">
                        {activeIssue.description}
                      </p>

                      {activeIssue.mediaAttachments && activeIssue.mediaAttachments.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-semibold text-muted-foreground">Attachments ({activeIssue.mediaAttachments.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {activeIssue.mediaAttachments.map((att, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1 rounded border bg-card p-1 text-[11px] cursor-pointer hover:bg-accent"
                                onClick={() => att.dataUrl && setPreviewMedia(att)}
                              >
                                {att.dataUrl && att.type.startsWith('image/') ? (
                                  <img src={att.dataUrl} alt={att.name} className="size-6 rounded object-cover" />
                                ) : (
                                  <FileText className="size-4" />
                                )}
                                <span className="max-w-[100px] truncate">{att.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <span className="font-semibold text-muted-foreground">Status:</span>
                        <Select
                          value={activeIssue.status}
                          onValueChange={(val) => updateIssueStatus(activeIssue.id, val as any)}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3 border-t pt-3">
                      <p className="text-xs font-semibold flex items-center gap-1">
                        <MessageSquare className="size-3.5 text-primary" />
                        Comments & Discussion ({(commentsByIssueId[activeIssue.id] ?? []).length})
                      </p>

                      <div className="space-y-2 max-h-[20vh] overflow-y-auto">
                        {(commentsByIssueId[activeIssue.id] ?? []).map((comm) => (
                          <div key={comm.id} className="rounded-md border bg-card p-2 text-xs space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{comm.author}</span>
                              <span>{new Date(comm.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="whitespace-pre-wrap">{comm.comment}</p>
                            {comm.mediaAttachments && comm.mediaAttachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {comm.mediaAttachments.map((att, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] cursor-pointer"
                                    onClick={() => att.dataUrl && setPreviewMedia(att)}
                                  >
                                    {att.dataUrl && att.type.startsWith('image/') ? (
                                      <img src={att.dataUrl} alt={att.name} className="size-4 rounded object-cover" />
                                    ) : (
                                      <FileText className="size-3" />
                                    )}
                                    <span>{att.name}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleAddComment} className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          placeholder="Add a comment or follow-up details..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <div className="flex items-center justify-between">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleSelectMedia(true)}
                          >
                            <Paperclip className="mr-1 size-3" />
                            Attach Media ({commentAttachments.length})
                          </Button>
                          <Button type="submit" size="sm" className="h-7 text-xs" disabled={submitting || !commentText.trim()}>
                            <Send className="mr-1 size-3" />
                            Post Comment
                          </Button>
                        </div>
                        {commentAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {commentAttachments.map((att, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px]">
                                {att.name}
                                <X className="size-3 cursor-pointer" onClick={() => handleRemoveAttachment(idx, true)} />
                              </span>
                            ))}
                          </div>
                        )}
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {previewMedia && previewMedia.dataUrl && (
        <Dialog open={!!previewMedia} onOpenChange={() => setPreviewMedia(null)}>
          <DialogContent className="max-w-3xl p-2">
            <div className="flex items-center justify-between px-3 py-1 border-b">
              <span className="text-sm font-semibold truncate">{previewMedia.name}</span>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => setPreviewMedia(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex justify-center p-2 bg-black/80 rounded-b max-h-[70vh] overflow-auto">
              <img src={previewMedia.dataUrl} alt={previewMedia.name} className="max-h-[65vh] object-contain rounded" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}