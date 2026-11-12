import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
          <section className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-xl font-semibold">JibuSales could not open this page</h1>
            <p className="text-sm text-muted-foreground">Reload to try again. Your saved business data has not been changed.</p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reload JibuSales
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
