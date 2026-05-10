import { Component, type ErrorInfo, type ReactNode } from 'react'
import Button from '@/shared/ui/Button'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
}

export default class InlineErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Inline error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div>
            <div className="text-sm font-semibold text-white">Contenuto non disponibile</div>
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => this.setState({ hasError: false })}
              >
                Riprova
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

