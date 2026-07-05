import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import { COLOR_MAP, GARMENT_COLOR_HEX } from './hubShared.js'

// ── ExpandedSection ────────────────────────────────────────────
export default function ExpandedSection({ item, onLost, onFound }) {
  const [sigModal, setSigModal] = useState(null)
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['item-history', item.id],
    queryFn: () => laundryApi.getItemHistory(item.id),
    enabled: true,
  })

  const STATUS_LABELS = { dirty: 'Kirli sepete eklendi', washing: 'Makineye atandı', ready: 'Rafa kondu', delivered: 'Teslim edildi', lost: 'Kayıp işaretlendi' }
  const STATUS_COLORS = { dirty: 'var(--accent)', washing: 'var(--blue)', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)' }

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      {/* Kıyafet detayı — garments_json (yeni format) öncelikli, clothing_items fallback */}
      {(() => {
        if (item.garments_json) {
          try {
            const gs = JSON.parse(item.garments_json)
            if (!Array.isArray(gs) || gs.length === 0) return null
            return (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler ({gs.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {gs.map((g, i) => {
                    const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                        padding: '4px 8px', borderRadius: 6,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                      }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                          {g.emoji || '👔'} {g.type_name}
                        </span>
                        {g.count > 1 && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>×{g.count}</span>
                        )}
                        {colors.map(c => (
                          <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: GARMENT_COLOR_HEX[c.key] || '#888',
                              border: c.key === 'white' ? '1px solid rgba(255,255,255,0.3)' : 'none',
                              display: 'inline-block',
                            }} title={c.label} />
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{c.label}</span>
                          </span>
                        ))}
                        {g.pattern && g.pattern !== 'solid' && g.pattern_label && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>{g.pattern_label}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          } catch { return null }
        }
        if (item.clothing_items) {
          try {
            const cl = JSON.parse(item.clothing_items)
            return (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>KIYAFETler</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {cl.map((c, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 9, fontFamily: 'var(--mono)',
                      background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      {CLOTHING_ICONS[c.type] || ''} {c.qty}× {c.type}
                      {c.color && (
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: COLOR_MAP[c.color] || '#888',
                          border: '1px solid rgba(255,255,255,0.2)',
                          flexShrink: 0, display: 'inline-block',
                        }} title={c.color} />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )
          } catch { return null }
        }
        return null
      })()}

      {/* Timeline */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>TİMELİNE</div>
      {isLoading ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>yükleniyor...</div>
      ) : history.map((h, idx) => {
        const next = history[idx + 1]
        const dur = next
          ? Math.round((new Date(next.created_at) - new Date(h.created_at)) / 60000)
          : null
        return (
          <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: STATUS_COLORS[h.to_status] || 'var(--text3)',
              flexShrink: 0, marginTop: 3,
            }} />
            <div style={{ flex: 1 }}>
              <span style={{ color: 'var(--text2)', fontSize: 9 }}>{STATUS_LABELS[h.to_status] || h.to_status}</span>
              {h.actor_name && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {h.actor_name}</span>}
              {dur != null && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {dur < 60 ? `${dur}dk` : `${Math.round(dur/60)}s`} bekledi</span>}
              <div style={{ fontSize: 8, color: 'var(--text3)' }}>
                {new Date(h.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              {h.to_status === 'delivered' && h.delivered_to && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--teal)' }}>
                    ✓ {h.delivered_to}
                  </span>
                  {h.signature_data && (
                    <button
                      onClick={() => setSigModal(h.signature_data)}
                      style={{
                        display: 'block', marginTop: 4, padding: 0, border: '1px solid var(--border)',
                        borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', overflow: 'hidden',
                      }}
                    >
                      <img
                        loading="lazy"
                        src={h.signature_data}
                        alt="imza"
                        style={{ width: 120, height: 36, objectFit: 'contain', display: 'block', filter: 'invert(0.85)' }}
                      />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Alt butonlar */}
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        {item.status === 'lost' ? (
          <button onClick={onFound} style={{
            flex: 1, padding: '4px 6px', borderRadius: 5,
            background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
            color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer', fontWeight: 700,
          }}>Bulundu →</button>
        ) : (
          <button onClick={onLost} style={{
            flex: 1, padding: '4px 6px', borderRadius: 5,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer',
          }}>Kayıp</button>
        )}
      </div>

      {/* İmza modal */}
      {sigModal && (
        <div
          onClick={() => setSigModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, letterSpacing: 1 }}>
              TESLİM İMZASI
            </div>
            <img
              loading="lazy"
              src={sigModal}
              alt="imza"
              style={{ width: 400, height: 120, objectFit: 'contain', display: 'block', filter: 'invert(0.85)', borderRadius: 6 }}
            />
            <button
              onClick={() => setSigModal(null)}
              style={{
                marginTop: 10, width: '100%', padding: '5px 0',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer', borderRadius: 5,
              }}
            >
              kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
