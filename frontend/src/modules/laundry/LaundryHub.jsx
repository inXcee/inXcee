import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import LaundryReport from './LaundryReport.jsx'
import LaundrySettings from './LaundrySettings.jsx'
import { useLaundrySSE } from '../../shared/hooks/useLaundrySSE.js'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'

import MachineStrip       from './components/MachineStrip.jsx'
import SlaAlert           from './components/SlaAlert.jsx'
import ItemCard           from './components/ItemCard.jsx'
import NewItemModal, { CLOTHING_ICONS } from './components/NewItemModal.jsx'
import DeliveryModal      from './components/DeliveryModal.jsx'
import DamageModal        from './components/DamageModal.jsx'
import AssignModal        from './components/AssignModal.jsx'
import ShelfModal         from './components/ShelfModal.jsx'
import LostModal          from './components/LostModal.jsx'
import MachineManagerPanel from './components/MachineManagerPanel.jsx'
import PersonPanel         from './components/PersonPanel.jsx'
import FoundModal          from './components/FoundModal.jsx'
import BatchAssignModal         from './components/BatchAssignModal.jsx'
import ItemVerificationModal    from './components/ItemVerificationModal.jsx'
import ArchiveTable             from './components/ArchiveTable.jsx'
import ArchiveDetailPanel       from './components/ArchiveDetailPanel.jsx'
import LaundryChat              from './components/LaundryChat.jsx'
import PremiumSearchPanel       from './components/PremiumSearchPanel.jsx'
import GarmentScanModal         from './components/GarmentScanModal.jsx'
import PremiumGarmentList       from './components/PremiumGarmentList.jsx'
import AllRecordsTab            from './components/AllRecordsTab.jsx'

