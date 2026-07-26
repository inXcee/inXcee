// Klavye kısayolları yardım modalı (? tuşu ile açılır).
import { kbd } from './shared.jsx'

export default function HelpModal({ onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 24, minWidth: 360, maxWidth: 480, color: 'var(--text)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>KLAVYE KISAYOLLARI</h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px',
          fontFamily: 'var(--mono)', fontSize: 12 }}>
          <kbd style={kbd}>+ / −</kbd><span>Yakinlas / uzaklas</span>
          <kbd style={kbd}>0</kbd><span>Zoom sifirla</span>
          <kbd style={kbd}>F</kbd><span>Tum pin'leri sigdir</span>
          <kbd style={kbd}>← ↑ ↓ →</kbd><span>Pan (kaydir)</span>
          <kbd style={kbd}>1 - 6</kbd><span>Gorunum modlari</span>
          <kbd style={kbd}>/</kbd><span>Aramaya odaklan</span>
          <kbd style={kbd}>Esc</kbd><span>Kapat / iptal</span>
          <kbd style={kbd}>?</kbd><span>Bu yardim ekrani</span>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, lineHeight: 1.7 }}>
          MOUSE: Tekerlek = zoom • Surukle = pan • Pin tikla = detay<br />
          Ctrl/Shift + tikla = coklu secim (karsilastirma)
        </div>
      </div>
    </div>
  )
}
