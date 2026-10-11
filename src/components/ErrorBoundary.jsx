import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh', 
          padding: '2rem', 
          textAlign: 'center',
          background: 'var(--bg-main)',
          color: 'var(--text-main)',
          fontFamily: 'var(--hud-font)'
        }}>
          <div className="glow-red" style={{ 
            padding: '2.5rem', 
            borderRadius: '4px', 
            border: '2px solid var(--stark-red)', 
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            maxWidth: '600px',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-15px', 
              left: '20px', 
              background: 'var(--bg-main)', 
              padding: '0 10px',
              color: 'var(--stark-red)',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '2px'
            }}>
              SYSTEM.ANOMALY_DETECTED
            </div>
            
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: '1rem', letterSpacing: '1px' }}>
              CRITICAL RENDERING INTERRUPT
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6', fontSize: '0.875rem' }}>
              The UI core encountered an unhandled exception during the component hydration cycle. F.R.A.M.S is currently operating in safe-mode.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                className="action-btn"
                style={{ backgroundColor: 'var(--stark-red)', border: 'none', color: 'white' }}
              >
                REINITIALIZE_SYSTEM
              </button>
              <button
                onClick={() => { localStorage.clear(); window.location.reload(); }}
                className="action-btn"
                style={{ backgroundColor: 'transparent', border: '1px solid var(--stark-red)', color: 'var(--stark-red)' }}
              >
                PURGE_SESSION_&_REBOOT
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: '2rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '1px' }}>
            A.R.I.A. CORE STABILITY: DEGRADED // ERROR_CODE: {Math.random().toString(16).slice(2, 8).toUpperCase()}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
