import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDraggable } from '@dnd-kit/core'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import AssignModal from './AssignModal.jsx'
import ShelfModal from './ShelfModal.jsx'
import LostModal from './LostModal.jsx'
import PremiumGarmentList from './PremiumGarmentList.jsx'
import ExpandedSection from './ExpandedSection.jsx'
import { waLink } from './hubShared.js'

// ── DraggableKanbanCard ────────────────────────────────────────
export function DraggableKanbanCard({ item, ...props }) {
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
export default function KanbanCard({ item, machines, onDeliver, onDamage, onPersonClick, onFound }) {
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
