import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack)
    // No-ops main-side unless the crash-log setting is on — this call is
    // unconditional so the renderer doesn't need its own copy of that
    // setting just to decide whether to make it.
    window.bunkmate.crashLog
      .record(`${error.stack ?? error.message}\n${info.componentStack ?? ''}`)
      .catch(() => {})
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" /> Something went wrong
            </CardTitle>
            <CardDescription>
              This screen hit an unexpected error. Your data hasn't been touched, try reloading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }
}
