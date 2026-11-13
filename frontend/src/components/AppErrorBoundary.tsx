import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode; resetKey?: string }
type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed:', { path: this.props.resetKey || window.location.pathname, error, componentStack: info.componentStack })
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKey !== previousProps.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
          <section className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-xl font-semibold">JibuSales could not open this page</h1>
            <p className="text-sm text-muted-foreground">This page hit a display error. Your saved business data has not been changed. Try again or use the menu to open another page.</p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={() => this.props.resetKey
                ? this.setState({ hasError: false })
                : window.location.reload()}
            >
              {this.props.resetKey ? 'Retry this page' : 'Reload JibuSales'}
            </button>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
