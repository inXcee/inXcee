import { Component } from 'react'
import { reportError } from '../utils/errorReporter.js'

export default class ErrorBoundary extends Component {
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
      context: { componentStack: errorInfo?.componentStack?.slice(0, 500) },
    })
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
          fontFamily: 'var(--mono)', color: 'var(--fg)',
        }}>
          <h2 style={{ fontSize: '18px', letterSpacing: '2px' }}>Bir hata olustu</h2>
          <p style={{ fontSize: '13px', opacity: 0.7 }}>
            {this.state.error?.message || 'Beklenmeyen bir hata meydana geldi.'}
          </p>
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
        </div>
      )
    }
    return this.props.children
  }
}
