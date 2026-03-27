import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import SlaAlert from './components/SlaAlert.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import DeliveryModal from './components/DeliveryModal.jsx'
import DamageModal from './components/DamageModal.jsx'

/* ── Inline KanbanCard ─────────────────────────────────────── */
function KanbanCard({ item, machines, onDeliver, onDamage }) {
  const qc = useQueryClient()
  const [machineId, setMachineId] = useState('')

  const advance = useMutation({
    mutationFn: (data) => laundryApi.advanceItem(item.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-sla'] })
    },
  })

  const isSlaWarn = item.hours_in_status > 24
  const isSlaRed  = item.hours_in_status > 48
  const isUrgent  = item.urgent === 1

  const slaColor = isSlaRed ? 'var(--red)' : isSlaWarn ? 'var(--accent)' : null

  return (
    <div style={{
      background: 'var(--surface2)',
      border: `1px solid ${isUrgent ? 'rgba(231,76,60,0.3)' : isSlaRed ? 'rgba(231,76,60,0.15)' : 'var(--border)'}`,
      borderLeft: `2px solid ${isUrgent ? 'var(--red)' : item.status === 'washing' ? 'var(--blue)' : item.status === 'ready' ? 'var(--green)' : 'var(--accent)'}`,
      borderRadius: 8,
      padding: '10px 12px',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Room + badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)', lineHeight: 1 }}>
          {item.block} · {item.room_no}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {isUrgent && <span className="badge badge-red" style={{ fontSize: 7 }}>ACİL</span>}
          {slaColor && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 7, fontWeight: 700,
              background: `${slaColor}18`, color: slaColor,
              border: `1px solid ${slaColor}30`,
              borderRadius: 10, padding: '1px 5px',
            }}>
              {item.hours_in_status}s
            </span>
          )}
          {item.damage_count > 0 && (
            <span className="badge badge-amber" style={{ fontSize: 7 }}>⚠{item.damage_count}</span>
          )}
        </div>
      </div>

      {/* Meta */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span>{item.item_count} parça</span>
        {item.machine_name && <span>⚙ {item.machine_name}</span>}
        {item.shelf_location && <span>▣ {item.shelf_location}</span>}
        {item.notes && <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>{item.notes}</span>}
      </div>

      {/* Action */}
      {item.status === 'dirty' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={machineId}
            onChange={e => {
              if (e.target.value) {
                advance.mutate({ machine_id: +e.target.value })
                setMachineId('')
              }
            }}
            disabled={advance.isPending}
            style={{
              flex: 1, background: 'rgba(240,165,0,0.08)',
              border: '1px solid rgba(240,165,0,0.25)', borderRadius: 6,
              padding: '5px 8px', color: 'var(--accent)',
              fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">Makineye At →</option>
            {machines.filter(m => m.status === 'idle').map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            {machines.filter(m => m.status === 'idle').length === 0 && (
              <option disabled>Boş makine yok</option>
            )}
          </select>
        </div>
      )}
      {item.status === 'washing' && (
        <button
          onClick={() => {
            const shelf = prompt('Raf konumu (örn: 2. Kat A):')
            if (shelf !== null) advance.mutate({ shelf_location: shelf })
          }}
          disabled={advance.isPending}
          style={{
            width: '100%', padding: '5px 8px', borderRadius: 6,
            background: 'rgba(59,140,240,0.08)', border: '1px solid rgba(59,140,240,0.25)',
            color: 'var(--blue)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            fontWeight: 700, letterSpacing: 0.5,
          }}
        >
          Rafa Koy →
        </button>
      )}
      {item.status === 'ready' && (
        <button
          onClick={() => onDeliver(item)}
          style={{
            width: '100%', padding: '5px 8px', borderRadius: 6,
            background: 'rgba(39,201,106,0.08)', border: '1px solid rgba(39,201,106,0.25)',
            color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            fontWeight: 700, letterSpacing: 0.5,
          }}
        >
          Teslim Et →
        </button>
      )}

      {advance.isError && (
        <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--red)' }}>
          {advance.error?.response?.data?.error || 'Hata'}
        </div>
      )}
    </div>
  )
}

