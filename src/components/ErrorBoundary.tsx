import { Component, ErrorInfo, ReactNode } from 'react';
import { STORAGE_KEYS } from '../config/constants';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in portal application:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      // Clear authenticated session tokens to allow a clean sign-in
      const authKeys = [STORAGE_KEYS.AUTH_USER, STORAGE_KEYS.MFA_TIMESTAMP];
      for (const key of authKeys) {
        localStorage.removeItem(key);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('auth-token'))) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore storage access errors
    }
    window.location.href = '/login';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAF7EE',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '32px',
            border: '1px solid #EBE5D5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px'
              }}>
                ⚠️
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#152E5A', margin: 0 }}>
                  Portal Recovery Console
                </h1>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '2px 0 0' }}>
                  Manipal University Jaipur • IPR & Patent Cell
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              fontSize: '0.8125rem',
              color: '#334155',
              fontFamily: 'JetBrains Mono, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '140px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0'
            }}>
              {this.state.error?.message || 'An unexpected runtime exception was caught.'}
            </div>

            <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '24px', lineHeight: 1.5 }}>
              Ensure your connection to the live Supabase database is active, or sign out and return to the login screen.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#204E96',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#FAF7EE',
                  color: '#152E5A',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                Sign Out & Return to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
