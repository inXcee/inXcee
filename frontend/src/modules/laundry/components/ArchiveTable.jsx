import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const mono = { fontFamily: 'var(--mono)' }

export default function ArchiveTable({ onSelectItem }) {
  const [filters, setFilters] = useState({ from: '', to: '', status: '', search: '', page: 1 })

  const { data, isLoading } = useQuery({
    queryKey: ['laundry-archive', filters],
    queryFn: () => laundryApi.getArchive(filters),
    keepPreviousData: true,
  })

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value, page: 1 }))
  }

  function setQuickRange(days) {
    const now = new Date()
    const from = new Date(now)
    if (days === 0) {
      from.setHours(0, 0, 0, 0)
    } else {
      from.setDate(now.getDate() - days)
    }
    setFilters(f => ({
      ...f, from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10), page: 1,
    }))
  }

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / (filters.limit || 50))

  const th = {
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
    color: 'var(--text3)', padding: '8px 10px', textAlign: 'left',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td = {
    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
    padding: '12px 10px', borderBottom: '1px solid var(--border)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filtre bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        padding: '12px 16px', background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 10,
      }}>
        <input type="date" className="form-input"
          style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, width: 130 }}
          value={filters.from} onChange={e => setFilter('from', e.target.value)} />
        <span style={{ ...mono, fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>—</span>
        <input type="date" className="form-input"
          style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, width: 130 }}
          value={filters.to} onChange={e => setFilter('to', e.target.value)} />
        <select className="form-input"
          style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6 }}
          value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">Tüm Durumlar</option>
          <option value="delivered">Teslim Edildi</option>
          <option value="lost">Kayıp</option>
        </select>
        <input type="search" className="form-input"
          style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, flex: 1, minWidth: 120 }}
          value={filters.search} onChange={e => setFilter('search', e.target.value)}
          placeholder="Oda no veya isim..." />
        {/* Hızlı aralık butonları */}
        {[['Bugün', 0], ['7 Gün', 7], ['30 Gün', 30]].map(([label, days]) => (
          <button key={label}
            onClick={() => setQuickRange(days)}
            style={{
              padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
              ...mono, fontSize: 10, color: 'var(--text2)',
            }}
          >{label}</button>
        ))}
        {(filters.from || filters.to || filters.status || filters.search) && (
          <button
            onClick={() => setFilters({ from: '', to: '', status: '', search: '', page: 1 })}
            style={{
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              ...mono, fontSize: 10, color: 'var(--text3)',
            }}
          >✕ Temizle</button>
        )}
      </div>

      {/* Özet */}
      <div style={{ ...mono, fontSize: 10, color: 'var(--text3)' }}>
        {isLoading ? 'Yükleniyor...' : `${total} kayıt`}
      </div>

      {/* Tablo */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['ODA', 'TESLİM EDEN', 'PARÇA', 'GİRİŞ', 'TESLİM', 'SÜRE', 'DURUM', 'DOĞRULAMA'].map(h => (
                <th key={h} style={{ ...th, textAlign: ['PARÇA', 'SÜRE'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={8} style={{ ...td, textAlign: 'center', padding: '32px', color: 'var(--text4)' }}>
                  Kayıt bulunamadı
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id}
                onClick={() => onSelectItem(item)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...td, fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, color: 'var(--text)' }}>
                  {item.block} · {item.room_no}
                </td>
                <td style={td}>{item.intake_name || '—'}</td>
                <td style={{ ...td, color: 'var(--accent)', textAlign: 'right' }}>{item.item_count}</td>
                <td style={{ ...td, color: 'var(--text3)' }}>{item.created_at?.slice(0, 10)}</td>
                <td style={{ ...td, color: 'var(--text3)' }}>{item.delivered_at?.slice(0, 10) || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{item.total_hours != null ? `${item.total_hours}s` : '—'}</td>
                <td style={td}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', borderRadius: 4, fontSize: 9,
                    background: item.status === 'delivered' ? 'rgba(39,201,106,0.12)' : 'rgba(231,76,60,0.12)',
                    border: `1px solid ${item.status === 'delivered' ? 'rgba(39,201,106,0.3)' : 'rgba(231,76,60,0.3)'}`,
                    color: item.status === 'delivered' ? 'var(--green)' : 'var(--red)',
                  }}>
                    {item.status === 'delivered' ? 'Teslim' : 'Kayıp'}
                  </span>
                </td>
                <td style={td}>
                  {item.all_present === 1 && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓</span>}
                  {item.all_present === 0 && <span style={{ color: 'var(--accent)', fontSize: 12 }}>⚠</span>}
                  {item.all_present == null && <span style={{ color: 'var(--text4)', fontSize: 10 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: filters.page <= 1 ? 'not-allowed' : 'pointer',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              ...mono, fontSize: 12, color: filters.page <= 1 ? 'var(--text4)' : 'var(--text2)',
            }}
          >←</button>
          <span style={{ ...mono, fontSize: 11, color: 'var(--text3)' }}>
            {filters.page} / {totalPages} ({total} kayıt)
          </span>
          <button
            disabled={filters.page >= totalPages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: filters.page >= totalPages ? 'not-allowed' : 'pointer',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              ...mono, fontSize: 12, color: filters.page >= totalPages ? 'var(--text4)' : 'var(--text2)',
            }}
          >→</button>
        </div>
      )}
    </div>
  )
}
