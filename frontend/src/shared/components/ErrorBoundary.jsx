import { Component } from 'react'
import { useLocation } from 'react-router-dom'
import { reportError } from '../utils/errorReporter.js'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    reportError({
      message: error?.message || 'React render hatası',
      stack: error?.stack,
      context: {
        componentStack: errorInfo?.componentStack?.slice(0, 500),
        scope: this.props.scope || 'app',
        path: typeof window !== 'undefined' ? window.location?.pathname : null,
      },
    })
  }

  componentDidUpdate(prevProps) {
    // Route değiştiyse (resetKey prop'u değişti) hata state'ini sıfırla;
    // kullanıcı çökmüş sayfadan başka bir yere giderse temiz başlasın.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: '16px',
          fontFamily: 'var(--mono)', color: 'var(--fg)', padding: 24,
        }}>
          <h2 style={{ fontSize: '18px', letterSpacing: '2px' }}>Bir hata olustu</h2>
          <p style={{ fontSize: '13px', opacity: 0.7, textAlign: 'center', maxWidth: 480 }}>
            {this.state.error?.message || 'Beklenmeyen bir hata meydana geldi.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '8px 24px', background: 'var(--accent)', color: '#fff',
                border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)',
                fontSize: '12px', letterSpacing: '1px',
              }}
            >
              YENIDEN DENE
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 24px', background: 'transparent', color: 'var(--text)',
                border: '1px solid var(--border)', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: '12px', letterSpacing: '1px',
              }}
            >
              SAYFAYI YENILE
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Route'lar arasında otomatik reset için location-aware wrapper.
// Layout içindeki Outlet'i sarmak için kullanılır; sidebar/topbar etkilenmez.
export function RouteErrorBoundary({ children }) {
  const location = useLocation()
  return (
    <ErrorBoundary scope="route" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  )
}

export default ErrorBoundary
