import React from 'react';
import { XCircle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught UI error:', error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkFailed = /dynamically imported module|Loading chunk/i.test(this.state.error?.message || '');
    return (
      <div className="center-screen">
        <div className="card card-pad" style={{ maxWidth: 460 }} role="alert">
          <div className="empty-icon" style={{ color: 'var(--danger)', marginBottom: 16 }}><XCircle size={18} aria-hidden="true" /></div>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>This screen failed to load</h1>
          <p className="page-desc" style={{ marginTop: 8 }}>
            {chunkFailed
              ? 'Part of the app could not be downloaded — usually a network hiccup or a new version was just deployed.'
              : 'An unexpected error stopped this screen from rendering. No attendance data was changed.'}
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn" href="/home">Go to home</a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
