import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const SEVERITY_LABEL = { info: 'Bilgi', warning: 'Uyarı', critical: 'Kritik' }
const SEVERITY_COLOR = { info: 'var(--blue)', warning: 'var(--accent)', critical: 'var(--red)' }
const SEVERITY_ICON  = { info: 'ℹ', warning: '⚠', critical: '🚨' }

function timeAgo(iso) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)   return `${Math.max(1, Math.floor(diff))}sn`
  if (diff < 3600) return `${Math.floor(diff/60)}dk`
  if (diff < 86400) return `${Math.floor(diff/3600)}sa`
  if (diff < 30*86400) return `${Math.floor(diff/86400)}g`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function Kpi({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 12px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 24, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.5, marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function NotificationsCenterPage() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState({
    module: '', severity: '', from: '', to: '', q: '', unread_only: '0',
  })
  const [page, setPage] = useState(1)
  const limit = 20

  const params = useMemo(() => {
    const p = { page, limit }
    if (filters.module)   p.module = filters.module
    if (filters.severity) p.severity = filters.severity
    if (filters.from)     p.from = filters.from
    if (filters.to)       p.to = filters.to
    if (filters.q)        p.q = filters.q
    if (filters.unread_only === '1') p.unread_only = '1'
    return p
  }, [filters, page])

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-center', params],
    queryFn: () => api.get('/notifications', { params }).then(r => r.data),
    keepPreviousData: true,
  })
  const items = data?.items || []
  const total = data?.total || 0

  const { data: modules = [] } = useQuery({
    queryKey: ['notif-modules'],
    queryFn: () => api.get('/notification-prefs/modules').then(r => r.data),
  })

  // Yönetici stats (campus_manager) — 403 dönerse sessizce yutulur
  const { data: stats } = useQuery({
    queryKey: ['notif-stats'],
    queryFn: () => api.get('/notifications/stats?days=7').then(r => r.data).catch(() => null),
    retry: false,
  })

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-center'] }),
  })
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-center'] }),
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-center'] }),
  })
  const clearRead = useMutation({
    mutationFn: () => api.post('/notifications/clear-read'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-center'] }),
  })

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>BİLDİRİM MERKEZİ</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
          {total} kayıt · Sayfa {page}/{totalPages}
        </p>
        <Link to="/notifications/preferences"
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
            padding: '6px 12px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text2)', textDecoration: 'none',
          }}>⚙ TERCİHLER</Link>
      </div>

      {/* Stats (campus_manager) */}
      {stats?.matrix && (
        <div className="panel fade-up-1" style={{ marginBottom: 12 }}>
          <div className="panel-header"><div className="panel-title">SON 7 GÜN — DAĞILIM</div></div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
              <Kpi label="TOPLAM" value={stats.total} />
              <Kpi label="OKUNMAMIŞ" value={stats.unread} color="var(--accent)" />
              <Kpi label="MODÜL" value={new Set(stats.matrix.map(r => r.module)).size} />
              <Kpi label="KRİTİK"
                value={stats.matrix.filter(r => r.severity === 'critical').reduce((s, r) => s + r.count, 0)}
                color="var(--red)" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {stats.matrix.slice(0, 24).map((r, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: r.severity === 'critical' ? 'var(--red)' : r.severity === 'warning' ? 'var(--accent)' : 'var(--blue)',
                }}>
                  {r.module} · {r.severity} · {r.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtre çubuğu */}
      <div className="panel fade-up-1" style={{ marginBottom: 12 }}>
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input value={filters.q}
            onChange={e => { setFilters(f => ({ ...f, q: e.target.value })); setPage(1) }}
            placeholder="Mesaj ara..."
            className="form-input" style={{ flex: '1 1 200px', minWidth: 160, height: 32 }} />
          <select value={filters.module}
            onChange={e => { setFilters(f => ({ ...f, module: e.target.value })); setPage(1) }}
            className="form-input" style={{ flex: '0 0 150px', height: 32 }}>
            <option value="">Tüm modüller</option>
            {modules.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select value={filters.severity}
            onChange={e => { setFilters(f => ({ ...f, severity: e.target.value })); setPage(1) }}
            className="form-input" style={{ flex: '0 0 120px', height: 32 }}>
            <option value="">Tüm kritiklik</option>
            <option value="info">Bilgi</option>
            <option value="warning">Uyarı</option>
            <option value="critical">Kritik</option>
          </select>
          <input type="date" value={filters.from}
            onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1) }}
            className="form-input" style={{ flex: '0 0 130px', height: 32 }} />
          <input type="date" value={filters.to}
            onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1) }}
            className="form-input" style={{ flex: '0 0 130px', height: 32 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11 }}>
            <input type="checkbox"
              checked={filters.unread_only === '1'}
              onChange={() => { setFilters(f => ({ ...f, unread_only: f.unread_only === '1' ? '0' : '1' })); setPage(1) }}
              style={{ accentColor: 'var(--accent)' }} />
            Sadece okunmamış
          </label>
          <button onClick={() => { setFilters({ module: '', severity: '', from: '', to: '', q: '', unread_only: '0' }); setPage(1) }}
            style={{
              padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
            }}>✕ Sıfırla</button>
        </div>
      </div>

      {/* Toplu aksiyon */}
      <div className="fade-up-2" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => markAll.mutate()}
          style={{
            padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
          }}>✓ Tümünü okundu işaretle</button>
        <button onClick={async () => { if (await confirmDialog({ title: 'Okunmuşları Temizle', body: 'Okunmuş tüm bildirimleri silmek istediğinize emin misiniz?', danger: true })) clearRead.mutate() }}
          style={{
            padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
          }}>🗑 Okunmuşları temizle</button>
      </div>

      {/* Liste */}
      <div className="panel fade-up-2">
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isLoading && <SkeletonTable rows={5} cols={4} />}
          {!isLoading && items.length === 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', padding: 20, textAlign: 'center' }}>
              Bildirim yok
            </div>
          )}
          {items.map(n => {
            const sev = n.severity || n.type || 'info'
            const unread = !n.is_read
            return (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: unread ? 'rgba(240,165,0,0.06)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${SEVERITY_COLOR[sev]}`,
                borderRadius: 6,
              }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>{SEVERITY_ICON[sev]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', wordBreak: 'break-word' }}>
                    {n.message}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: SEVERITY_COLOR[sev] }}>{SEVERITY_LABEL[sev]}</span>
                    {n.module && <span>· {n.module}</span>}
                    {n.event_kind && <span>· {n.event_kind}</span>}
                    <span>· {timeAgo(n.created_at)}</span>
                  </div>
                </div>
                {n.link && (
                  <Link to={n.link}
                    onClick={() => unread && markRead.mutate(n.id)}
                    style={{
                      fontSize: 10, fontFamily: 'var(--mono)', padding: '4px 8px',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
                      color: 'var(--accent)', textDecoration: 'none',
                    }}>Git →</Link>
                )}
                {unread && (
                  <button onClick={() => markRead.mutate(n.id)}
                    title="Okundu işaretle"
                    style={{
                      width: 26, height: 26, background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 4, color: 'var(--green)', cursor: 'pointer', fontSize: 12,
                    }}>✓</button>
                )}
                <button onClick={() => remove.mutate(n.id)}
                  title="Sil"
                  style={{
                    width: 26, height: 26, background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--red)', cursor: 'pointer', fontSize: 12,
                  }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Paginate */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{
              padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text2)', cursor: page === 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, opacity: page === 1 ? 0.5 : 1,
            }}>← Önceki</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, alignSelf: 'center', color: 'var(--text3)' }}>
            {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            style={{
              padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text2)', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, opacity: page >= totalPages ? 0.5 : 1,
            }}>Sonraki →</button>
        </div>
      )}
    </div>
  )
}