const COLOR_MAP = {
  'Beyaz': '#f0f0f0', 'Siyah': '#222', 'Gri': '#888',
  'Lacivert': '#1a2e5e', 'Mavi': '#2563eb', 'Açık Mavi': '#7ec8e3',
  'Kırmızı': '#dc2626', 'Yeşil': '#16a34a', 'Sarı': '#eab308',
  'Turuncu': '#f97316', 'Mor': '#7c3aed', 'Pembe': '#ec4899',
  'Bej': '#d4b896', 'Kahve': '#78350f',
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
      {/* Kıyafet detayı */}
      {item.clothing_items && (() => {
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
function KanbanCard({ item, machines, onDeliver, onDamage, onPersonClick, onFound }) {
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

      {/* Row 2: meta */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{item.item_count} parça</span>
        {item.clothing_items && (() => {
          try {
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
            <img src={item.photo_url} alt="fotoğraf"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          {photoOpen && (
            <div onPointerDown={e => e.stopPropagation()} onClick={() => setPhotoOpen(false)} style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src={item.photo_url} alt="fotoğraf"
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

// ── DeliveredTodaySection ──────────────────────────────────────
function DeliveredTodaySection() {
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const { data: items = [] } = useQuery({
    queryKey: ['laundry-delivered-today'],
    queryFn: () => laundryApi.getItems({ status: 'delivered' }),
    refetchInterval: 30000,
    select: (data) => data.filter(i => {
      const d = i.updated_at || i.created_at || ''
      return d.slice(0, 10) === today
    }),
  })

  return (
    <div style={{ marginTop: 16 }}>
      <div
        onClick={() => setOpen(s => !s)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '8px 0', borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1,
          userSelect: 'none',
        }}
      >
        <span>BUGÜN TESLİM</span>
        <span style={{
          background: 'rgba(39,201,106,0.12)', color: 'var(--green)',
          border: '1px solid rgba(39,201,106,0.25)',
          borderRadius: 10, padding: '1px 8px', fontSize: 9, fontWeight: 700,
        }}>{items.length}</span>
        <span style={{ marginLeft: 'auto' }}>{open ? '▲' : '▾'}</span>
      </div>
      {open && items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: '2px solid var(--green)', borderRadius: 8,
              padding: '8px 12px', minWidth: 180,
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2 }}>
                {item.block} · {item.room_no}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 3 }}>
                {item.item_count} parça
                {item.updated_at && ` · ${new Date(item.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && items.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', padding: '8px 0' }}>
          Henüz bugün teslim yok
        </div>
      )}
    </div>
  )
}

// ── KanbanCol ──────────────────────────────────────────────────
function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock }) {
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
            boş
          </div>
        ) : renderItems()}
      </div>
    </div>
  )
}

// ── Filter config ──────────────────────────────────────────────
const FILTERS = [
  { key: 'all',     label: 'Tümü',    dot: null },
  { key: 'dirty',   label: 'Sepet',   dot: 'var(--accent)' },
  { key: 'washing', label: 'Yıkama',  dot: 'var(--blue)' },
  { key: 'ready',   label: 'Hazır',   dot: 'var(--green)' },
  { key: 'urgent',  label: 'Acil',    dot: 'var(--red)' },
  { key: 'sla',     label: 'SLA',     dot: 'var(--red)' },
  { key: 'lost',    label: 'Kayıp',   dot: 'var(--text3)' },
]

// ── QuickNotes (Inline Panel — KPI altı) ─────────────────────────────────
function QuickNotes() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const timerRef = useRef(null)
  const flashRef = useRef(null)

  const { data: settings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (settings.shared_notes !== undefined) setNotes(settings.shared_notes)
  }, [settings.shared_notes])

  const updateSetting = useMutation({
    mutationFn: ({ key, value }) => laundryApi.updateLaundrySetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-settings'] })
      setSavedFlash(true)
      if (flashRef.current) clearTimeout(flashRef.current)
      flashRef.current = setTimeout(() => setSavedFlash(false), 1500)
    },
  })

  const handleChange = (val) => {
    setNotes(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      updateSetting.mutate({ key: 'shared_notes', value: val })
    }, 500)
  }

  const lineCount = notes.split('\n').filter(l => l.trim()).length

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          height: 40, padding: '0 14px',
          background: 'linear-gradient(90deg,rgba(245,230,66,0.10),rgba(240,192,48,0.06))',
          border: '1px solid rgba(245,230,66,0.22)',
          borderLeft: '3px solid #c8a020',
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer', transition: 'border-radius 0.15s',
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: '#c8a020', letterSpacing: 2 }}>
          📋 NOTLAR
        </span>
        {lineCount > 0 && (
          <span style={{
            background: 'rgba(200,160,32,0.18)', color: '#c8a020',
            fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 7px',
            borderRadius: 4, letterSpacing: 1,
          }}>● {lineCount} satır</span>
        )}
        <span style={{
          marginLeft: 'auto', color: 'var(--text3)', fontSize: 10,
          transition: 'transform 0.2s', display: 'inline-block',
          transform: open ? 'rotate(180deg)' : '',
        }}>▼</span>
      </button>
      <div style={{
        background: 'linear-gradient(135deg,rgba(245,230,66,0.07),rgba(240,192,48,0.04))',
        border: open ? '1px solid rgba(245,230,66,0.18)' : 'none',
        borderTop: 'none', borderLeft: open ? '3px solid #c8a020' : 'none',
        borderRadius: '0 0 8px 8px', padding: open ? '8px 14px 10px' : '0 14px',
        maxHeight: open ? 200 : 0, overflow: 'hidden',
        transition: 'max-height 0.22s ease, padding 0.15s ease',
      }}>
        <textarea
          value={notes}
          onChange={e => handleChange(e.target.value)}
          placeholder="Kayıplar, özel talepler, acil notlar..."
          style={{
            width: '100%', height: 130, padding: 0,
            background: 'transparent', border: 'none', resize: 'none',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
            lineHeight: 1.7, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {notes.trim() ? (
            <button onClick={() => handleChange('')} style={{
              background: 'rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)',
              padding: '2px 8px', borderRadius: 4,
            }}>Temizle</button>
          ) : <span />}
          {savedFlash && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--green)' }}>✓ Kaydedildi</span>
          )}
        </div>
      </div>
    </div>
  )
}


// ── QuickAdd ───────────────────────────────────────────────────
function QuickAdd({ onClose }) {
  const qc = useQueryClient()
  const [roomNo, setRoomNo]             = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [name, setName]                 = useState('')
  const [selected, setSelected]         = useState([])
  const [quickText, setQuickText]       = useState('')
  const [itemCount, setItemCount]       = useState(1)
  const QUICK_TYPES = ['Pantolon','Gömlek','T-Shirt','Çorap','Boxer','Havlu Tkm','Kazak','Şort']

  const { data: rooms = [] } = useQuery({
    queryKey: ['laundry-rooms'],
    queryFn: laundryApi.getRooms,
    staleTime: 60_000,
  })

  const matchedRooms = useMemo(
    () => roomNo.trim() ? rooms.filter(r => r.room_no === roomNo.trim()) : [],
    [rooms, roomNo]
  )

  useEffect(() => {
    if (matchedRooms.length === 1) setSelectedRoom(matchedRooms[0])
    else setSelectedRoom(null)
  }, [matchedRooms])

  const toggle = (type) => setSelected(prev =>
    prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
  )

  const parseQuickInput = (text) => {
    const lower = text.toLowerCase()
    const numMatch = lower.match(/\b(\d+)\b/)
    const count = numMatch ? Math.min(99, Math.max(1, +numMatch[1])) : null
    const types = QUICK_TYPES.filter(t => lower.includes(t.toLowerCase()))
    return { types, count }
  }

  const handleQuickText = (val) => {
    setQuickText(val)
    const { types, count } = parseQuickInput(val)
    if (types.length > 0) setSelected(types)
    if (count !== null) setItemCount(count)
  }

  const canSubmit = !!selectedRoom && name.trim().length > 0

  const resetForm = () => {
    setName(''); setSelected([]); setQuickText(''); setItemCount(1)
  }

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      room_id: selectedRoom.id,
      intake_name: name.trim(),
      item_count: itemCount,
      clothing_items: selected.length > 0
        ? selected.map(t => ({ type: t, color: '', qty: 1 }))
        : undefined,
      urgent: 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); resetForm() },
  })

  const roomStatus = roomNo.trim()
    ? matchedRooms.length === 0
      ? { ok: false, text: '✗ Bulunamadı', color: 'var(--red)' }
      : selectedRoom
        ? { ok: true, text: `✓ ${selectedRoom.block}·${selectedRoom.room_no}`, color: 'var(--green)' }
        : { ok: false, text: `${matchedRooms.length} blok — seç`, color: 'var(--accent)' }
    : null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: '2px solid var(--accent)', borderRadius: 10,
      padding: '14px 16px', marginBottom: 14,
    }}>
      {/* Oda no + blok seçimi + isim */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <input
            className="form-input"
            value={roomNo}
            onChange={e => { setRoomNo(e.target.value); setSelectedRoom(null) }}
            placeholder="Oda No *"
            style={{ width: 80 }}
            autoFocus
          />
          {roomStatus && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: roomStatus.color }}>
              {roomStatus.text}
            </span>
          )}
        </div>

        {/* Çoklu blok eşleşmesi → seçim */}
        {matchedRooms.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignSelf: 'center' }}>
            {matchedRooms.map(r => (
              <button key={r.id} onClick={() => setSelectedRoom(r)} style={{
                padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                background: selectedRoom?.id === r.id ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
                border: `1px solid ${selectedRoom?.id === r.id ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                color: selectedRoom?.id === r.id ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'var(--mono)', fontSize: 10,
              }}>
                {r.block}
              </button>
            ))}
          </div>
        )}

        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ad Soyad (zorunlu)..."
          style={{ flex: '1 1 160px', minWidth: 140 }}
          onKeyDown={e => e.key === 'Enter' && canSubmit && create.mutate()}
        />
      </div>

      {/* ⚡ Hızlı metin */}
      <div style={{ marginBottom: 8 }}>
        <input
          className="form-input"
          value={quickText}
          onChange={e => handleQuickText(e.target.value)}
          placeholder="⚡ Hızlı: gömlek çorap 3  →  tipleri seçer, sayıyı ayarlar"
          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10 }}
        />
      </div>

      {/* Kıyafet tipleri + adet + kaydet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {QUICK_TYPES.map(type => (
            <button key={type} onClick={() => toggle(type)} style={{
              padding: '4px 10px', borderRadius: 16, cursor: 'pointer',
              background: selected.includes(type) ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
              border: `1px solid ${selected.includes(type) ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: selected.includes(type) ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 10,
            }}>
              {CLOTHING_ICONS[type] || ''} {type}
            </button>
          ))}
        </div>

        {/* Adet stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={() => setItemCount(c => Math.max(1, c - 1))}
            style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--accent)', minWidth: 22, textAlign: 'center' }}>{itemCount}</span>
          <button
            onClick={() => setItemCount(c => Math.min(99, c + 1))}
            style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>parça</span>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          style={{ whiteSpace: 'nowrap' }}
        >
          {create.isPending ? '...' : `+ Kaydet (${itemCount})`}
        </button>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>Kapat</button>
      </div>

      {create.isError && (
        <div className="alert alert-danger" style={{ marginTop: 6, fontSize: 10 }}>
          {create.error?.response?.data?.error || 'Hata oluştu'}
        </div>
      )}
    </div>
  )
}

// ── FullRecordsView ────────────────────────────────────────────
function FullRecordsView() {
  const [recordsTab, setRecordsTab] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const STATUS_COLORS = { dirty: 'var(--accent)', washing: 'var(--blue)', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)' }
  const STATUS_LABELS = { dirty: 'Sepette', washing: 'Yıkanıyor', ready: 'Rafta', delivered: 'Teslim', lost: 'Kayıp' }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['laundry-all-records', status, search, dateFrom],
    queryFn: () => {
      const params = {}
      if (status !== 'all') params.status = status
      if (search) params.search = search
      if (dateFrom) params.from = dateFrom
      return laundryApi.getItems(status === 'delivered' ? { status: 'delivered', include_delivered: '1' } : params)
    },
    refetchInterval: 30000,
  })

  return (
    <div>
      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'all', label: '★ Tümü' },
          { key: 'filtered', label: '≡ Filtrele' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRecordsTab(t.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
              color: recordsTab === t.key ? 'var(--accent)' : 'var(--text3)',
              borderBottom: recordsTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {recordsTab === 'all' ? (
        <AllRecordsTab />
      ) : (
        <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Oda, isim, not..."
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <input
          type="date"
          className="form-input"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ width: 140 }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Aktif' },
            { key: 'dirty', label: 'Sepet' },
            { key: 'washing', label: 'Yıkama' },
            { key: 'ready', label: 'Hazır' },
            { key: 'delivered', label: 'Teslim' },
            { key: 'lost', label: 'Kayıp' },
          ].map(f => (
            <button key={f.key}
              className={`filter-chip ${status === f.key ? 'active' : ''}`}
              onClick={() => setStatus(f.key)}
              style={{ fontSize: 9 }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Records table */}
      {isLoading ? (
        <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Kayıt bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => {
            let cl = []
            try { cl = item.clothing_items ? JSON.parse(item.clothing_items) : [] } catch {}
            return (
              <div key={item.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${STATUS_COLORS[item.status] || 'var(--border)'}`,
                borderRadius: 8, padding: '12px 16px',
              }}>
                {/* Row 1: Room + Status + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)' }}>
                      {item.block} · {item.room_no}
                    </span>
                    {item.urgent === 1 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--red)', background: 'rgba(231,76,60,0.1)', padding: '2px 6px', borderRadius: 4 }}>ACİL</span>
                    )}
                    <span className={`badge badge-${item.status === 'delivered' ? 'green' : item.status === 'lost' ? 'red' : item.status === 'ready' ? 'blue' : 'gray'}`} style={{ fontSize: 8 }}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                    {new Date(item.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Row 2: Who gave + who entered + item count */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: cl.length > 0 ? 6 : 0 }}>
                  {item.intake_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      👤 Teslim eden: <strong style={{ color: 'var(--text)' }}>{item.intake_name}</strong>
                    </span>
                  )}
                  {item.occupant_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      🏠 Oda sakini: <strong style={{ color: 'var(--text)' }}>{item.occupant_name}</strong>
                    </span>
                  )}
                  {item.created_by_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                      Kaydeden: {item.created_by_name}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {item.item_count} parça
                  </span>
                  {item.phone_number && (
                    <a href={`https://wa.me/${item.phone_number.replace(/\D/g,'').replace(/^0/,'90')}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none' }}>
                      📱 {item.phone_number}
                    </a>
                  )}
                </div>

                {/* Row 3: Clothing details */}
                {cl.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: item.notes ? 6 : 0 }}>
                    {cl.map((c, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 12, color: 'var(--text2)',
                      }}>
                        {CLOTHING_ICONS[c.type] || ''} {c.qty}× {c.type}{c.color ? ` (${c.color})` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Row 4: Notes */}
                {item.notes && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic', marginTop: 4 }}>
                    📝 {item.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ── LaundryHub ─────────────────────────────────────────────────
export default function LaundryHub({ defaultView = 'kanban' }) {
  useLaundrySSE()

  const qc = useQueryClient()

  const [section,        setSection]        = useState('hub') // 'hub' | 'records' | 'reports' | 'settings'
  const [view,           setView]           = useState(defaultView)
  const [filter,         setFilter]         = useState('all')
  const [search,         setSearch]         = useState('')
  const [showNew,        setShowNew]        = useState(false)
  const [deliverItem,    setDeliverItem]    = useState(null)
  const [damageItem,     setDamageItem]     = useState(null)
  const [showMachines,   setShowMachines]   = useState(true)
  const [showMgr,        setShowMgr]        = useState(false)
  const [batchMode,      setBatchMode]      = useState(false)
  const [selectedIds,    setSelectedIds]    = useState(new Set())
  const [showBatchAssign, setShowBatchAssign] = useState(false)
  const [verificationTarget, setVerificationTarget] = useState(null)
  const [archiveSelectedItem, setArchiveSelectedItem] = useState(null)
  const [groupByRoom,    setGroupByRoom]    = useState(
    () => localStorage.getItem('laundry_group_by_room') === '1'
  )
  const [personPanelName, setPersonPanelName] = useState(null)
  const [foundItem,      setFoundItem]      = useState(null)
  const [activeItem,     setActiveItem]     = useState(null)
  const [overCol,        setOverCol]        = useState(null)
  const [showQuickAdd,   setShowQuickAdd]   = useState(false)
  const [showScanModal,  setShowScanModal]  = useState(false)
  const [filterBlock,    setFilterBlock]    = useState('all')  // 'all' | 'A' | 'B' | 'S2'
  const [filterUrgent,   setFilterUrgent]   = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-new-laundry') setShowNew(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  const handleDragStart = ({ active }) => {
    setActiveItem(active.data.current.item)
  }

  const handleDragOver = ({ over }) => {
    setOverCol(over?.id || null)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveItem(null); setOverCol(null)
    if (!over) return
    const item = active.data.current.item
    const targetStatus = over.id
    if (item.status === targetStatus) return

    const FORWARD = { dirty: 'washing', washing: 'ready', ironing: 'ready' }
    const BACKWARD = { washing: ['dirty'], ready: ['washing', 'dirty'], ironing: ['washing', 'dirty'] }

    // Özel durum: ütü gereken item washing → ironing sütununa sürüklenebilir
    if (item.status === 'washing' && targetStatus === 'ironing' && item.needs_ironing) {
      if (item.clothing_items) {
        setVerificationTarget({ item, stage: 'washing_to_ready' })
      } else {
        laundryApi.advanceItem(item.id, {})
          .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
          .catch(err => alert(err?.response?.data?.message || 'İşlem başarısız'))
      }
      return
    }

    if (FORWARD[item.status] === targetStatus) {
      // İleri geçiş
      if (item.status === 'dirty') {
        const idleMachine = machines.find(m => m.status === 'idle')
        if (!idleMachine) { alert('Boş makine yok — kart butonunu kullan'); return }
        laundryApi.advanceItem(item.id, { machine_id: idleMachine.id })
          .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
          .catch(err => alert(err?.response?.data?.message || 'Makineye atama başarısız'))
      } else if ((item.status === 'washing' && !item.needs_ironing) || item.status === 'ironing') {
        // Doğrulama gereken geçiş: washing→ready veya ironing→ready
        if (item.clothing_items) {
          const stage = item.status === 'washing' ? 'washing_to_ready' : 'ironing_to_ready'
          setVerificationTarget({ item, stage })
        } else {
          laundryApi.advanceItem(item.id, {})
            .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
            .catch(err => alert(err?.response?.data?.message || 'İşlem başarısız'))
        }
      } else {
        laundryApi.advanceItem(item.id, {})
          .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
          .catch(err => alert(err?.response?.data?.message || 'İşlem başarısız'))
      }
    } else if (BACKWARD[item.status]?.includes(targetStatus)) {
      // Geri geçiş
      laundryApi.revertItem(item.id, targetStatus)
        .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
        .catch(err => alert(err?.response?.data?.message || 'Geri alma başarısız'))
    }
  }

  const { data: allItems = [] } = useQuery({
    queryKey: ['laundry-items', 'all'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 20000,
    placeholderData: (prev) => prev,
  })
  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
    refetchInterval: 15000,
  })
  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-sla'],
    queryFn: laundryApi.getSlaViolations,
    refetchInterval: 60000,
  })
  const { data: preWarnings = [] } = useQuery({
    queryKey: ['laundry-sla-pre-warnings'],
    queryFn: laundryApi.getSlaPreWarnings,
    refetchInterval: 60_000,
  })
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
    refetchInterval: 60000,
  })
  const { data: laundrySettings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
    staleTime: 30_000,
  })
  const { data: chatMessages = [] } = useQuery({
    queryKey: ['laundry-messages'],
    queryFn: laundryApi.getMessages,
    refetchInterval: 30_000,
  })
  const unreadMsgCount = useMemo(() => {
    const lastSeen = parseInt(localStorage.getItem('laundry_last_seen_msg') || '0')
    return chatMessages.filter(m => m.id > lastSeen).length
  }, [chatMessages])

  // Filtered items for both views
  const { data: listItems = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter, search],
    queryFn: () => {
      const params = {}
      if (filter === 'urgent') params.urgent = '1'
      else if (filter === 'sla') params.sla_only = '1'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 20000,
    placeholderData: (prev) => prev,
  })

  // Kanban: always use allItems filtered by status (no extra filter applied)
  const kanbanItems = useMemo(() => {
    let list = allItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        `${i.block} ${i.room_no} ${i.notes || ''} ${i.occupant_name || ''}`.toLowerCase().includes(q)
      )
    }
    if (filterBlock !== 'all') {
      list = list.filter(i => i.block === filterBlock)
    }
    if (filterUrgent) {
      list = list.filter(i => !!i.urgent)
    }
    return list
  }, [allItems, search, filterBlock, filterUrgent])

  const dirty   = kanbanItems.filter(i => i.status === 'dirty')
  const washing = kanbanItems.filter(i => i.status === 'washing')
  const ironing = kanbanItems.filter(i => i.status === 'ironing')
  const ready   = kanbanItems.filter(i => i.status === 'ready')
  const lost    = allItems.filter(i => i.status === 'lost')

  const counts = {
    dirty:   allItems.filter(i => i.status === 'dirty').length,
    washing: allItems.filter(i => i.status === 'washing').length,
    ironing: allItems.filter(i => i.status === 'ironing').length,
    ready:   allItems.filter(i => i.status === 'ready').length,
    sla:     violations.length,
    lost:    allItems.filter(i => i.status === 'lost').length,
  }
  const activeTotal = counts.dirty + counts.washing + counts.ironing + counts.ready

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectBlock = (blockItems) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = blockItems.every(item => prev.has(item.id))
      if (allSelected) blockItems.forEach(item => next.delete(item.id))
      else blockItems.forEach(item => next.add(item.id))
      return next
    })
  }

  const handleBatchDeliver = () => {
    const name = prompt('Toplu teslim — alıcı adı:')
    if (!name) return
    laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to: name })
      .then(() => {
        qc.invalidateQueries({ queryKey: ['laundry-items'] })
        setSelectedIds(new Set())
        setBatchMode(false)
      })
  }

  const handleBatchLost = () => {
    if (!window.confirm(`${selectedIds.size} kaydı kayıp işaretlemek istediğinize emin misiniz?`)) return
    laundryApi.batchLost([...selectedIds], null)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['laundry-items'] })
        setSelectedIds(new Set())
        setBatchMode(false)
      })
  }

  const toggleGroupByRoom = () => {
    setGroupByRoom(v => {
      localStorage.setItem('laundry_group_by_room', v ? '0' : '1')
      return !v
    })
  }

  const washedTodayColor = useMemo(() => {
    const goal = parseInt(laundrySettings.daily_goal || '50')
    const val = stats?.washed_today?.count ?? 0
    return val >= goal ? 'var(--green)' : 'var(--blue)'
  }, [stats?.washed_today?.count, laundrySettings.daily_goal])

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: view === 'kanban' ? 1600 : 1000, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 36, letterSpacing: 5, color: 'var(--text)', lineHeight: 1, marginBottom: 8 }}>
            ÇAMAŞIRHANE
          </h1>
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'hub',      label: '⊞ Kontrol' },
              { key: 'records',  label: '≡ Kayıtlar' },
              { key: 'archive',       label: '▣ Arşiv' },
              { key: 'premium-search', label: '◎ Premium Ara' },
              { key: 'reports',       label: '◈ Raporlar' },
              { key: 'settings', label: '⚙ Ayarlar' },
            ].map(s => (
              <button key={s.key}
                onClick={() => setSection(s.key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
                  background: section === s.key ? 'rgba(240,165,0,0.12)' : 'transparent',
                  border: `1px solid ${section === s.key ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                  color: section === s.key ? 'var(--accent)' : 'var(--text3)',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5, position: 'relative',
                }}
              >
                {s.label}
                {s.key === 'hub' && unreadMsgCount > 0 && section !== 'hub' && (
                  <span style={{
                    background: 'var(--red)', color: '#fff',
                    fontFamily: 'var(--mono)', fontSize: 7, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 4, lineHeight: 1.4,
                  }}>{unreadMsgCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {section === 'hub' && (
            <>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setShowQuickAdd(s => !s)}
                style={{
                  border: `1px solid ${showQuickAdd ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                  color: showQuickAdd ? 'var(--accent)' : 'var(--text3)',
                }}
              >
                ⚡ Hızlı Ekle
              </button>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setShowScanModal(true)}
                style={{ border: '1px solid var(--border)', color: 'var(--text3)' }}
              >
                ⊡ Oda Tara
              </button>
              <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ letterSpacing: 1 }}>
                + Yeni Kayıt
              </button>
            </>
          )}
        </div>
      </div>

      {section === 'hub' && (<>

      {showQuickAdd && <QuickAdd onClose={() => setShowQuickAdd(false)} />}

      {/* ── SLA ── */}
      <SlaAlert violations={violations} preWarnings={preWarnings} />

      {/* ── KPI STRIP ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',      value: counts.dirty,                         color: 'var(--accent)', sub: activeTotal > 0 ? (counts.dirty / activeTotal) * 100 : 0 },
          { label: 'Yıkaniyor',    value: counts.washing,                       color: 'var(--blue)',   sub: activeTotal > 0 ? (counts.washing / activeTotal) * 100 : 0 },
          { label: 'Rafta Hazır',  value: counts.ready,                         color: 'var(--green)',  sub: activeTotal > 0 ? (counts.ready / activeTotal) * 100 : 0 },
          { label: 'SLA İhlali',   value: violations.length,                    color: 'var(--red)',    sub: null },
          { label: 'Bugün Teslim', value: stats?.delivered_today?.count ?? 0,   color: 'var(--teal)',   sub: null },
          {
            label: 'Bugün Yıkamaya',
            value: stats?.washed_today?.count ?? 0,
            color: washedTodayColor,
            sub: null,
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: `2px solid ${s.color}`, borderRadius: 10,
            padding: '14px 14px 12px', position: 'relative', overflow: 'hidden',
            transition: 'transform 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: s.color, opacity: 0.04 }} />
            <div style={{ fontFamily: 'var(--display)', fontSize: 52, letterSpacing: 2, color: s.color, lineHeight: 1, marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 2 }}>
              {s.label}
            </div>
            {s.sub != null && (
              <div style={{ marginTop: 8, height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, s.sub)}%`, background: s.color, opacity: 0.6, borderRadius: 1, transition: 'width 0.8s ease' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── NOTLAR ── */}
      <QuickNotes />

      {/* ── MAKİNELER ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showMachines ? 10 : 0 }}>
          <button onClick={() => setShowMachines(s => !s)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, padding: 0,
          }}>
            <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: showMachines ? 'rotate(90deg)' : '' }}>›</span>
            MAKİNELER
          </button>
          {machines.filter(m => m.status === 'running').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>
              {machines.filter(m => m.status === 'running').length} çalışıyor
            </span>
          )}
          {machines.filter(m => m.status === 'done').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>
              · {machines.filter(m => m.status === 'done').length} bekleniyor
            </span>
          )}
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <button onClick={() => setShowMgr(true)} style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
          }}>
            Yönet
          </button>
        </div>
        {showMachines && <MachineStrip machines={machines} hideHeader />}
      </div>

      {/* ── TOOLBAR: SEARCH + FILTERS + VIEW TOGGLE ── */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', paddingTop: 6, paddingBottom: 6,
      }}>
        <input
          className="form-input"
          style={{ width: 200, padding: '6px 11px', fontSize: 11 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ara (oda, kişi, not)…"
        />
        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {FILTERS.map(f => {
            const cnt = f.key === 'all' ? null
              : f.key === 'sla' ? violations.length
              : counts[f.key] > 0 ? counts[f.key] : null
            return (
              <button key={f.key}
                className={`filter-chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => {
                  setFilter(f.key)
                  if (view === 'kanban' && f.key !== 'all') setView('liste')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
              >
                {f.dot && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: filter === f.key ? f.dot : 'var(--text3)', flexShrink: 0 }} />
                )}
                {f.label}
                {cnt != null && cnt > 0 && (
                  <span style={{
                    background: filter === f.key ? f.dot + '33' : 'var(--surface3)',
                    color: filter === f.key ? f.dot : 'var(--text3)',
                    borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
                  }}>{cnt}</span>
                )}
              </button>
            )
          })}
        </div>
        {search && (
          <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')}>✕</button>
        )}
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
          {[
            { key: 'kanban', label: '⊞' },
            { key: 'liste',  label: '≡' },
          ].map(v => (
            <button key={v.key}
              onClick={() => setView(v.key)}
              style={{
                padding: '6px 12px', cursor: 'pointer', border: 'none',
                background: view === v.key ? 'var(--accent)' : 'transparent',
                color: view === v.key ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 13,
                transition: 'all 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Batch mode */}
        {view === 'liste' && (
          <>
            {batchMode && selectedIds.size > 0 && (
              <>
                <button className="btn btn-sm" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => setShowBatchAssign(true)}>
                  Makineye Ata ({selectedIds.size})
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={handleBatchDeliver}>
                  Teslim ({selectedIds.size})
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(231,76,60,0.15)', color: 'var(--red)', border: '1px solid rgba(231,76,60,0.3)' }} onClick={handleBatchLost}>
                  Kayıp ({selectedIds.size})
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
              {batchMode ? 'İptal' : 'Toplu'}
            </button>
          </>
        )}
        {/* Kanban oda gruplama */}
        {view === 'kanban' && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ background: groupByRoom ? 'var(--accent)' : undefined, color: groupByRoom ? '#000' : undefined }}
            onClick={toggleGroupByRoom}
          >
            Odaya Göre
          </button>
        )}
      </div>

      {/* ── CONTENT ── */}
      {view === 'kanban' ? (
        <>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 4 }}>
            <KanbanCol title="KİRLİ SEPET"  color="var(--accent)" items={dirty}   colStatus="dirty"   isOver={overCol === 'dirty'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} />
            <KanbanCol title="YIKANIYOR"    color="var(--blue)"   items={washing} colStatus="washing" isOver={overCol === 'washing'} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} />
            <KanbanCol title="ÜTÜDE" color="#6366f1" items={ironing} colStatus="ironing" isOver={overCol === 'ironing'} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} />
            <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   colStatus="ready"   isOver={overCol === 'ready'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} batchMode={batchMode} selectedIds={selectedIds} onSelect={toggleSelect} onSelectBlock={selectBlock} />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div style={{ pointerEvents: 'none', opacity: 0.95, boxShadow: '0 16px 48px rgba(0,0,0,0.45)', cursor: 'grabbing', borderRadius: 8 }}>
                <KanbanCard item={activeItem} machines={machines} onDeliver={() => {}} onDamage={() => {}} onPersonClick={() => {}} onFound={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
          {lost.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, color: 'var(--red)',
                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                KAYIP ({lost.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {lost.map(item => (
                  <div key={item.id} style={{
                    flex: '0 0 calc(33% - 6px)', minWidth: 200,
                    background: 'var(--surface)', border: '1px solid rgba(231,76,60,0.25)',
                    borderTop: '2px solid var(--red)', borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--red)', marginBottom: 4 }}>
                      {item.block} · {item.room_no}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>
                      {item.item_count} parça {item.occupant_name ? `· ${item.occupant_name}` : ''}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 8 }}>
                      {new Date(item.created_at).toLocaleDateString('tr-TR')}
                      {item.intake_name ? ` · ${item.intake_name}` : ''}
                    </div>
                    <button
                      className="btn btn-xs"
                      style={{ background: 'rgba(39,201,106,0.12)', color: 'var(--green)', border: '1px solid rgba(39,201,106,0.25)', fontSize: 9 }}
                      onClick={() => setFoundItem(item)}
                    >
                      ✓ Bulundu →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DndContext>
        <DeliveredTodaySection />
        </>
      ) : (
        <div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.4 - i * 0.1 }} />
              ))}
            </div>
          ) : listItems.length === 0 ? (
            <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧺</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--text2)', marginBottom: 8 }}>
                {filter !== 'all' ? 'SONUÇ YOK' : 'KAYIT YOK'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {filter !== 'all' ? 'Bu filtre için kayıt yok' : 'Henüz kayıt oluşturulmamış'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {listItems.map((item, idx) => (
                <div key={item.id} className={`fade-up-${Math.min(idx, 4)}`}>
                  <ItemCard
                    item={item}
                    machines={machines}
                    onDeliver={setDeliverItem}
                    onDamage={setDamageItem}
                    selected={selectedIds.has(item.id)}
                    onSelect={batchMode ? toggleSelect : undefined}
                    onPersonClick={setPersonPanelName}
                    onFound={setFoundItem}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MESAJLAŞMA ── */}
      <LaundryChat />

      </>)}

      {section === 'records'  && <FullRecordsView />}
      {section === 'archive'  && (
        <div style={{ position: 'relative' }}>
          <ArchiveTable onSelectItem={setArchiveSelectedItem} />
          {archiveSelectedItem && (
            <ArchiveDetailPanel item={archiveSelectedItem} onClose={() => setArchiveSelectedItem(null)} />
          )}
        </div>
      )}
      {section === 'premium-search' && <PremiumSearchPanel />}
      {section === 'reports'  && <LaundryReport />}
      {section === 'settings' && <LaundrySettings />}

      {/* ── MODALS ── */}
      {showScanModal && <GarmentScanModal onClose={() => setShowScanModal(false)} />}
      {showNew      && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem  && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem   && <DamageModal   item={damageItem}  onClose={() => setDamageItem(null)} />}
      {showMgr      && <MachineManagerPanel machines={machines} onClose={() => setShowMgr(false)} />}
      {personPanelName && <PersonPanel name={personPanelName} onClose={() => setPersonPanelName(null)} />}
      {foundItem && <FoundModal item={foundItem} onClose={() => setFoundItem(null)} />}
      {showBatchAssign && (
        <BatchAssignModal
          selectedIds={selectedIds}
          onClose={() => setShowBatchAssign(false)}
          onSuccess={() => { setShowBatchAssign(false); setSelectedIds(new Set()); setBatchMode(false) }}
        />
      )}
      {verificationTarget && (
        <ItemVerificationModal
          item={verificationTarget.item}
          stage={verificationTarget.stage}
          onClose={() => setVerificationTarget(null)}
          onSuccess={() => {
            const { item, stage: _stage } = verificationTarget
            setVerificationTarget(null)
            laundryApi.advanceItem(item.id, {})
              .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
          }}
        />
      )}
    </div>
  )
}
