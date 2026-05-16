import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { TABS } from './constants.js'
import { KPIRow, AlertsBar } from './components/Dashboard.jsx'
import MoreMenu from './components/MoreMenu.jsx'
import AdjustModal from './components/AdjustModal.jsx'
import CheckoutModal from './components/CheckoutModal.jsx'
import EditModal from './components/EditModal.jsx'
import CountModal from './components/CountModal.jsx'
import ReceiptModal from './components/ReceiptModal.jsx'
import WriteOffModal from './components/WriteOffModal.jsx'
import ItemDetailDrawer from './components/ItemDetailDrawer.jsx'
import TransferModal from './components/TransferModal.jsx'
import ItemsTab from './tabs/ItemsTab.jsx'
import ActivityTab from './tabs/ActivityTab.jsx'
import PurchasingTab from './tabs/PurchasingTab.jsx'
import LotsExpiryTab from './tabs/LotsExpiryTab.jsx'
import ReportsTab from './tabs/ReportsTab.jsx'

export default function InventoryPage() {
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const toastShownRef = useRef(false)
  const [activeTab, setActiveTab] = useState('stock')
  const [view, setView] = useState('grid')
  const [searchInput, setSearchInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const searchTimer = useRef(null)
  const [catFilter, setCatFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [adjustItem, setAdjustItem] = useState(null)
  const [checkoutItem, setCheckoutItem] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [writeOffItem, setWriteOffItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [transferItem, setTransferItem] = useState(null)
  const [poPrefill, setPoPrefill] = useState(null)
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
  const adjustMut = useMutation({ mutationFn: ({ id, delta, reason, location_id }) => api.patch(`/inventory/${id}/adjust`, { delta, reason, location_id }), onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['stock-by-location'] }); setAdjustItem(null) } })

  // Drawer'daki kart, items query'si yenilendiğinde güncel kalsın diye id'den taze item bul
  const liveDetailItem = useMemo(
    () => (detailItem ? items.find(i => i.id === detailItem.id) || null : null),
    [detailItem, items]
  )

  // Acilista dusuk/tukenmis stok varsa tek seferlik toast
  useEffect(() => {
    if (toastShownRef.current) return
    if (!stats || !items.length) return
    const total = (stats.low_stock || 0) + (stats.out_of_stock || 0)
    if (total > 0) {
      const out = stats.out_of_stock || 0
      const low = (stats.low_stock || 0) - out
      const msg = [out > 0 && `${out} ürün tükendi`, low > 0 && `${low} ürün düşük stokta`].filter(Boolean).join(' · ')
      addToast(`⚠ ${msg}`, 'warning')
      toastShownRef.current = true
    }
  }, [stats, items.length, addToast])

  // Sayfa-ici klavye kisayollari (form-input icinde tetiklenmez)
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n') { e.preventDefault(); setShowNew(true) }
      else if (e.key === 's') { e.preventDefault(); setShowCount(true) }
      else if (e.key === '/') {
        e.preventDefault()
        document.querySelector('input[placeholder^="Ara"]')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const forecastMap = useMemo(() => {
    const m = {}
    forecast.forEach(f => { m[f.id] = f })
    return m
  }, [forecast])

  const filtered = useMemo(() => {
    let list = items
    if (catFilter) list = list.filter(i => i.category === catFilter)
    if (searchQ.trim()) { const q = searchQ.toLowerCase(); list = list.filter(i => i.item_name.toLowerCase().includes(q) || (i.location || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)) }
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm" title="N tuşu" style={{ borderRadius: 10 }}>+ ÜRÜN</button>
          <MoreMenu items={[
            { icon: '↓', label: 'Mal Giriş', onClick: () => setShowReceipt(true) },
            { icon: '✓', label: 'Sayım Yap', onClick: () => setShowCount(true), hint: 'S' },
            { divider: true },
            { icon: '⤓', label: 'CSV İndir', onClick: () => api.get('/inventory/export/csv', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'envanter.csv'; a.click(); URL.revokeObjectURL(url) }) },
          ]} />
        </div>
      </div>

      {/* KPI + Uyarilar */}
      <KPIRow stats={stats} />
      <AlertsBar items={items} forecast={forecast} />

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
          setAdjustItem={setAdjustItem} setCheckoutItem={setCheckoutItem}
          setDetailItem={setDetailItem}
        />
      )}

      {/* TAB: AKTIVITE — teslimler + hareketler */}
      {activeTab === 'activity' && <ActivityTab />}

      {/* TAB: SATIN ALMA — siparis + talep + mal giris + tedarikci */}
      {activeTab === 'purchasing' && (
        <PurchasingTab
          items={items}
          poPrefill={poPrefill}
          onPrefillConsumed={() => setPoPrefill(null)}
          onNewReceipt={() => setShowReceipt(true)}
        />
      )}

      {/* TAB: LOT/SKT */}
      {activeTab === 'lots' && <LotsExpiryTab items={items} />}

      {/* TAB: RAPOR */}
      {activeTab === 'reports' && <ReportsTab />}

      {/* Modals */}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSave={d => adjustMut.mutate(d)} isPending={adjustMut.isPending} />}
      {checkoutItem && <CheckoutModal item={checkoutItem} onClose={() => setCheckoutItem(null)} />}
      {editItem && <EditModal item={editItem} onClose={() => setEditItem(null)} onSave={d => updateMut.mutate({ id: editItem.id, ...d })} isPending={updateMut.isPending} />}
      {showNew && <EditModal item={null} onClose={() => setShowNew(false)} onSave={d => createMut.mutate(d)} isPending={createMut.isPending} />}
      {showCount && <CountModal items={items} onClose={() => setShowCount(false)} />}
      {showReceipt && <ReceiptModal items={items} onClose={() => setShowReceipt(false)} />}
      {writeOffItem && <WriteOffModal item={writeOffItem} onClose={() => setWriteOffItem(null)} />}
      {transferItem && <TransferModal item={transferItem} onClose={() => setTransferItem(null)} />}
      {liveDetailItem && (
        <ItemDetailDrawer
          item={liveDetailItem}
          forecast={forecastMap[liveDetailItem.id]}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditItem(liveDetailItem); setDetailItem(null) }}
          onAdjust={() => { setAdjustItem(liveDetailItem); setDetailItem(null) }}
          onCheckout={() => { setCheckoutItem(liveDetailItem); setDetailItem(null) }}
          onWriteOff={() => { setWriteOffItem(liveDetailItem); setDetailItem(null) }}
          onDelete={() => { deleteMut.mutate(liveDetailItem.id); setDetailItem(null) }}
          onTransfer={() => { setTransferItem(liveDetailItem); setDetailItem(null) }}
          onGoToPO={() => {
            setPoPrefill({ itemId: liveDetailItem.id, supplierId: liveDetailItem.preferred_supplier_id })
            setActiveTab('purchasing')
            setDetailItem(null)
          }}
        />
      )}
    </div>
  )
}
