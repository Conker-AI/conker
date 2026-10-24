import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ErrorFallbackProps = { error: unknown; reset: () => void }

type Props = {
  children: ReactNode
  fallback: (props: ErrorFallbackProps) => ReactNode
  /** Any change (for example the route) clears the error and renders the children again. */
  resetKeys?: readonly unknown[]
  onError?: (error: unknown, info: ErrorInfo) => void
}

type State = { error: unknown; failed: boolean }

/** Keeps a rendering failure inside the part of the screen that failed. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previous: Props) {
    if (!this.state.failed) return
    const before = previous.resetKeys ?? [], after = this.props.resetKeys ?? []
    if (before.length !== after.length || before.some((value, index) => !Object.is(value, after[index]))) this.reset()
  }

  reset = () => this.setState({ error: null, failed: false })

  render() {
    return this.state.failed ? this.props.fallback({ error: this.state.error, reset: this.reset }) : this.props.children
  }
}
