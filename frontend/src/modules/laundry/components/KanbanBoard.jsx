import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import PremiumGarmentList from './PremiumGarmentList.jsx'
import AssignModal from './AssignModal.jsx'
import ShelfModal from './ShelfModal.jsx'
import LostModal from './LostModal.jsx'

const COLOR_MAP = {
  'Beyaz': '#f0f0f0', 'Siyah': '#222', 'Gri': '#888',
  'Lacivert': '#1a2e5e', 'Mavi': '#2563eb', 'Açık Mavi': '#7ec8e3',
  'Kırmızı': '#dc2626', 'Yeşil': '#16a34a', 'Sarı': '#eab308',
  'Turuncu': '#f97316', 'Mor': '#7c3aed', 'Pembe': '#ec4899',
  'Bej': '#d4b896', 'Kahve': '#78350f',
}

const GARMENT_COLOR_HEX = {
  white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
  blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
  orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
}

// ── WA link helper ─────────────────────────────────────────────
function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? '90' + digits.slice(1) : digits
  return `https://wa.me/${normalized}`
}

// ── ExpandedSection ────────────────────────────────────────────
function ExpandedSection({ item, onLost, onFound }) {
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

// ── DraggableKanbanCard ────────────────────────────────────────
function DraggableKanbanCard({ item, ...props }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.3 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'opacity 0.1s',
      }}
      {...attributes}
      {...listeners}
    >
      <KanbanCard item={item} {...props} />
    </div>
  )
}

