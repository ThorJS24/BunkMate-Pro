import { create } from 'zustand'
import type { IssueCategory, IssueSeverity, IssueStatus, MediaAttachment } from '@/db/schema'

export interface IssueReportItem {
  id: number
  title: string
  category: IssueCategory
  severity: IssueSeverity
  description: string
  status: IssueStatus
  mediaAttachments: MediaAttachment[]
  systemDiagnostics?: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

export interface IssueCommentItem {
  id: number
  issueId: number
  author: string
  comment: string
  mediaAttachments: MediaAttachment[]
  createdAt: string | Date
}

interface IssueReportsState {
  issues: IssueReportItem[]
  commentsByIssueId: Record<number, IssueCommentItem[]>
  loading: boolean
  activeIssueId: number | null
  setActiveIssueId: (id: number | null) => void
  load: () => Promise<void>
  loadComments: (issueId: number) => Promise<void>
  createIssue: (input: {
    title: string
    category: IssueCategory
    severity: IssueSeverity
    description: string
    mediaAttachments?: MediaAttachment[]
    systemDiagnostics?: string
  }) => Promise<IssueReportItem>
  updateIssueStatus: (id: number, status: IssueStatus) => Promise<void>
  deleteIssue: (id: number) => Promise<void>
  addComment: (input: { issueId: number; author?: string; comment: string; mediaAttachments?: MediaAttachment[] }) => Promise<void>
}

export const useIssueReportsStore = create<IssueReportsState>((set, get) => ({
  issues: [],
  commentsByIssueId: {},
  loading: false,
  activeIssueId: null,

  setActiveIssueId: (id) => set({ activeIssueId: id }),

  load: async () => {
    set({ loading: true })
    try {
      if (window.bunkmate?.issues?.list) {
        const list = await window.bunkmate.issues.list()
        set({ issues: list as any[] })
      }
    } catch (err) {
      console.error('Failed to load issue reports:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadComments: async (issueId) => {
    try {
      if (window.bunkmate?.issues?.listComments) {
        const comments = await window.bunkmate.issues.listComments(issueId)
        set((state) => ({
          commentsByIssueId: {
            ...state.commentsByIssueId,
            [issueId]: comments as any[],
          },
        }))
      }
    } catch (err) {
      console.error(`Failed to load comments for issue ${issueId}:`, err)
    }
  },

  createIssue: async (input) => {
    if (!window.bunkmate?.issues?.create) {
      throw new Error('Issue reporting API unavailable.')
    }
    const created = await window.bunkmate.issues.create({
      title: input.title,
      category: input.category,
      severity: input.severity,
      description: input.description,
      status: 'open',
      mediaAttachments: input.mediaAttachments ?? [],
      systemDiagnostics: input.systemDiagnostics ?? null,
    })
    await get().load()
    set({ activeIssueId: created.id })
    return created as any
  },

  updateIssueStatus: async (id, status) => {
    if (!window.bunkmate?.issues?.update) return
    await window.bunkmate.issues.update(id, { status })
    await get().load()
  },

  deleteIssue: async (id) => {
    if (!window.bunkmate?.issues?.delete) return
    await window.bunkmate.issues.delete(id)
    if (get().activeIssueId === id) set({ activeIssueId: null })
    await get().load()
  },

  addComment: async (input) => {
    if (!window.bunkmate?.issues?.addComment) return
    await window.bunkmate.issues.addComment({
      issueId: input.issueId,
      author: input.author ?? 'User',
      comment: input.comment,
      mediaAttachments: input.mediaAttachments ?? [],
    })
    await get().loadComments(input.issueId)
    await get().load()
  },
}))
