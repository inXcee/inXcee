import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import { useLaundrySSE } from '../../shared/hooks/useLaundrySSE.js'

import MachineStrip       from './components/MachineStrip.jsx'
import SlaAlert           from './components/SlaAlert.jsx'
import ItemCard           from './components/ItemCard.jsx'
import NewItemModal       from './components/NewItemModal.jsx'
import DeliveryModal      from './components/DeliveryModal.jsx'
import DamageModal        from './components/DamageModal.jsx'
import AssignModal        from './components/AssignModal.jsx'
import ShelfModal         from './components/ShelfModal.jsx'
import LostModal          from './components/LostModal.jsx'
import MachineManagerPanel from './components/MachineManagerPanel.jsx'

// ── WA link helper ─────────────────────────────────────────────
function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? '90' + digits.slice(1) : digits
  return `https://wa.me/${normalized}`
}

// ── ExpandedSection ────────────────────────────────────────────
function ExpandedSection({ item, onLost, onFound }) {
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
                  }}>
                    {c.qty}× {c.type}{c.color ? ` (${c.color})` : ''}
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
          <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[h.to_status] || 'var(--text3)', flexShrink: 0, marginTop: 3 }} />
            <div>
              <span style={{ color: 'var(--text2)', fontSize: 9 }}>{STATUS_LABELS[h.to_status] || h.to_status}</span>
              {h.actor_name && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {h.actor_name}</span>}
              {dur != null && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {dur < 60 ? `${dur}dk` : `${Math.round(dur/60)}s`} bekledi</span>}
              <div style={{ fontSize: 8, color: 'var(--text3)' }}>{new Date(h.created_at).toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
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
    </div>
  )
}

