import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  code: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, code: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    fetch('/api/errors/client', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: `${error.stack ?? ''}\n---\n${info.componentStack ?? ''}`.slice(0, 8000),
        path: window.location.pathname,
      }),
    })
      .then((r) => r.json())
      .then((d: { errorId?: string }) => this.setState({ code: d.errorId ?? null }))
      .catch(() => {});
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center p-8">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-lg">
          <div className="text-lg font-semibold">Une erreur est survenue</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Quelque chose a planté. Communique ce code au staff pour un dépannage rapide :
          </p>
          <div className="mt-3 select-all rounded-lg border bg-background px-3 py-2 font-mono text-lg font-bold tracking-widest text-primary">
            {this.state.code ?? 'génération…'}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 h-9 rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
