import { useState } from 'react'
import { HelpCircle, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { IssueReporterDialog } from '@/components/issue-reporter-dialog'

const GLOSSARY: { term: string; definition: string }[] = [
  {
    term: 'ESPRO',
    definition:
      "CHRIST University's own attendance portal. BunkMate can optionally log in and compare its numbers against what you've tracked yourself, or sync your class-by-class attendance from it directly.",
  },
  {
    term: 'ESPRO session number',
    definition:
      'A small number that tells ESPRO which academic term to pull attendance from. It usually stays the same all semester once set.',
  },
  {
    term: 'Aggregate target',
    definition:
      "The overall attendance percentage across all subjects combined. CHRIST's norm is 85% — fall below it and you risk detention from the End Semester Exam.",
  },
  {
    term: 'Per-subject target',
    definition:
      "The attendance percentage required in one individual subject to be allowed to sit that subject's Mid Semester Exam. CHRIST's norm is 75%.",
  },
  {
    term: 'Yellow form',
    definition:
      'A permission slip for an approved absence (medical, event, etc.). Filing one lets you dispute how an absence counted against your attendance.',
  },
  {
    term: 'Density',
    definition: 'How tightly spaced the app\'s lists and tables are — "Compact" fits more on screen, "Comfortable" is easier to tap.',
  },
  {
    term: 'Launch view',
    definition: 'Which page BunkMate opens to first when you start it — Today or Dashboard.',
  },
]

export function HelpCenterButton() {
  const [open, setOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Help"
        title="Help & getting started"
      >
        <HelpCircle className="size-4" />
      </Button>
      <IssueReporterDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>Your setup progress, and what the less obvious terms in BunkMate mean.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="getting-started">
            <TabsList>
              <TabsTrigger value="getting-started">Getting started</TabsTrigger>
              <TabsTrigger value="glossary">Glossary</TabsTrigger>
            </TabsList>
            <TabsContent value="getting-started">
              <OnboardingChecklist alwaysVisible />
              <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div className="text-xs">
                  <p className="font-semibold">Having an issue or bug?</p>
                  <p className="text-muted-foreground">Report bugs, request features, or attach screenshots.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    setOpen(false)
                    setIssueOpen(true)
                  }}
                >
                  <Bug className="mr-1.5 size-3.5" />
                  Report Issue
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="glossary" className="space-y-3">
              {GLOSSARY.map((g) => (
                <div key={g.term}>
                  <p className="text-sm font-medium">{g.term}</p>
                  <p className="text-sm text-muted-foreground">{g.definition}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
