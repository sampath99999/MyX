import { Component, type ErrorInfo, type ReactNode } from "react";

/*
  Without this, any render-time exception unmounts the whole React tree and
  leaves a blank white page with the error only in the console — the worst
  possible failure for someone who just wanted to check their balance.

  Deliberately class-based: catching render errors is the one thing hooks still
  cannot do.
*/
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the Worker's logs only if the user reports it, but at least
    // the stack is somewhere findable rather than swallowed.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Something broke on this screen.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Your data is safe — this is a display error, not a save error. Reloading usually clears
          it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground glow"
          >
            Reload
          </button>
          <a
            href="/dashboard"
            className="rounded-xl border border-border/60 px-6 py-3 font-medium transition-colors hover:bg-accent"
          >
            Back to dashboard
          </a>
        </div>
        <pre className="mt-8 max-w-full overflow-x-auto rounded-lg border border-border/60 p-4 text-left text-xs text-muted-foreground">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