/* ── Kanban column ─────────────────────────────────────────── */
function KanbanCol({ title, color, items, machines, onDeliver, onDamage }) {
  return (
    <div style={{
      flex: 1, minWidth: 220,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface)',
      border: `1px solid var(--border)`,
      borderTop: `2px solid ${color}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(135deg, ${color}0d, transparent)`,
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 3, color }}>
          {title}
        </span>
        <span style={{
          fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 1, color, lineHeight: 1,
        }}>
          {items.length}
        </span>
      </div>
      <div style={{
        flex: 1, overflowY: 'auto', padding: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
        maxHeight: 480,
      }}>
        {items.length === 0 ? (
          <div style={{
            padding: '24px 0', textAlign: 'center',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', letterSpacing: 1,
          }}>
            boş
          </div>
        ) : items.map(item => (
          <KanbanCard key={item.id} item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage} />
        ))}
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────── */
export default function LaundryDashboard() {
  const [showNew, setShowNew]       = useState(false)
  const [deliverItem, setDeliverItem] = useState(null)
  const [damageItem, setDamageItem]   = useState(null)

  const { data: items = [] } = useQuery({
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

  const dirty   = items.filter(i => i.status === 'dirty')
  const washing = items.filter(i => i.status === 'washing')
  const ready   = items.filter(i => i.status === 'ready')

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: 1200, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 18,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 5,
            color: 'var(--text)', lineHeight: 1, marginBottom: 4,
          }}>
            LAUNDRY DASHBOARD
          </h1>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 0.5 }}>
            Bugün · {today}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {violations.length > 0 && (
            <span className="badge badge-red">
              <span className="live-dot" style={{ width: 5, height: 5, background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />
              {violations.length} SLA İhlal
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => setShowNew(true)}
            style={{ letterSpacing: 1 }}
          >
            + Yeni Kayıt
          </button>
        </div>
      </div>

      {/* ── SLA ALERT ── */}
      <SlaAlert violations={violations} />

      {/* ── KPI STRIP ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Kırı Sepette',  value: dirty.length,                                    color: 'var(--accent)' },
          { label: 'Yıkaniyor',     value: washing.length,                                  color: 'var(--blue)'   },
          { label: 'Rafta Hazır',   value: ready.length,                                    color: 'var(--green)'  },
          { label: 'SLA İhlal',     value: violations.length,                               color: 'var(--red)'    },
          { label: 'Bugün Teslim',  value: stats?.delivered_today ?? 0,                     color: 'var(--teal)'   },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)',
            border: `1px solid var(--border)`,
            borderTop: `2px solid ${s.color}`,
            borderRadius: 10,
            padding: '16px 16px 14px',
            position: 'relative', overflow: 'hidden',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)` }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            {/* Glow bg */}
            <div style={{
              position: 'absolute', top: -20, right: -20,
              width: 80, height: 80, borderRadius: '50%',
              background: s.color, opacity: 0.04,
              pointerEvents: 'none',
            }} />
            <div style={{
              fontFamily: 'var(--display)', fontSize: 48, letterSpacing: 2,
              color: s.color, lineHeight: 1, marginBottom: 8,
            }}>
              {s.value}
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 2,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── MACHINE STRIP ── */}
      <MachineStrip machines={machines} />

      {/* ── KANBAN ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <KanbanCol
          title="KIRI SEPETTE"
          color="var(--accent)"
          items={dirty}
          machines={machines}
          onDeliver={setDeliverItem}
          onDamage={setDamageItem}
        />
        <KanbanCol
          title="YIKANIYOR"
          color="var(--blue)"
          items={washing}
          machines={machines}
          onDeliver={setDeliverItem}
          onDamage={setDamageItem}
        />
        <KanbanCol
          title="RAFTA HAZIR"
          color="var(--green)"
          items={ready}
          machines={machines}
          onDeliver={setDeliverItem}
          onDamage={setDamageItem}
        />
      </div>

      {/* ── MODALS ── */}
      {showNew && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem && <DamageModal item={damageItem} onClose={() => setDamageItem(null)} />}
    </div>
  )
}
