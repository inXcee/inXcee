// Regular kıyafet girişi (M/S blok) — state orkestratörde (NewItemModal), burası salt görsel
import { CLOTHING_ICONS, COLOR_PALETTE, PATTERN_LIST } from './constants.js'

export default function RegularSection({
  clothingTypes, clothing, totalCount,
  quickCloth, setQuickCloth, parsedCloth, addQuickClothing,
  addClothing, removeClothing, updateClothing,
  itemCount, setItemCount,
}) {
  return (
    <div>
      <label className="form-label">
        KIYAFETler
        {clothing.length > 0 && (
          <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700 }}>{totalCount} parça</span>
        )}
      </label>

      {/* ⚡ Hızlı metin girişi */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            className="form-input"
            value={quickCloth}
            onChange={e => setQuickCloth(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addQuickClothing() }}
            placeholder="⚡ Hızlı: 3 gömlek mavi · 2 pantolon siyah · çorap beyaz..."
            style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10 }}
          />
          <button
            onClick={addQuickClothing}
            disabled={!parsedCloth.type}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: parsedCloth.type ? 'pointer' : 'not-allowed',
              background: parsedCloth.type ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${parsedCloth.type ? 'var(--accent)' : 'var(--border)'}`,
              color: parsedCloth.type ? '#000' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >↵ Ekle</button>
        </div>
        {quickCloth.trim() && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
            {parsedCloth.qty > 1 && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.3)', color: 'var(--accent)', borderRadius: 4, padding: '1px 6px' }}>
                ×{parsedCloth.qty}
              </span>
            )}
            {parsedCloth.type ? (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa', borderRadius: 4, padding: '1px 6px' }}>
                {CLOTHING_ICONS[parsedCloth.type] || ''} {parsedCloth.type}
              </span>
            ) : (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', opacity: 0.7 }}>tip bulunamadı</span>
            )}
            {parsedCloth.color && (() => {
              const cp = COLOR_PALETTE.find(c => c.name === parsedCloth.color)
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--mono)', fontSize: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 4, padding: '1px 6px' }}>
                  {cp && <span style={{ width: 8, height: 8, borderRadius: '50%', background: cp.hex, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />}
                  {parsedCloth.color}
                </span>
              )
            })()}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {clothingTypes.map(type => {
          const active = clothing.some(c => c.type === type)
          return (
            <button key={type} onClick={() => addClothing(type)} style={{
              padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
              background: active ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
              border: `1px solid ${active ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: active ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 10, transition: 'all 0.15s',
            }}>
              {active && '✓ '}{CLOTHING_ICONS[type] || ''} {type}
            </button>
          )
        })}
      </div>
      {clothing.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {clothing.map((c, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 7,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', flex: '0 0 90px' }}>
                {CLOTHING_ICONS[c.type] || ''} {c.type}
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {COLOR_PALETTE.map(col => (
                    <button
                      key={col.name}
                      title={col.name}
                      onClick={() => updateClothing(idx, 'color', c.color === col.name ? '' : col.name)}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', border: `2px solid ${c.color === col.name ? 'var(--accent)' : 'transparent'}`,
                        background: col.hex, cursor: 'pointer', padding: 0, flexShrink: 0,
                        boxShadow: c.color === col.name ? '0 0 0 1px var(--accent)' : 'none',
                        transition: 'border 0.1s',
                      }}
                    />
                  ))}
                  <input
                    className="form-input"
                    value={COLOR_PALETTE.some(cp => cp.name === c.color) || PATTERN_LIST.some(p => p.name === c.color) ? '' : c.color}
                    onChange={e => updateClothing(idx, 'color', e.target.value)}
                    placeholder="Diğer..."
                    style={{ width: 60, padding: '3px 6px', fontSize: 9, flexShrink: 0 }}
                  />
                  {c.color && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>{c.color}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', flexShrink: 0 }}>DESEN:</span>
                  {PATTERN_LIST.map(pat => (
                    <button
                      key={pat.name}
                      title={pat.name}
                      onClick={() => updateClothing(idx, 'color', c.color === pat.name ? '' : pat.name)}
                      style={{
                        width: 24, height: 24, borderRadius: 4,
                        border: `2px solid ${c.color === pat.name ? 'var(--accent)' : 'transparent'}`,
                        background: pat.bg, cursor: 'pointer', padding: 0, flexShrink: 0,
                        boxShadow: c.color === pat.name ? '0 0 0 1px var(--accent)' : 'none',
                        transition: 'border 0.1s', outline: 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => updateClothing(idx, 'qty', c.qty - 1)}
                  style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', minWidth: 20, textAlign: 'center', lineHeight: 1 }}>{c.qty}</span>
                <button onClick={() => updateClothing(idx, 'qty', c.qty + 1)}
                  style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <button onClick={() => removeClothing(idx)}
                style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {clothing.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, border: '1px dashed var(--border)' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flex: 1 }}>
            Kıyafet seçilmedi — toplam adet:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setItemCount(c => Math.max(1, c - 1))}
              style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', minWidth: 24, textAlign: 'center', lineHeight: 1 }}>{itemCount}</span>
            <button onClick={() => setItemCount(c => Math.min(99, c + 1))}
              style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}
