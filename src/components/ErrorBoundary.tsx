import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
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
        <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center px-4 py-12">
          <div className="tb-card w-full max-w-md p-6 text-center">
            <div className="flex justify-center text-red-400/95 mb-4" aria-hidden>
              <AlertTriangle className="h-12 w-12" />
            </div>
            <h1 className="text-lg font-semibold text-white">Qualcosa è andato storto</h1>
            <p className="mt-2 text-sm text-white/70">
              Abbiamo registrato il problema. Puoi ricaricare o tornare alla home.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="tb-btn tb-btn-primary"
                onClick={() => {
                  window.location.reload()
                }}
              >
                Ricarica
              </button>
              <button
                type="button"
                className="tb-btn border border-white/15 bg-transparent text-white/90 hover:bg-white/5"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.href = '/'
                }}
              >
                Torna alla home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
