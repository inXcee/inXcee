// Edit modunda bir pin'i özelleştirme paneli: renk (preset/özel), boyut, etiket,
// gizle. Değişiklikler onChange(updates) ile orkestratöre yazılır (KAYDET'te yayınlanır).
import { PRESET_COLORS, miniLink } from './shared.jsx'

export default function PinInspector({ block, pin, onChange, onReset, onClose }) {
  if (!pin) return null
  return (
    <div style={{
      position: 'fixed', top: 100, right: 24, zIndex: 100,
      background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10,
      padding: 16, width: 280, color: 'var(--text)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', letterSpacing: 2 }}>
            {block}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            PIN OZELLESTIR
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      {/* Renk */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            RENK {pin.color ? '(OZEL)' : '(MOD)'}
          </span>
          {pin.color && (
            <button onClick={() => onChange({ color: undefined })} style={miniLink}>
              VARSAYILANA DON
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => onChange({ color: c })} style={{
              width: '100%', height: 28, background: c,
              border: pin.color === c ? '2px solid #fff' : '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
              boxShadow: pin.color === c ? '0 0 0 1px var(--accent)' : 'none',
            }} title={c} />
          ))}
        </div>
        <input type="color" value={pin.color || '#888888'}
          onChange={e => onChange({ color: e.target.value })}
          style={{ width: '100%', height: 28, marginTop: 6, border: '1px solid var(--border)',
            borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
      </div>

      {/* Boyut */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            BOYUT {pin.size ? `(${Math.round(pin.size * 100)}%)` : '(STD)'}
          </span>
          {pin.size && (
            <button onClick={() => onChange({ size: undefined })} style={miniLink}>SIFIRLA</button>
          )}
        </div>
        <input type="range" min="0.5" max="2.0" step="0.05" value={pin.size || 1}
          onChange={e => onChange({ size: parseFloat(e.target.value) })}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
          <span>%50</span><span>%100</span><span>%200</span>
        </div>
      </div>

      {/* Etiket */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            ETIKET {pin.label ? '(OZEL)' : `(${block})`}
          </span>
          {pin.label && (
            <button onClick={() => onChange({ label: undefined })} style={miniLink}>SIFIRLA</button>
          )}
        </div>
        <input type="text" placeholder={block} value={pin.label || ''}
          onChange={e => onChange({ label: e.target.value })}
          maxLength={20}
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '6px 10px', color: 'var(--text)',
            fontFamily: 'var(--mono)', fontSize: 12, boxSizing: 'border-box',
          }} />
      </div>

      {/* Gizle toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!pin.hidden}
          onChange={e => onChange({ hidden: e.target.checked || undefined })} />
        Bu pin'i gizle (sadece edit modunda gorunur)
      </label>

      <button onClick={onReset} style={{
        width: '100%', background: 'var(--surface2)', color: 'var(--red)',
        border: '1px solid var(--border)', borderRadius: 6,
        padding: '8px 12px', cursor: 'pointer',
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
      }}>
        ⟲ TUM OZELLESTIRMELERI KALDIR
      </button>
      <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--text3)', textAlign: 'center', letterSpacing: 1 }}>
        Degisiklikler KAYDET butonuna basinca yayinlanir
      </div>
    </div>
  )
}
