import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

// Phase 08 (SRE1) — top-level error boundary. Without this, a single render error in
// any page white-screens the entire app mid-service. This catches it, shows a friendly
// recoverable fallback, and lets the user reload — so one bad render never takes the
// whole console/menu down during a service.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : 'Something went wrong' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced to the browser console for diagnosis; no PII, no tokens.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 16,
          padding: 24,
          background: '#0b0b0c',
          color: '#f4f4f5',
          textAlign: 'center'
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: '#a1a1aa', maxWidth: 420, margin: 0 }}>
          The screen hit an unexpected error. Your data is safe on the server. Reload to continue.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            minHeight: 48,
            padding: '0 24px',
            borderRadius: 12,
            border: 'none',
            background: '#c9a24a',
            color: '#0b0b0c',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
