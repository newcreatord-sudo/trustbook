import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = {
  hasError: boolean
  message: string | null
}

export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Errore imprevisto' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a readable breadcrumb for developers without exposing internals to users.
    console.error('[AppErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center px-4">
          <div className="tb-card w-full max-w-lg p-6">
            <div className="text-sm font-semibold text-white">Qualcosa è andato storto</div>
            <div className="mt-1 text-sm text-white/70">
              {this.state.message ? `${this.state.message}. ` : ''}
              Ricarica la pagina o riprova tra poco.
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="tb-btn tb-btn-primary mt-4"
            >
              Ricarica
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

