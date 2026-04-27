import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { TABS } from './constants.js'
import { KPIRow, CategoryChart, LowStockAlert } from './components/Dashboard.jsx'
import AdjustModal from './components/AdjustModal.jsx'
import CheckoutModal from './components/CheckoutModal.jsx'
import LogModal from './components/LogModal.jsx'
import EditModal from './components/EditModal.jsx'
import CountModal from './components/CountModal.jsx'
import ReceiptModal from './components/ReceiptModal.jsx'
import ItemsTab from './tabs/ItemsTab.jsx'
import ReceiptsTab from './tabs/ReceiptsTab.jsx'
import CheckoutsTab from './tabs/CheckoutsTab.jsx'
import MovementsTab from './tabs/MovementsTab.jsx'
import SuppliersTab from './tabs/SuppliersTab.jsx'
import PurchaseOrdersTab from './tabs/PurchaseOrdersTab.jsx'

export default function InventoryPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('stock')
  const [view, setView] = useState('grid')
  const [searchInput, setSearchInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const searchTimer = useRef(null)
  const [catFilter, setCatFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [adjustItem, setAdjustItem] = useState(null)
  const [checkoutItem, setCheckoutItem] = useState(null)
  const [logItem, setLogItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showCount, setShowCount] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['inv-recent-moves'] }) }

  const { data: items = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => api.get('/inventory').then(r => r.data) })
  const { data: stats } = useQuery({ queryKey: ['inventory-stats'], queryFn: () => api.get('/inventory/stats').then(r => r.data), staleTime: 15000 })
  const { data: forecast = [] } = useQuery({
    queryKey: ['inventory-forecast'],
    queryFn: () => api.get('/inventory/forecast').then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })

  const createMut = useMutation({ mutationFn: d => api.post('/inventory', d), onSuccess: () => { inv(); setShowNew(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => api.put(`/inventory/${id}`, d), onSuccess: () => { inv(); setEditItem(null) } })
  const deleteMut = useMutation({ mutationFn: id => api.delete(`/inventory/${id}`), onSuccess: inv })
  const adjustMut = useMutation({ mutationFn: ({ id, delta, reason }) => api.patch(`/inventory/${id}/adjust`, { delta, reason }), onSuccess: () => { inv(); setAdjustItem(null) } })

  const forecastMap = useMemo(() => {
    const m = {}
    forecast.forEach(f => { m[f.id] = f })
    return m
  }, [forecast])

  const filtered = useMemo(() => {
    let list = items
    if (catFilter) list = list.filter(i => i.category === catFilter)
    if (searchQ.trim()) { const q = searchQ.toLowerCase(); list = list.filter(i => i.item_name.toLowerCase().includes(q) || (i.location || '').toLowerCase().includes(q)) }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.item_name.localeCompare(b.item_name)
      if (sortBy === 'qty-asc') return a.quantity - b.quantity
      if (sortBy === 'qty-desc') return b.quantity - a.quantity
      if (sortBy === 'value') return (b.quantity * (b.unit_price || 0)) - (a.quantity * (a.unit_price || 0))
      return 0
    })
  }, [items, searchQ, catFilter, sortBy])

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: '1100px' }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '5px', color: 'var(--text)', margin: 0 }}>
            ENVANTER<HelpHint topic="inventory" title="ENVANTER" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '5px', letterSpacing: '1.5px' }}>STOK TAKİP · MAL GİRİŞ · MALZEME TESLİM · SAYIM</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => api.get('/inventory/export/csv', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'envanter.csv'; a.click(); URL.revokeObjectURL(url) })} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px' }}>CSV</button>
          <button onClick={() => setShowCount(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px' }}>SAYIM</button>
          <button onClick={() => setShowReceipt(true)} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px', color: 'var(--green)' }}>↓ MAL GIRIS</button>
          <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px' }}>+ URUN</button>
        </div>
      </div>

      {/* KPI + Chart */}
      <KPIRow stats={stats} />
      <CategoryChart stats={stats} />
      <LowStockAlert items={items} />

      {forecast.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
          background: forecast.some(i => i.severity === 'critical')
            ? 'rgba(231,76,60,.08)' : 'rgba(240,165,0,.08)',
          border: `1px solid ${forecast.some(i => i.severity === 'critical')
            ? 'rgba(231,76,60,.25)' : 'rgba(240,165,0,.25)'}`,
        }}>
          <span style={{ fontSize: '16px' }}>⌛</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '3px' }}>
              TÜKENME YAKLAŞAN
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: forecast.some(i => i.severity === 'critical') ? 'var(--red)' : 'var(--amber)' }}>
              {forecast.filter(i => i.severity === 'critical').length > 0 && (
                <span style={{ marginRight: '10px' }}>
                  🔴 {forecast.filter(i => i.severity === 'critical').length} ürün ≤3 gün:{' '}
                  {forecast.filter(i => i.severity === 'critical').map(i => `${i.item_name} (~${i.days_left}g)`).join(', ')}
                </span>
              )}
              {forecast.filter(i => i.severity === 'warning').length > 0 && (
                <span>
                  🟡 {forecast.filter(i => i.severity === 'warning').length} ürün ≤7 gün
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '16px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '4px',
      }} className="fade-up-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: '10px',
            background: activeTab === t.key ? 'var(--accent)' : 'transparent',
            color: activeTab === t.key ? '#000' : 'var(--text3)',
            fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '1.5px',
            cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <span style={{ fontSize: '13px' }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* TAB: STOCK */}
      {activeTab === 'stock' && (
        <ItemsTab
          searchInput={searchInput} setSearchInput={setSearchInput} setSearchQ={setSearchQ} searchTimer={searchTimer}
          catFilter={catFilter} setCatFilter={setCatFilter}
          sortBy={sortBy} setSortBy={setSortBy}
          view={view} setView={setView}
          filtered={filtered} forecastMap={forecastMap}
          setAdjustItem={setAdjustItem} setCheckoutItem={setCheckoutItem} setEditItem={setEditItem} setLogItem={setLogItem}
          deleteMut={deleteMut}
        />
      )}

      {/* TAB: RECEIPT */}
      {activeTab === 'receipt' && <ReceiptsTab onNewReceipt={() => setShowReceipt(true)} />}

      {/* TAB: CHECKOUTS */}
      {activeTab === 'checkouts' && <CheckoutsTab />}

      {/* TAB: SUPPLIERS */}
      {activeTab === 'suppliers' && <SuppliersTab />}

      {/* TAB: PURCHASE ORDERS */}
      {activeTab === 'po' && <PurchaseOrdersTab items={items} />}

      {/* TAB: HISTORY */}
      {activeTab === 'history' && <MovementsTab />}

      {/* Modals */}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={d => adjustMut.mutate(d)} isPending={adjustMut.isPending} />}
      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} />}
      {logItem && <LogModal item={logItem} onClose={() => setLogItem(null)} />}
      {editItem && <EditModal item={editItem} onClose={() => setEditItem(null)} onSave={d => updateMut.mutate({ id: editItem.id, ...d })} isPending={updateMut.isPending} />}
      {showNew && <EditModal item={null} onClose={() => setShowNew(false)} onSave={d => createMut.mutate(d)} isPending={createMut.isPending} />}
      {showCount && <CountModal items={items} onClose={() => setShowCount(false)} />}
      {showReceipt && <ReceiptModal items={items} onClose={() => setShowReceipt(false)} />}
    </div>
  )
}
