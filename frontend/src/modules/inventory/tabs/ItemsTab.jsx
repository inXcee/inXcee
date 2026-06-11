import { useState, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { CATEGORIES } from '../constants.js'
import SimpleItemRow from '../components/SimpleItemRow.jsx'
import ActiveCheckoutsPanel from '../components/ActiveCheckoutsPanel.jsx'
import RecentMovements from '../components/RecentMovements.jsx'
import MoreMenu from '../components/MoreMenu.jsx'

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
        display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px',
      }}>
        <input className="form-input" value={searchInput}
          onChange={e => { const v = e.target.value; setSearchInput(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchQ(v), 150) }}
          placeholder="Ara: ürün, SKU, konum…" style={{ flex: '1 1 180px', fontSize: 12, borderRadius: 10 }} />
        <div style={{ display: 'flex', gap: 3 }}>
          <button onClick={() => setCatFilter('')} className={`btn btn-xs ${!catFilter ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 8 }}>TÜMÜ</button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)}
              className={`btn btn-xs ${catFilter === c.key ? 'btn-primary' : 'btn-ghost'}`}
              title={c.label}
              style={{ borderRadius: 8, ...(catFilter === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
              {c.icon}
            </button>
          ))}
        </div>
        <MoreMenu items={[
          { icon: '📷', label: 'Barkod tara', onClick: () => setShowQr(true) },
          { divider: true },
          { icon: '↕', label: 'A → Z', onClick: () => setSortBy('name'), hint: sortBy === 'name' ? '●' : '' },
          { icon: '↑', label: 'Az stok önce', onClick: () => setSortBy('qty-asc'), hint: sortBy === 'qty-asc' ? '●' : '' },
          { icon: '↓', label: 'Çok stok önce', onClick: () => setSortBy('qty-desc'), hint: sortBy === 'qty-desc' ? '●' : '' },
          { icon: '₺', label: 'Değere göre', onClick: () => setSortBy('value'), hint: sortBy === 'value' ? '●' : '' },
          { divider: true },
          { icon: '▦', label: 'Kart görünümü', onClick: () => setView('grid'), hint: view === 'grid' ? '●' : '' },
          { icon: '≡', label: 'Tablo görünümü', onClick: () => setView('table'), hint: view === 'table' ? '●' : '' },
        ]} />
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