// ── KanbanCard ─────────────────────────────────────────────────
function KanbanCard({ item, machines, onDeliver, onDamage, onPersonClick, onFound }) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [shelfOpen,  setShelfOpen]  = useState(false)
  const [lostOpen,   setLostOpen]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)

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
            const preview = cl.slice(0, 2).map(c => `${c.qty} ${c.type}`).join(' · ')
            return <span style={{ color: 'var(--text2)' }}>· {preview}{cl.length > 2 ? ` +${cl.length - 2}` : ''}</span>
          } catch { return null }
        })()}
        {item.occupant_name && <span style={{ color: 'var(--text2)' }}>· {item.occupant_name}</span>}
        {item.machine_name && <span>· ⚙ {item.machine_name}</span>}
        {item.shelf_location && <span>· ▣ {item.shelf_location}</span>}
        {item.notes && <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>· {item.notes}</span>}
      </div>

      {/* Phone */}
      {phone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', flex: 1 }}>📱 {phone}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" style={{
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
      {item.status !== 'lost' && item.status !== 'delivered' && (
        <div style={{ display: 'flex', gap: 5 }}>
          {item.status === 'dirty' && (
            <button onClick={() => setAssignOpen(true)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
              color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ⚙ Makineye At…
            </button>
          )}
          {item.status === 'washing' && (
            <button onClick={() => setShelfOpen(true)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(59,140,240,0.08)', border: '1px solid rgba(59,140,240,0.25)',
              color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ▣ Rafa Koy →
            </button>
          )}
          {item.status === 'ready' && (
            <button onClick={() => onDeliver(item)} style={{
              flex: 1, padding: '5px 8px', borderRadius: 6,
              background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
              color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9,
              cursor: 'pointer', fontWeight: 700,
            }}>
              ✓ Teslim Et →
            </button>
          )}
          {onDamage && (
            <button onClick={() => onDamage(item)} style={{
              padding: '5px 8px', borderRadius: 6,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}>⚠</button>
          )}
          <button onClick={() => setExpanded(s => !s)} style={{
            padding: '5px 8px', borderRadius: 6,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
          }}>
            {expanded ? '▲' : '▾'}
          </button>
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
function KanbanCol({ title, color, items, machines, onDeliver, onDamage, onPersonClick, onFound }) {
  return (
    <div style={{
      flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderTop: `2px solid ${color}`, borderRadius: 10, overflow: 'hidden',
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520 }}>
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            boş
          </div>
        ) : items.map(item => (
          <KanbanCard key={item.id} item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
            onPersonClick={onPersonClick} onFound={onFound} />
        ))}
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

// ── LaundryHub ─────────────────────────────────────────────────
export default function LaundryHub({ defaultView = 'kanban' }) {
  useLaundrySSE()

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
  const [personPanelName, setPersonPanelName] = useState(null)
  const [foundItem,      setFoundItem]      = useState(null)

  const { data: allItems = [] } = useQuery({
    queryKey: ['laundry-items', 'all'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 20000,
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
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
    refetchInterval: 60000,
  })

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
    return list
  }, [allItems, search])

  const dirty   = kanbanItems.filter(i => i.status === 'dirty')
  const washing = kanbanItems.filter(i => i.status === 'washing')
  const ready   = kanbanItems.filter(i => i.status === 'ready')

  const counts = {
    dirty:   allItems.filter(i => i.status === 'dirty').length,
    washing: allItems.filter(i => i.status === 'washing').length,
    ready:   allItems.filter(i => i.status === 'ready').length,
    sla:     violations.length,
    lost:    allItems.filter(i => i.status === 'lost').length,
  }
  const activeTotal = counts.dirty + counts.washing + counts.ready

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBatchDeliver = () => {
    const name = prompt('Toplu teslim — alıcı adı:')
    if (!name) return
    laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to: name })
      .then(() => { setSelectedIds(new Set()); setBatchMode(false) })
  }

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: view === 'kanban' ? 1200 : 880, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 5, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
            ÇAMAŞIRHANE
          </h1>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 0.5 }}>
            {today}
            {activeTotal > 0 && <span style={{ marginLeft: 10 }}>· {activeTotal} aktif</span>}
            {violations.length > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 10 }}>· {violations.length} SLA ihlali</span>
            )}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ letterSpacing: 1 }}>
          + Yeni Kayıt
        </button>
      </div>

      {/* ── SLA ── */}
      <SlaAlert violations={violations} />

      {/* ── KPI STRIP ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',      value: counts.dirty,                         color: 'var(--accent)', sub: activeTotal > 0 ? (counts.dirty / activeTotal) * 100 : 0 },
          { label: 'Yıkaniyor',    value: counts.washing,                       color: 'var(--blue)',   sub: activeTotal > 0 ? (counts.washing / activeTotal) * 100 : 0 },
          { label: 'Rafta Hazır',  value: counts.ready,                         color: 'var(--green)',  sub: activeTotal > 0 ? (counts.ready / activeTotal) * 100 : 0 },
          { label: 'SLA İhlali',   value: violations.length,                    color: 'var(--red)',    sub: null },
          { label: 'Bugün Teslim', value: stats?.delivered_today?.count ?? 0,   color: 'var(--teal)',   sub: null },
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
            <div style={{ fontFamily: 'var(--display)', fontSize: 44, letterSpacing: 2, color: s.color, lineHeight: 1, marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 2 }}>
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
                onClick={() => setFilter(f.key)}
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
        {/* Batch mode (sadece liste view) */}
        {view === 'liste' && (
          <>
            {batchMode && selectedIds.size > 0 && (
              <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={handleBatchDeliver}>
                Toplu Teslim ({selectedIds.size})
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
              {batchMode ? 'İptal' : 'Toplu'}
            </button>
          </>
        )}
      </div>

      {/* ── CONTENT ── */}
      {view === 'kanban' ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <KanbanCol title="KİRLİ SEPET"  color="var(--accent)" items={dirty}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} />
          <KanbanCol title="YIKANIYOR"    color="var(--blue)"   items={washing} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} />
          <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} />
        </div>
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

      {/* ── MODALS ── */}
      {showNew      && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem  && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem   && <DamageModal   item={damageItem}  onClose={() => setDamageItem(null)} />}
      {showMgr      && <MachineManagerPanel machines={machines} onClose={() => setShowMgr(false)} />}
    </div>
  )
}
