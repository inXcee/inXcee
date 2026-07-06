// TransportPage sekmelerinin paylaştığı sunum primitive'leri ve helper'lar.
// Birden çok sekme (Daily/Routes/Points/People/Reports) ortak kullanır.
import { useToastStore } from '../../shared/store/toastStore.js'

export const todayStr = () => new Date().toISOString().slice(0, 10)
export const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
export const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export function KPI({ label, value, color, sub }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 28, color, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function Section({ title, right, danger, children }) {
  return (
    <div style={{
      marginBottom: 16, padding: '12px 16px', borderRadius: 12,
      background: 'var(--surface)',
      border: `1px solid ${danger ? 'rgba(231,76,60,.25)' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: danger ? 'var(--red)' : 'var(--text3)', letterSpacing: 2 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
export function BarList({ items }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.slice(0, 15).map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 40px', gap: 8, alignItems: 'center', fontSize: 11 }}>
          <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 600 }}>{it.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{it.sub}</div>
          </div>
          <div style={{ height: 14, background: 'var(--surface2)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--blue))' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>{it.value}</div>
        </div>
      ))}
      {items.length > 15 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', textAlign: 'center', marginTop: 6 }}>
          +{items.length - 15} daha
        </div>
      )}
    </div>
  )
}
export function Stat({ label, value, color }) {
  return (
    <div style={{ padding: '4px 8px', background: 'var(--surface)', borderRadius: 6 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
export function Empty({ msg }) {
  return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{msg}</div>
}

// ─── Shared shells ──────────────────────────────────────────────────────────
export function ModalShell({ children, onClose, title, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="fade-up" style={{
        width: wide ? 640 : 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 20, boxShadow: '0 24px 48px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
export function Label({ children }) {
  return <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, display: 'block', marginBottom: 4 }}>{children}</label>
}
export function ModalActions({ onClose, onSave, disabled, loading }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
      <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: 10 }}>İPTAL</button>
      <button className="btn btn-primary" onClick={onSave} disabled={disabled} style={{ borderRadius: 10 }}>{loading ? '...' : 'KAYDET'}</button>
    </div>
  )
}
export function EmptyState({ icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text3)' }}>
      <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{desc}</div>
    </div>
  )
}