// ── KanbanCard ─────────────────────────────────────────────────
export function KanbanCard({ item, machines, onDeliver, onDamage, onPersonClick, onFound }) {
  const qc = useQueryClient()
  const [assignOpen,   setAssignOpen]   = useState(false)
  const [shelfOpen,    setShelfOpen]    = useState(false)
  const [lostOpen,     setLostOpen]     = useState(false)
  const [expanded,     setExpanded]     = useState(false)
  const [photoOpen,    setPhotoOpen]    = useState(false)
  const [garmentOpen,  setGarmentOpen]  = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (item.status !== 'washing' || !item.timer_end) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [item.status, item.timer_end])

  const isSlaWarn = item.hours_in_status > 24
  const isSlaRed  = item.hours_in_status > 48
  const isUrgent  = item.urgent === 1
  const phone     = item.phone_number
  const wa        = waLink(phone)

  const borderColor = isUrgent ? 'var(--red)'
    : item.status === 'washing' ? 'var(--blue)'
    : item.status === 'ready'   ? 'var(--green)'
    : 'var(--accent)'

  return (
    <div style={{
      background: 'var(--surface2)',
      border: `1px solid ${isUrgent ? 'rgba(231,76,60,0.3)' : isSlaRed ? 'rgba(231,76,60,0.15)' : 'var(--border)'}`,
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 8, padding: '10px 12px',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Row 1: oda + badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            onPointerDown={item.occupant_name ? e => e.stopPropagation() : undefined}
            onClick={() => onPersonClick && item.occupant_name && onPersonClick(item.occupant_name)}
            style={{
              fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)', lineHeight: 1,
              cursor: item.occupant_name ? 'pointer' : 'default',
              textDecoration: item.occupant_name ? 'underline dotted' : 'none',
              textDecorationColor: 'var(--text3)',
            }}
          >
            {item.block} · {item.room_no}
          </span>
          {item.room_active_count > 1 && (
            <span className="badge badge-amber" style={{ fontSize: 7 }}>×{item.room_active_count}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isUrgent && <span className="badge badge-red" style={{ fontSize: 7 }}>ACİL</span>}
          {isSlaRed && <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--red)', fontWeight: 700 }}>{item.hours_in_status}s</span>}
          {isSlaWarn && !isSlaRed && <span style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--accent)', fontWeight: 700 }}>{item.hours_in_status}s</span>}
          {item.damage_count > 0 && <span className="badge badge-amber" style={{ fontSize: 7 }}>⚠{item.damage_count}</span>}
        </div>
      </div>

      {/* Row 1b: bag_no */}
      {item.bag_no && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#38bdf8', letterSpacing: 1, marginBottom: 4 }}>
          {item.bag_no}
        </div>
      )}

      {/* Row 2: meta */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{item.item_count} parça</span>
        {(item.garments_json || item.clothing_items) && (() => {
          try {
            if (item.garments_json) {
              const gs = JSON.parse(item.garments_json)
              if (!Array.isArray(gs) || gs.length === 0) return null
              const preview = gs.slice(0, 2).map(g => `${g.emoji || ''}${g.count > 1 ? `${g.count}× ` : ''}${g.type_name}`).join(' · ')
              return <span style={{ color: 'var(--text2)' }}>· {preview}{gs.length > 2 ? ` +${gs.length - 2}` : ''}</span>
            }
            const cl = JSON.parse(item.clothing_items)
            const preview = cl.slice(0, 2).map(c => `${CLOTHING_ICONS[c.type] || ''}${c.qty} ${c.type}`).join(' · ')
            return <span style={{ color: 'var(--text2)' }}>· {preview}{cl.length > 2 ? ` +${cl.length - 2}` : ''}</span>
          } catch { return null }
        })()}
        {item.occupant_name && <span style={{ color: 'var(--text2)' }}>· {item.occupant_name}</span>}
        {item.machine_name && <span>· ⚙ {item.machine_name}</span>}
        {item.shelf_location && <span>· ▣ {item.shelf_location}</span>}
        {item.status === 'washing' && item.timer_end && (() => {
          const minsLeft = Math.max(0, Math.round((new Date(item.timer_end) - now) / 60000))
          const isLow = minsLeft < 5
          return (
            <span style={{
              color: isLow ? 'var(--red)' : 'var(--blue)',
              fontWeight: isLow ? 700 : undefined,
            }}>
              · ⏱ {String(Math.floor(minsLeft / 60)).padStart(2, '0')}:{String(minsLeft % 60).padStart(2, '0')}
            </span>
          )
        })()}
        {item.notes && <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>· {item.notes}</span>}
      </div>

      {/* Photo thumbnail */}
      {item.photo_url && (
        <>
          <div
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setPhotoOpen(true)}
            style={{
              marginBottom: 8, cursor: 'pointer', borderRadius: 6, overflow: 'hidden',
              border: '1px solid var(--border)', height: 56, background: 'var(--surface2)',
            }}
          >
            <img loading="lazy" src={item.photo_url} alt="fotoğraf"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          {photoOpen && (
            <div onPointerDown={e => e.stopPropagation()} onClick={() => setPhotoOpen(false)} style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img loading="lazy" src={item.photo_url} alt="fotoğraf"
                style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
            </div>
          )}
        </>
      )}

      {/* Phone */}
      {phone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', flex: 1 }}>📱 {phone}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" onPointerDown={e => e.stopPropagation()} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
              color: '#25d366', fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
              textDecoration: 'none', letterSpacing: 0.5,
            }}>
              WA →
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        {item.status === 'pending_collection' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={async () => {
            try {
              await laundryApi.collectItem(item.id)
              qc.invalidateQueries({ queryKey: ['laundry-items'] })
            } catch {}
          }} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(3,105,161,0.12)', border: '1px solid rgba(3,105,161,0.35)',
            color: '#38bdf8', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ✓ Toplandı
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && item.status === 'dirty' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setAssignOpen(true)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
            color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ⚙ Makineye At…
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && item.status === 'washing' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setShelfOpen(true)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(59,140,240,0.08)', border: '1px solid rgba(59,140,240,0.25)',
            color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ▣ Rafa Koy →
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && item.status === 'ironing' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setShelfOpen(true)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
            color: '#6366f1', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ▣ Rafa Koy →
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && item.status === 'ironing' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onDeliver(item)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
            color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ✓ Teslim Et →
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && item.status === 'ready' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onDeliver(item)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 6,
            background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
            color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9,
            cursor: 'pointer', fontWeight: 700,
          }}>
            ✓ Teslim Et →
          </button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && onDamage && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onDamage(item)} style={{
            padding: '5px 8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
          }}>⚠</button>
        )}
        {item.status !== 'delivered' && item.status !== 'lost' && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setGarmentOpen(o => !o)} style={{
            padding: '5px 8px', borderRadius: 6,
            background: garmentOpen ? 'rgba(240,165,0,0.1)' : 'transparent',
            border: `1px solid ${garmentOpen ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
            color: garmentOpen ? 'var(--accent)' : 'var(--text3)',
            fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', fontWeight: garmentOpen ? 700 : undefined,
          }}>★</button>
        )}
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setExpanded(s => !s)} style={{
          padding: '5px 8px', borderRadius: 6,
          background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
        }}>
          {expanded ? '▲' : '▾'}
        </button>
      </div>

      {/* Garment panel */}
      {garmentOpen && (
        <div onPointerDown={e => e.stopPropagation()}>
          <PremiumGarmentList item={item} />
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <ExpandedSection
          item={item}
          onLost={() => setLostOpen(true)}
          onFound={() => onFound && onFound(item)}
        />
      )}

      {/* Modals */}
      {assignOpen && <AssignModal item={item} machines={machines} onClose={() => setAssignOpen(false)} />}
      {shelfOpen  && <ShelfModal  item={item} onClose={() => setShelfOpen(false)} />}
      {lostOpen   && <LostModal   item={item} onClose={() => setLostOpen(false)} />}
    </div>
  )
}

// ── KanbanCol ──────────────────────────────────────────────────
export function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock, emptyLabel = 'boş' }) {
  const { setNodeRef } = useDroppable({ id: colStatus })

  function renderItems() {
    // batchMode + ready kolonu → blok bazlı grupla + "Tümünü Seç" butonları
    if (batchMode && colStatus === 'ready') {
      const blocks = {}
      for (const item of items) {
        const key = item.block || 'Bilinmiyor'
        if (!blocks[key]) blocks[key] = []
        blocks[key].push(item)
      }
      return Object.entries(blocks).sort(([a], [b]) => a.localeCompare(b)).map(([block, blockItems]) => {
        const allSelected = blockItems.length > 0 && blockItems.every(item => selectedIds.has(item.id))
        return (
          <div key={block} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4,
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                color: 'var(--green)', letterSpacing: 1.5, flex: 1,
              }}>
                {block} <span style={{ color: 'var(--text4)' }}>({blockItems.length})</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectBlock(blockItems)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 8, fontFamily: 'var(--mono)',
                  background: allSelected ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                  border: `1px solid ${allSelected ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                  color: allSelected ? 'var(--green)' : 'var(--text3)', cursor: 'pointer',
                }}
              >
                {allSelected ? '✓ Seçildi' : 'Tümünü Seç'}
              </button>
            </div>
            {blockItems.map(item => (
              <div
                key={item.id}
                style={{
                  marginBottom: 8, position: 'relative',
                  outline: selectedIds.has(item.id) ? '2px solid var(--green)' : 'none',
                  borderRadius: 8,
                }}
              >
                <DraggableKanbanCard item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
                  onPersonClick={onPersonClick} onFound={onFound} />
                <div
                  onClick={() => onSelect(item.id)}
                  style={{
                    position: 'absolute', inset: 0, cursor: 'pointer', borderRadius: 8,
                    background: selectedIds.has(item.id) ? 'rgba(16,185,129,0.05)' : 'transparent',
                  }}
                />
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onSelect(item.id)}
                  style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>
        )
      })
    }

    if (!groupByRoom) {
      return items.map(item => (
        <DraggableKanbanCard key={item.id} item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
          onPersonClick={onPersonClick} onFound={onFound} />
      ))
    }
    const groups = {}
    for (const item of items) {
      const key = item.room_no ? `${item.block}-${item.room_no}` : 'Bilinmiyor'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return Object.entries(groups).map(([roomKey, roomItems]) => (
      <div key={roomKey} style={{ marginBottom: 4 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
          color: 'var(--text3)', letterSpacing: 1.5,
          padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4,
        }}>
          {roomKey} <span style={{ color: 'var(--text4)' }}>({roomItems.length})</span>
        </div>
        {roomItems.map(item => (
          <div key={item.id} style={{ marginBottom: 8 }}>
            <DraggableKanbanCard item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
              onPersonClick={onPersonClick} onFound={onFound} />
          </div>
        ))}
      </div>
    ))
  }

  return (
    <div style={{
      flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: `1px solid ${isOver ? color : 'var(--border)'}`,
      borderTop: `2px solid ${color}`, borderRadius: 10, overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <div style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(135deg, ${color}0d, transparent)`,
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 3, color }}>{title}</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 1, color, lineHeight: 1 }}>
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 680,
          background: isOver ? `${color}08` : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            {emptyLabel}
          </div>
        ) : renderItems()}
      </div>
    </div>
  )
}
