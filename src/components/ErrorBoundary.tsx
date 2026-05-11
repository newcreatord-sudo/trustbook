import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import { captureException } from '@/lib/observability'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    captureException(error, { componentStack: errorInfo.componentStack, boundary: 'ErrorBoundary' })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[80vh] items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <div className="flex justify-center text-red-400 mb-4">
              <AlertTriangle className="h-12 w-12" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Ops, qualcosa è andato storto</h1>
            <p className="text-sm text-white/60 mb-6">
              Si è verificato un errore imprevisto. Abbiamo registrato il problema per risolverlo al più presto.
            </p>
            <Button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
            >
              Torna alla Home
            </Button>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
