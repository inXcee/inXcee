// Premium parça girişi (Y blok) — state orkestratörde (NewItemModal), burası salt görsel
import ColorPatternPicker from '../ColorPatternPicker.jsx'
import { CLOTHING_ICONS, COLOR_PALETTE, SIZES } from './constants.js'

export default function PremiumSection({
  clothingTypes, premiumRows, removePremiumRow,
  quickPremium, setQuickPremium, parsedPremiumList, addQuickPremiumRow,
  gType, setGType, gForm, setGForm, gQty, setGQty, canAddPremium, addPremiumRow,
}) {
  const totalQuickRows = parsedPremiumList.reduce((s, p) => s + p.qty, 0)
  return (
    <div style={{
      borderRadius: 10,
      border: '1px solid rgba(240,165,0,0.2)',
      background: 'rgba(240,165,0,0.03)',
      overflow: 'hidden',
    }}>
      {/* Başlık */}
      <div style={{
        padding: '8px 14px',
        background: 'rgba(240,165,0,0.08)',
        borderBottom: '1px solid rgba(240,165,0,0.15)',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        ★ PREMIUM PARÇALAR
        {premiumRows.length > 0 && (
          <span style={{
            background: 'var(--accent)', color: '#000',
            borderRadius: 10, padding: '1px 8px', fontSize: 9, fontWeight: 700,
          }}>{premiumRows.length}</span>
        )}
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Eklenen parçalar listesi */}
        {premiumRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            {premiumRows.map((g, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', borderRadius: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', minWidth: 18 }}>#{i + 1}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', flex: 1 }}>
                  {CLOTHING_ICONS[g.garment_type] || ''} {g.garment_type}
                </span>
                {g.color && g.color.split(', ').filter(Boolean).map(c => (
                  <span key={c} style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: COLOR_PALETTE.find(cp => cp.name === c)?.hex || '#888',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }} title={c} />
                ))}
                {g.color && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.color}</span>}
                {g.pattern && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: '#818cf8',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 3, padding: '1px 5px',
                  }}>{g.pattern}</span>
                )}
                {g.brand && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.brand}</span>}
                {g.size && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 3, padding: '1px 5px',
                  }}>{g.size}</span>
                )}
                <button onClick={() => removePremiumRow(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 12, padding: '0 2px', flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* ⚡ Premium hızlı giriş */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: 1, marginBottom: 5 }}>⚡ HIZLI GİRİŞ</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="form-input"
              value={quickPremium}
              onChange={e => setQuickPremium(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addQuickPremiumRow() }}
              placeholder="3 gömlek mavi çizgili L Lacoste, 2 pantolon  →  tek Enter"
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10 }}
              autoFocus={false}
            />
            <button
              onClick={addQuickPremiumRow}
              disabled={parsedPremiumList.length === 0}
              style={{
                padding: '6px 14px', borderRadius: 6,
                cursor: parsedPremiumList.length > 0 ? 'pointer' : 'not-allowed',
                background: parsedPremiumList.length > 0 ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${parsedPremiumList.length > 0 ? 'var(--accent)' : 'var(--border)'}`,
                color: parsedPremiumList.length > 0 ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >↵ Ekle{totalQuickRows > 1 ? ` (×${totalQuickRows})` : ''}</button>
          </div>
          {quickPremium.trim() && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
              {parsedPremiumList.length === 0 && (
                <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--red)', opacity:0.7 }}>tip bulunamadı</span>
              )}
              {parsedPremiumList.map((p, i) => {
                const cp = COLOR_PALETTE.find(c => c.name === p.color)
                return (
                  <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:3, fontFamily:'var(--mono)', fontSize:9, background:'rgba(37,99,235,0.12)', border:'1px solid rgba(37,99,235,0.3)', color:'#60a5fa', borderRadius:4, padding:'1px 6px' }}>
                    {p.qty > 1 ? `${p.qty}× ` : ''}{CLOTHING_ICONS[p.type]||''} {p.type}
                    {p.color && <>{cp && <span style={{ width:8, height:8, borderRadius:'50%', background:cp.hex, border:'1px solid rgba(255,255,255,0.2)', flexShrink:0 }}/>}<span style={{ color:'var(--text2)' }}>{p.color}</span></>}
                    {p.pattern && <span style={{ color:'#818cf8' }}>{p.pattern}</span>}
                    {p.size && <span style={{ color:'var(--text3)' }}>{p.size}</span>}
                    {p.brand && <span style={{ color:'var(--text3)' }}>🏷 {p.brand}</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Tip seçimi */}
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 5 }}>TİP SEÇ</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {clothingTypes.map(type => (
              <button
                key={type}
                onClick={() => {
                  setGType(t => t === type ? '' : type)
                  setGForm(f => ({ ...f, colors: [], pattern: '' }))
                }}
                style={{
                  padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
                  background: gType === type ? 'rgba(240,165,0,0.15)' : 'var(--surface)',
                  border: `1px solid ${gType === type ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                  color: gType === type ? 'var(--accent)' : 'var(--text2)',
                  fontFamily: 'var(--mono)', fontSize: 9, transition: 'all 0.12s',
                }}
              >
                {gType === type && '★ '}{CLOTHING_ICONS[type] || ''} {type}
              </button>
            ))}
          </div>
        </div>

        {/* Detay formu — sadece tip seçiliyse */}
        {gType && (
          <div style={{
            padding: '10px 12px', borderRadius: 7,
            background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.12)',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
              {CLOTHING_ICONS[gType] || ''} {gType}
              <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 9, marginLeft: 6 }}>#{premiumRows.length + 1}</span>
            </div>

            {/* Renk & Desen */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
                RENK & DESEN
              </div>
              <ColorPatternPicker
                colors={gForm.colors}
                pattern={gForm.pattern}
                onChange={({ colors, pattern }) => setGForm(f => ({ ...f, colors, pattern }))}
              />
            </div>

            {/* Marka / Model / Beden */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6, marginBottom: 6 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>MARKA</div>
                <input className="form-input" value={gForm.brand}
                  onChange={e => setGForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="Opsiyonel" style={{ fontSize: 10 }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>MODEL</div>
                <input className="form-input" value={gForm.model}
                  onChange={e => setGForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="Opsiyonel" style={{ fontSize: 10 }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>BEDEN</div>
                <select value={gForm.size} onChange={e => setGForm(f => ({ ...f, size: e.target.value }))}
                  style={{
                    width: '100%', fontFamily: 'var(--mono)', fontSize: 10,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '5px 4px', color: 'var(--text)',
                  }}>
                  <option value="">-</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Not + Adet + Ekle */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 3 }}>NOT</div>
                <input className="form-input" value={gForm.condition_notes}
                  onChange={e => setGForm(f => ({ ...f, condition_notes: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && canAddPremium) addPremiumRow() }}
                  placeholder="Opsiyonel" style={{ fontSize: 10 }} />
              </div>
              {/* Adet stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <button onClick={() => setGQty(q => Math.max(1, q - 1))}
                  style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontFamily: 'var(--display)', fontSize: 15, color: 'var(--accent)', minWidth: 20, textAlign: 'center' }}>{gQty}</span>
                <button onClick={() => setGQty(q => Math.min(99, q + 1))}
                  style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <button
                onClick={addPremiumRow}
                disabled={!canAddPremium}
                style={{
                  padding: '7px 14px', borderRadius: 6, cursor: canAddPremium ? 'pointer' : 'not-allowed',
                  background: canAddPremium ? 'var(--accent)' : 'var(--surface)',
                  border: `1px solid ${canAddPremium ? 'var(--accent)' : 'var(--border)'}`,
                  color: canAddPremium ? '#000' : 'var(--text3)',
                  fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                + Ekle{gQty > 1 ? ` (×${gQty})` : ''}
              </button>
            </div>
          </div>
        )}

        {premiumRows.length === 0 && !gType && !quickPremium && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
            ⚡ Hızlı giriş veya tip seç → detay gir → Ekle
          </div>
        )}
      </div>
    </div>
  )
}
