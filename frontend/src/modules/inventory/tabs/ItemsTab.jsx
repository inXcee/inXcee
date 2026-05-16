import { useState, lazy, Suspense } from 'react'
import { CATEGORIES } from '../constants.js'
import SimpleItemRow from '../components/SimpleItemRow.jsx'
import ActiveCheckoutsPanel from '../components/ActiveCheckoutsPanel.jsx'
import RecentMovements from '../components/RecentMovements.jsx'

const QrScannerModal = lazy(() => import('../../../shared/components/QrScannerModal.jsx'))

export default function ItemsTab({
  searchInput, setSearchInput, setSearchQ, searchTimer,
  catFilter, setCatFilter,
  sortBy, setSortBy,
  view, setView,
  filtered, forecastMap,
  setAdjustItem, setCheckoutItem,
  setDetailItem,
}) {
  const [showQr, setShowQr] = useState(false)

  function handleScan(text) {
    const v = text.trim()
    setSearchInput(v)
    clearTimeout(searchTimer.current)
    setSearchQ(v)
    navigator.vibrate?.([20])
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px',
      }}>
        <input className="form-input" value={searchInput}
          onChange={e => { const v = e.target.value; setSearchInput(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchQ(v), 150) }}
          placeholder="Urun, SKU veya konum ara..." style={{ flex: '1 1 180px', fontSize: '12px', borderRadius: '10px' }} />
        <button onClick={() => setShowQr(true)} className="btn btn-ghost btn-xs"
          aria-label="Barkod ile ara"
          title="Barkod tara"
          style={{ borderRadius: '8px', fontSize: '14px', padding: '5px 10px' }}>
          📷
        </button>
        <div style={{ display: 'flex', gap: '3px' }}>
          <button onClick={() => setCatFilter('')} className={`btn btn-xs ${!catFilter ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TUMU</button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)}
              className={`btn btn-xs ${catFilter === c.key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '8px', ...(catFilter === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
              {c.icon}
            </button>
          ))}
        </div>
        <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ width: 'auto', fontSize: '10px', padding: '5px 8px', borderRadius: '8px' }}>
          <option value="name">A-Z</option>
          <option value="qty-asc">Az stok</option>
          <option value="qty-desc">Cok stok</option>
          <option value="value">Deger</option>
        </select>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px' }}>
          <button onClick={() => setView('grid')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px',
            background: view === 'grid' ? 'var(--surface3)' : 'transparent', color: view === 'grid' ? 'var(--text)' : 'var(--text3)', fontWeight: 600, transition: 'all .15s' }}>▦</button>
          <button onClick={() => setView('table')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '11px',
            background: view === 'table' ? 'var(--surface3)' : 'transparent', color: view === 'table' ? 'var(--text)' : 'var(--text3)', fontWeight: 600, transition: 'all .15s' }}>≡</button>
        </div>
      </div>

      {/* Grid (cards) */}
      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }} className="fade-up-2">
          {filtered.map(item => (
            <SimpleItemRow key={item.id} item={item} view="cards"
              forecast={forecastMap[item.id]}
              onAdjust={(it) => setAdjustItem(it)}
              onCheckout={(it) => setCheckoutItem(it)}
              onDetail={() => setDetailItem(item)} />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.3 }}>▦</div>
              Urun bulunamadi
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {view === 'table' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }} className="fade-up-2">
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
          <div style={{ overflowX: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Urun bulunamadi</div>
            ) : (
              <table className="data-table" style={{ margin: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th>URUN</th>
                    <th>KAT.</th>
                    <th>KONUM</th>
                    <th style={{ textAlign: 'right' }}>STOK</th>
                    <th style={{ textAlign: 'right' }}>ESIK</th>
                    <th style={{ textAlign: 'right' }}>DEGER</th>
                    <th style={{ textAlign: 'right' }}>ISLEM</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <SimpleItemRow key={item.id} item={item} view="table"
                      forecast={forecastMap[item.id]}
                      onAdjust={(it) => setAdjustItem(it)}
                      onCheckout={(it) => setCheckoutItem(it)}
                      onDetail={() => setDetailItem(item)} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Mini panels on stock tab */}
      <ActiveCheckoutsPanel />
      <RecentMovements />

      {showQr && (
        <Suspense fallback={null}>
          <QrScannerModal open={showQr} onScan={handleScan} onClose={() => setShowQr(false)}
            title="Ürün Barkodunu Okutun" />
        </Suspense>
      )}
    </>
  )
}
