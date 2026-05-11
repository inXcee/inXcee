import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const MODULE_OPTIONS = ['', 'checkin', 'capacity', 'housekeeping', 'maintenance', 'discipline', 'inventory', 'checkout', 'users', 'shifts']
const ACTION_OPTIONS = ['', 'register', 'assign_room', 'checkout', 'inventory_add', 'inventory_update', 'inventory_in', 'inventory_out', 'user_create', 'user_update', 'user_delete']

export default function AuditPage() {
  const [filters, setFilters] = useState({ module: '', action: '', search: '', date_from: '', date_to: '' })
  const [limit, setLimit] = useState(50)

  const params = new URLSearchParams()
  params.set('limit', limit)
  if (filters.module) params.set('module', filters.module)
  if (filters.action) params.set('action', filters.action)
  if (filters.search) params.set('search', filters.search)
  if (filters.date_from) params.set('date_from', filters.date_from)
  if (filters.date_to) params.set('date_to', filters.date_to)

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-log', filters, limit],
    queryFn: () => api.get(`/dashboard/audit-log?${params}`).then(r => r.data),
  })

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>AUDIT LOG</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
          SISTEM ISLEM GECMISI
        </p>
      </div>

      {/* Filters */}
      <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">MODUL</label>
            <select className="form-select" style={{ width: '140px' }}
              value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}>
              <option value="">Tumunu</option>
              {MODULE_OPTIONS.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">ISLEM</label>
            <select className="form-select" style={{ width: '160px' }}
              value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
              <option value="">Tumunu</option>
              {ACTION_OPTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">ARAMA</label>
            <input className="form-input" style={{ width: '160px' }} placeholder="Detay ara..."
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">BASLANGIC</label>
            <input className="form-input" type="date" style={{ width: '140px' }}
              value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">BITIS</label>
            <input className="form-input" type="date" style={{ width: '140px' }}
              value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[50, 100, 200].map(n => (
              <button key={n} className={`filter-chip ${limit === n ? 'active' : ''}`} onClick={() => setLimit(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="panel fade-up-2">
        <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
        <div className="panel-header">
          <div className="panel-title">ISLEM KAYITLARI</div>
          <span className="badge badge-gray">{logs?.length || 0} kayit</span>
        </div>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Yukleniyor...</div>
          ) : (
            <table className="data-table responsive-stack">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kullanici</th>
                  <th>Modul</th>
                  <th>Islem</th>
                  <th>Detay</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map(log => (
                  <tr key={log.id}>
                    <td data-label="Tarih" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {log.created_at}
                    </td>
                    <td data-label="Kullanici" style={{ fontWeight: 500 }}>{log.user_name || '-'}</td>
                    <td data-label="Modul">
                      <span className="badge badge-blue" style={{ fontSize: '9px' }}>{log.module}</span>
                    </td>
                    <td data-label="Islem">
                      <span className="badge badge-amber" style={{ fontSize: '9px' }}>{log.action}</span>
                    </td>
                    <td data-label="Detay" style={{ fontSize: '12px', color: 'var(--text2)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.detail || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && (!logs || logs.length === 0) && (
            <div className="empty-state">
              <div className="empty-title">KAYIT YOK</div>
              <div className="empty-sub">Filtrelere uygun islem bulunamadi</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
