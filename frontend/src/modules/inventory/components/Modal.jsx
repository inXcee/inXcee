export default function Modal({ children, onClose, title, sub, color = 'var(--accent),var(--blue)', wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div className="fade-up" style={{
        position: 'relative', width: wide ? '680px' : '480px', maxWidth: '95vw', maxHeight: '88vh',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'auto',
        boxShadow: '0 24px 48px rgba(0,0,0,.25)',
      }}>
        <div style={{ height: '3px', background: `linear-gradient(90deg,${color})`, borderRadius: '16px 16px 0 0' }} />
        <div style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px' }}>{title}</div>
              {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '3px', letterSpacing: '1px' }}>{sub}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', transition: 'all .15s' }}>✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
