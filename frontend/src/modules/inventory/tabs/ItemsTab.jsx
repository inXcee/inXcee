import { CATEGORIES, cat, money } from '../constants.js'
import ItemCard from '../components/ItemCard.jsx'
import ActiveCheckoutsPanel from '../components/ActiveCheckoutsPanel.jsx'
import RecentMovements from '../components/RecentMovements.jsx'

export default function ItemsTab({
  searchInput, setSearchInput, setSearchQ, searchTimer,
  catFilter, setCatFilter,
  sortBy, setSortBy,
  view, setView,
  filtered, forecastMap,
  setAdjustItem, setCheckoutItem, setEditItem, setLogItem, setWriteOffItem,
  deleteMut,
}) {
  return (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '12px 16px',
      }}>
        <input className="form-input" value={searchInput}
          onChange={e => { const v = e.target.value; setSearchInput(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchQ(v), 150) }}
          placeholder="Urun veya konum ara..." style={{ flex: '1 1 180px', fontSize: '12px', borderRadius: '10px' }} />
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

      {/* Grid View */}
      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }} className="fade-up-2">
          {filtered.map(item => (
            <ItemCard key={item.id} item={item}
              onAdjust={setAdjustItem} onCheckout={setCheckoutItem} onEdit={setEditItem} onShowLog={setLogItem}
              onWriteOff={setWriteOffItem}
              onDelete={it => { if (window.confirm(`"${it.item_name}" silinsin mi?`)) deleteMut.mutate(it.id) }}
              forecastEntry={forecastMap[item.id]} />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.3 }}>▦</div>
              Urun bulunamadi
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {view === 'table' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }} className="fade-up-2">
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
          <div style={{ overflowX: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Urun bulunamadi</div>
            ) : (
              <table className="data-table" style={{ margin: 0 }}>
                <thead><tr><th>URUN</th><th>KAT.</th><th>STOK</th><th>ESIK</th><th>DURUM</th><th>KONUM</th><th>DEGER</th><th style={{ textAlign: 'center' }}>ISLEM</th></tr></thead>
                <tbody>
                  {filtered.map(item => {
                    const ct = cat(item.category)
                    const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold
                    const isOut = item.quantity === 0
                    const val = (item.quantity || 0) * (item.unit_price || 0)
                    return (
                      <tr key={item.id} style={{ background: isOut ? 'rgba(231,76,60,.02)' : isLow ? 'rgba(240,165,0,.02)' : undefined }}>
                        <td style={{ fontWeight: 600, fontSize: '12px' }}>
                          {item.item_name}
                          {forecastMap[item.id] && (
                            <span style={{
                              marginLeft: '8px',
                              fontFamily: 'var(--mono)',
                              fontSize: '9px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              letterSpacing: '0.5px',
                              background: forecastMap[item.id].severity === 'critical'
                                ? 'rgba(231,76,60,.15)' : 'rgba(240,165,0,.15)',
                              color: forecastMap[item.id].severity === 'critical'
                                ? 'var(--red)' : 'var(--amber)',
                              border: `1px solid ${forecastMap[item.id].severity === 'critical'
                                ? 'rgba(231,76,60,.3)' : 'rgba(240,165,0,.3)'}`,
                            }}>
                              ~{forecastMap[item.id].days_left}g
                            </span>
                          )}
                        </td>
                        <td><span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 600,
                          background: ct?.bg, color: ct?.color, fontFamily: 'var(--mono)' }}>{ct?.icon} {ct?.label}</span></td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: isOut ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--text)' }}>
                          {item.quantity} <span style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 400 }}>{item.unit}</span></td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '11px' }}>{item.reorder_threshold > 0 ? item.reorder_threshold : '-'}</td>
                        <td>{isOut ? <span className="badge badge-red" style={{ fontSize: '8px' }}>TUKENDI</span>
                          : isLow ? <span className="badge badge-amber" style={{ fontSize: '8px' }}>DUSUK</span>
                          : <span className="badge badge-green" style={{ fontSize: '8px' }}>OK</span>}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{item.location || '-'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>{money(val)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--green)', borderRadius: '6px' }} onClick={() => setAdjustItem(item)}>+/-</button>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--blue)', borderRadius: '6px' }} onClick={() => setCheckoutItem(item)}>TES</button>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--purple)', borderRadius: '6px' }} onClick={() => setLogItem(item)}>LOG</button>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--accent)', borderRadius: '6px' }} onClick={() => setEditItem(item)}>DUZ</button>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderRadius: '6px' }}
                              onClick={() => { if (confirm(`${item.item_name} silinsin mi?`)) deleteMut.mutate(item.id) }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Mini panels on stock tab */}
      <ActiveCheckoutsPanel />
      <RecentMovements />
    </>
  )
}
