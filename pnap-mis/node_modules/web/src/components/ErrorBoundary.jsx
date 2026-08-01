import { Component } from 'react';

// React error boundary — catches render-time exceptions anywhere in
// the descendant tree. Without this an uncaught error blanks the
// whole page; here the user gets a recoverable error card.
//
// Class component is required: error boundaries cannot be expressed
// as hooks-based function components.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.setState({ info });
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'var(--bg)',
      }}>
        <div className="card" style={{ maxWidth: 640, width: '100%', borderTop: '4px solid var(--danger)' }}>
          <h2 style={{ marginTop: 0, color: 'var(--danger)' }}>Something went wrong</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            The page hit an unexpected error and stopped rendering. Your data is safe — the
            issue is in the UI rendering, not the underlying records.
          </p>
          <pre style={{
            background: 'var(--surface-alt)', padding: 12, borderRadius: 'var(--radius-sm)',
            overflowX: 'auto', fontSize: 12, color: 'var(--danger)',
            border: '1px solid var(--border)', maxHeight: 220,
          }}>
            {String(error?.message || error)}
          </pre>
          {info?.componentStack && (
            <details style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
              <summary style={{ cursor: 'pointer' }}>Component stack (for debugging)</summary>
              <pre style={{
                marginTop: 8, padding: 10, background: 'var(--surface-alt)',
                borderRadius: 'var(--radius-sm)', overflowX: 'auto',
                border: '1px solid var(--border)',
              }}>
                {info.componentStack.trim()}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn" onClick={this.reset}>Try again</button>
            <button className="btn secondary" onClick={this.reload}>Reload page</button>
          </div>
        </div>
      </div>
    );
  }
}
