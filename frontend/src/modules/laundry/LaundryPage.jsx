import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import MachineStrip from './components/MachineStrip.jsx'
import ItemCard from './components/ItemCard.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import DeliveryModal from './components/DeliveryModal.jsx'
import DamageModal from './components/DamageModal.jsx'
import SlaAlert from './components/SlaAlert.jsx'

const FILTERS = [
  { key: 'all',     label: 'Tümü' },
  { key: 'dirty',   label: 'Sepet' },
  { key: 'washing', label: 'Yıkanan' },
  { key: 'ready',   label: 'Hazır' },
  { key: 'urgent',  label: 'Acil' },
  { key: 'sla',     label: 'SLA' },
  { key: 'lost',    label: 'Kayıp' },
]

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

  const counts = useMemo(() => ({
    dirty:   items.filter(i => i.status === 'dirty').length,
    washing: items.filter(i => i.status === 'washing').length,
    ready:   items.filter(i => i.status === 'ready').length,
    sla:     violations.length,
  }), [items, violations])

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
    <div style={{ maxWidth: 860, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
            ÇAMAŞIRHANE
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {batchMode && selectedIds.size > 0 && (
            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
              onClick={handleBatchDeliver}>
              Toplu Teslim ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
            {batchMode ? 'İptal' : 'Toplu'}
          </button>
          <button className="btn btn-primary"
            onClick={() => setShowNew(true)}>
            + Yeni Kayıt
          </button>
        </div>
      </div>

      {/* SLA ALERT */}
      <SlaAlert violations={violations} />

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',  value: counts.dirty,   color: 'var(--accent)' },
          { label: 'Yıkanan', value: counts.washing, color: 'var(--blue)' },
          { label: 'Hazır',   value: counts.ready,   color: 'var(--green)' },
          { label: 'SLA',     value: counts.sla,     color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="kpi-card panel" style={{ padding: '10px 12px', textAlign: 'center', borderTop: `2px solid ${s.color}` }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 2, color: s.color, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* MACHINE STRIP */}
      <MachineStrip machines={machines} />

      {/* SEARCH + FILTER */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" style={{ width: 200, padding: '5px 10px', fontSize: 11 }}
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Ara (blok, oda, not)..." />
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
          {FILTERS.map(f => (
            <button key={f.key}
              className={`filter-chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key !== 'all' && counts[f.key] > 0 && ` (${counts[f.key]})`}
            </button>
          ))}
        </div>
      </div>

      {/* ITEM LIST */}
      {isLoading ? (
        <div className="empty-state">
          <div className="empty-sub">Yükleniyor...</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧺</div>
          <div className="empty-title">KAYIT YOK</div>
          <div className="empty-sub">
            {filter !== 'all' ? 'Bu filtrede kayıt bulunamadı' : 'Henüz çamaşır kaydı yok'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

      {/* MODALS */}
      {showNew && <NewItemModal onClose={() => setShowNew(false)} />}
      {deliverItem && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem && <DamageModal item={damageItem} onClose={() => setDamageItem(null)} />}
    </div>
  )
}
