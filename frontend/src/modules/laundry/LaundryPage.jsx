import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import ItemCard from './components/ItemCard.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import DeliveryModal from './components/DeliveryModal.jsx'
import DamageModal from './components/DamageModal.jsx'
import SlaAlert from './components/SlaAlert.jsx'

/* ── Filter config ──────────────────────────────────────────── */
const FILTERS = [
  { key: 'all',     label: 'Tümü',    dot: null },
  { key: 'dirty',   label: 'Sepet',   dot: 'var(--accent)' },
  { key: 'washing', label: 'Yıkama',  dot: 'var(--blue)' },
  { key: 'ready',   label: 'Hazır',   dot: 'var(--green)' },
  { key: 'urgent',  label: 'Acil',    dot: 'var(--red)' },
  { key: 'sla',     label: 'SLA',     dot: 'var(--red)' },
  { key: 'lost',    label: 'Kayıp',   dot: 'var(--text3)' },
]

/* ── KPI card ───────────────────────────────────────────────── */
function KpiCard({ label, value, color, sub }) {
  return (
    <div className="kpi-card panel" style={{
      padding: '12px 14px',
      borderTop: `2px solid ${color}`,
      cursor: 'default',
      minWidth: 0,
    }}>
      <div style={{
        fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 3,
        color, lineHeight: 1, marginBottom: 4,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 1.5,
      }}>
        {label}
      </div>
      {sub != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(100, sub)}%`, borderRadius: 1,
              background: color, transition: 'width 0.8s ease',
              opacity: 0.6,
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────── */
function EmptyState({ filter }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 20px', gap: 12,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, marginBottom: 4,
      }}>
        🧺
      </div>
      <div style={{
        fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3,
        color: 'var(--text2)',
      }}>
        {filter !== 'all' ? 'SONUÇ YOK' : 'KAYIT YOK'}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)',
        letterSpacing: 0.5, textAlign: 'center',
      }}>
        {filter !== 'all'
          ? 'Bu filtre için çamaşır kaydı bulunamadı'
          : 'Henüz çamaşır kaydı oluşturulmamış'}
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
export default function LaundryPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [deliverItem, setDeliverItem] = useState(null)
  const [damageItem, setDamageItem] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchMode, setBatchMode] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter, search],
    queryFn: () => {
      const params = {}
      if (filter === 'urgent') params.urgent = '1'
      else if (filter === 'sla') params.sla_only = '1'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 30000,
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

  const counts = useMemo(() => {
    const all = items
    return {
      dirty:   all.filter(i => i.status === 'dirty').length,
      washing: all.filter(i => i.status === 'washing').length,
      ready:   all.filter(i => i.status === 'ready').length,
      sla:     violations.length,
    }
  }, [items, violations])

  const total = counts.dirty + counts.washing + counts.ready

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

  return (
    <div style={{ maxWidth: 880, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--display)', fontSize: 32, letterSpacing: 5,
              color: 'var(--text)', lineHeight: 1, marginBottom: 4,
            }}>
              ÇAMAŞIRHANE
            </h1>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1,
            }}>
              {total > 0 ? `${total} aktif kayıt` : 'Kayıt yok'}
              {violations.length > 0 && (
                <span style={{ color: 'var(--red)', marginLeft: 10 }}>
                  · {violations.length} SLA ihlali
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {batchMode && selectedIds.size > 0 && (
              <button
                className="btn btn-sm"
                style={{ background: 'var(--green)', color: '#000' }}
                onClick={handleBatchDeliver}
              >
                Toplu Teslim ({selectedIds.size})
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}
            >
              {batchMode ? 'İptal' : 'Toplu Seçim'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowNew(true)}
              style={{ letterSpacing: 1 }}
            >
              + YENİ KAYIT
            </button>
          </div>
        </div>
        {/* Gradient dekor çizgi */}
        <div style={{
          height: 1, marginTop: 14,
          background: 'linear-gradient(90deg, var(--accent), var(--blue), transparent)',
          opacity: 0.4,
        }} />
      </div>

      {/* ── SLA ALERT ──────────────────────────────────────── */}
      <SlaAlert violations={violations} />

      {/* ── KPI STRIP ──────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18,
      }}>
        <KpiCard label="Sepette"  value={counts.dirty}   color="var(--accent)" sub={total > 0 ? (counts.dirty/total)*100 : 0} />
        <KpiCard label="Yıkanan"  value={counts.washing} color="var(--blue)"   sub={total > 0 ? (counts.washing/total)*100 : 0} />
        <KpiCard label="Hazır"    value={counts.ready}   color="var(--green)"  sub={total > 0 ? (counts.ready/total)*100 : 0} />
        <KpiCard label="SLA İhlal" value={counts.sla}   color="var(--red)"    sub={null} />
      </div>

      {/* ── MACHINE STRIP ──────────────────────────────────── */}
      <MachineStrip machines={machines} />

      {/* ── SEARCH + FILTER ────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14,
        flexWrap: 'wrap', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', paddingTop: 6, paddingBottom: 6,
        marginLeft: -4, paddingLeft: 4,
      }}>
        <input
          className="form-input"
          style={{ width: 200, padding: '6px 11px', fontSize: 11 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ara (blok, oda, not)..."
        />
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1, paddingBottom: 2 }}>
          {FILTERS.map(f => {
            const cnt = f.key === 'all' ? null : counts[f.key] > 0 ? counts[f.key] : null
            return (
              <button
                key={f.key}
                className={`filter-chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {f.dot && (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: filter === f.key ? f.dot : 'var(--text3)',
                    flexShrink: 0, transition: 'background 0.2s',
                  }} />
                )}
                {f.label}
                {cnt != null && (
                  <span style={{
                    background: filter === f.key ? f.dot + '33' : 'var(--surface3)',
                    color: filter === f.key ? f.dot : 'var(--text3)',
                    borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
                  }}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ITEM LIST ──────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 100, background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 10,
              opacity: 0.4 - i * 0.1,
            }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState filter={filter} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, idx) => (
            <div key={item.id} className={`fade-up-${Math.min(idx, 4)}`}>
              <ItemCard
                item={item}
                machines={machines}
                onDeliver={setDeliverItem}
                onDamage={setDamageItem}
                selected={selectedIds.has(item.id)}
                onSelect={batchMode ? toggleSelect : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────── */}
      {showNew && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem && <DamageModal item={damageItem} onClose={() => setDamageItem(null)} />}
    </div>
  )
}
