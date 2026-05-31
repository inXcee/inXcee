import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import HelpHint from '../../shared/components/HelpHint.jsx'
import api from '../../shared/api/client.js'
import KPICard from './KPICard.jsx'
import HeatMap from './HeatMap.jsx'
import TrendChartsSection from './TrendChartsSection.jsx'
import ManagementWidgets from './ManagementWidgets.jsx'
import TodaysPulse from './TodaysPulse.jsx'
import UpcomingEvents from './UpcomingEvents.jsx'
import HealthScoreWidget from './HealthScoreWidget.jsx'
import ComplianceWidget from './ComplianceWidget.jsx'
import AnomalyAlerts from './AnomalyAlerts.jsx'
import DateRangeFilter from './DateRangeFilter.jsx'
import { useDateRange } from './useDateRange.js'
import { useNotifications } from '../../shared/hooks/useNotifications.js'
import { useOccupancy } from '../../shared/hooks/useOccupancy.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { blockColor } from '../../shared/blocks.js'
import DashCard from './DashCard.jsx'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'

function PriorityBar({ priority }) {
  const cls = priority === 'high' ? 'pri-high' : priority === 'medium' ? 'pri-mid' : 'pri-low'
  return <div className={`maint-pri ${cls}`} />
}

function BedOccupancyPanel({ data }) {
  if (!data) return null
  const { blocks, totals } = data

  const barColor = (pct) => {
    if (pct >= 90) return 'var(--red)'
    if (pct >= 70) return 'var(--accent)'
    return 'var(--green)'
  }

  const summary = [
    { label: 'Toplam yatak', value: totals.total_beds },
    { label: 'Dolu', value: totals.occupied },
    { label: 'Boş', value: totals.empty },
    { label: 'Toplam oda', value: totals.total_rooms },
    { label: 'Aktif oda', value: totals.active_rooms },
    {
      label: totals.quarantine_rooms > 0 ? 'Bakım / karantina' : 'Bakım',
      value: totals.maintenance_rooms + totals.quarantine_rooms,
      color: totals.quarantine_rooms > 0 ? 'var(--red)' : undefined,
    },
  ]

  return (
    <DashCard
      title="Yatak doluluk"
      action={
        <div style={{
          fontSize: '22px', fontWeight: 700, color: barColor(totals.pct),
          lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
        }}>
          %{totals.pct}
        </div>
      }
    >
      {/* Summary numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {summary.map(s => (
          <div key={s.label}>
            <div style={{
              fontSize: '26px', fontWeight: 700, color: s.color || 'var(--text)',
              lineHeight: 1, letterSpacing: '-0.025em',
              fontVariantNumeric: 'tabular-nums',
            }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-block breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {blocks.map(b => {
          const color = barColor(b.pct)
          return (
            <div key={b.block} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: '13px', fontWeight: 700,
                color: blockColor(b.block),
                width: '36px', flexShrink: 0,
                letterSpacing: '-0.005em',
              }}>{b.block}</div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
                    {b.occupied} / {b.total_beds}
                  </span>
                  <span style={{ fontSize: '12px', color, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                    %{b.pct}
                  </span>
                </div>
                <div style={{ height: '5px', background: 'var(--surface3)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${b.pct}%`, height: '100%',
                    background: color, borderRadius: '3px',
                    transition: 'width .5s ease',
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', flexShrink: 0, fontSize: '11px' }}>
                <div style={{ textAlign: 'right', minWidth: '32px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>{b.empty}</div>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>boş</div>
                </div>
                {(b.maintenance_rooms > 0 || b.quarantine_rooms > 0) && (
                  <div style={{ textAlign: 'right', minWidth: '32px' }}>
                    <div style={{ color: 'var(--red)', fontWeight: 500 }}>{b.maintenance_rooms + b.quarantine_rooms}</div>
                    <div style={{ color: 'var(--text3)', fontSize: '10px' }}>
                      {b.quarantine_rooms > 0 ? 'karant.' : 'bakım'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DashCard>
  )
}

function AuditLogPanel({ globalFrom, globalTo }) {
  const [auditSearch, setAuditSearch] = useState('')
  const [auditModule, setAuditModule] = useState('')
  const [auditLimit, setAuditLimit] = useState(30)

  const auditParams = new URLSearchParams()
  auditParams.set('limit', auditLimit)
  if (auditSearch) auditParams.set('search', auditSearch)
  if (auditModule) auditParams.set('module', auditModule)
  if (globalFrom) auditParams.set('date_from', globalFrom)
  if (globalTo) auditParams.set('date_to', globalTo)

  const { data: logs = [] } = useQuery({
    queryKey: ['audit-log', auditSearch, auditModule, globalFrom, globalTo, auditLimit],
    queryFn: () => api.get(`/dashboard/audit-log?${auditParams}`).then(r => r.data),
    refetchInterval: 60000,
  })

  const actionLabels = {
    discipline_card: 'Disiplin Kartı',
    discipline_delete: 'Kart Silme',
    blacklist_add: 'Kara Listeye Ekleme',
    blacklist_remove: 'Kara Listeden Çıkarma',
    auto_blacklist: 'Otomatik Kara Liste',
    personnel_register: 'Personel Kaydı',
    room_assign: 'Oda Ataması',
    room_reassign: 'Oda Değişikliği',
    room_remove: 'Odadan Çıkarma',
    room_quarantine: 'Karantina',
    room_maintenance: 'Bakım',
    room_activate: 'Oda Aktif',
    bulk_room_status: 'Toplu Oda Durum',
    bulk_checkout: 'Toplu Çıkış',
    bulk_assign: 'Toplu Oda Atama',
    bulk_remove: 'Toplu Odadan Çıkarma',
    assign: 'Teknisyen Atama',
    start: 'İş Başlat',
    submit_review: 'İncelemeye Gönder',
    reject: 'Teknisyen Red',
    inventory_add: 'Stok Ekleme',
    inventory_update: 'Stok Güncelleme',
    inventory_in: 'Stok Giriş',
    inventory_out: 'Stok Çıkış',
  }

  const modules = [...new Set(logs.map(l => l.module).filter(Boolean))]

  return (
    <DashCard
      title="Son işlemler"
      bodyStyle={{ padding: 0 }}
      action={<span style={{ fontSize: '11px', color: 'var(--text3)' }}>{logs.length} kayıt{(globalFrom || globalTo) ? ' · seçili aralık' : ''}</span>}
    >
      {/* Filters */}
      <div style={{ padding: '8px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
          placeholder="Ara…" style={{ fontSize: '12px', width: '160px', padding: '6px 10px', flex: '1 1 120px', maxWidth: '240px' }} />
        <select className="form-select" value={auditModule} onChange={e => setAuditModule(e.target.value)}
          style={{ fontSize: '12px', padding: '6px 8px', width: 'auto' }}>
          <option value="">Tüm modüller</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {(auditSearch || auditModule) && (
          <button className="btn btn-ghost btn-xs" onClick={() => { setAuditSearch(''); setAuditModule('') }}>Temizle</button>
        )}
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setAuditLimit(l => l + 30)}>Daha fazla</button>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {logs.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>Kayıt bulunamadı</div>
        )}
        {logs.map(log => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: '12px',
          }}>
            <span style={{
              fontSize: '11px', color: 'var(--text2)', minWidth: '120px',
              fontWeight: 500,
            }}>
              {actionLabels[log.action] || log.action}
            </span>
            <span style={{ flex: '1 1 120px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {log.detail || '—'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0 }}>
              {log.user_name} · {new Date(log.created_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </DashCard>
  )
}

function ExportButtons() {
  const download = (path, name) => {
    api.get(path, { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => download('/dashboard/export/personnel', 'personel-listesi.csv')}>
        Personel CSV
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => download('/dashboard/export/occupancy', 'oda-doluluk.csv')}>
        Doluluk CSV
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => download('/dashboard/export/maintenance', 'arizalar.csv')}>
        Arızalar CSV
      </button>
      <span style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => download('/reports/housekeeping', 'temizlik-raporu.pdf')}>
        Temizlik PDF
      </button>
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--amber)' }} onClick={() => download('/reports/maintenance', 'bakim-raporu.pdf')}>
        Bakım PDF
      </button>
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--blue)' }} onClick={() => download('/reports/occupancy', 'doluluk-raporu.pdf')}>
        Doluluk PDF
      </button>
      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--purple)' }} onClick={() => download('/reports/discipline', 'disiplin-raporu.pdf')}>
        Disiplin PDF
      </button>
    </div>
  )
}

// ── Role-based Dashboard Views (#10) ──────────────────────────────────────

function TechnicianDashboard() {
  const navigate = useNavigate()
  const { data: stats } = useQuery({
    queryKey: ['maintenance-stats'],
    queryFn: () => api.get('/maintenance/stats').then(r => r.data),
    refetchInterval: 30000,
  })
  const { data: openRequests = [] } = useQuery({
    queryKey: ['maintenance-open'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data),
    refetchInterval: 15000,
  })
  const { data: available = [] } = useQuery({
    queryKey: ['technicians-available'],
    queryFn: () => api.get('/maintenance/technicians/available').then(r => r.data),
    refetchInterval: 30000,
  })

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px' }}>TEKNİK SERVİS</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          TEKNİSYEN PANELİ
        </p>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: '3px solid var(--red)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--red)', lineHeight: 1 }}>{stats.open}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>AÇIK ARIZA</div>
          </div>
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: '3px solid var(--accent)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--accent)', lineHeight: 1 }}>{stats.waiting}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BEKLEMEDE</div>
          </div>
          {stats.overdue > 0 && (
            <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)', borderRadius: '10px', borderTop: '3px solid var(--red)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--red)', lineHeight: 1 }}>{stats.overdue}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1.5px', marginTop: '6px' }}>SLA AŞILDI</div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px' }}>
        MÜSAİT TEKNİSYENLER ({available.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {available.map(t => (
          <div key={t.id} style={{
            padding: '8px 14px', background: 'rgba(39,201,106,.06)', border: '1px solid rgba(39,201,106,.2)',
            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{t.full_name}</div>
            {t.phone && <a href={`tel:${t.phone}`} style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>{t.phone}</a>}
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">AÇIK ARIZALAR</div>
            <div className="panel-subtitle">{openRequests.length} KAYIT</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/maintenance')}>Tümünü Gör</button>
        </div>
        <div className="panel-body" style={{ padding: '10px 20px' }}>
          {openRequests.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <div className="empty-icon">&#10003;</div>
              <div className="empty-sub">Açık arıza yok</div>
            </div>
          ) : openRequests.slice(0, 10).map(req => (
            <div key={req.id} className="maint-row" onClick={() => navigate('/maintenance')} style={{ cursor: 'pointer' }}>
              <PriorityBar priority={req.priority} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>{req.description?.slice(0, 60)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {req.location}
                  {req.sla_deadline && new Date(req.sla_deadline) < new Date() && (
                    <span style={{ color: 'var(--red)', marginLeft: '6px', fontWeight: 700 }}>SLA AŞILDI</span>
                  )}
                </div>
              </div>
              <span className={`badge badge-${req.priority === 'high' ? 'red' : req.priority === 'medium' ? 'amber' : 'blue'}`}>
                {req.priority === 'high' ? 'ACİL' : req.priority === 'medium' ? 'NORMAL' : 'DÜŞÜK'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HousekeeperDashboard() {
  const navigate = useNavigate()
  const { data: tasks = [] } = useQuery({
    queryKey: ['cleaning-tasks'],
    queryFn: () => api.get('/housekeeping/tasks').then(r => r.data).catch(() => []),
    refetchInterval: 30000,
  })

  const pending = tasks.filter(t => !t.completed_at && !t.skipped)
  const completed = tasks.filter(t => t.completed_at)

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px' }}>TEMİZLİK</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          TEMİZLİK GÖREVLİSİ PANELİ
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: '3px solid var(--accent)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--accent)', lineHeight: 1 }}>{pending.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BEKLEYEN GÖREV</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: '3px solid var(--green)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--green)', lineHeight: 1 }}>{completed.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>TAMAMLANAN</div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={() => navigate('/housekeeping')} style={{ marginBottom: '20px' }}>
        Temizlik Sayfasına Git
      </button>

      {pending.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">BEKLEYEN GÖREVLER</div>
              <div className="panel-subtitle">{pending.length} GÖREV</div>
            </div>
          </div>
          <div className="panel-body" style={{ padding: '0' }}>
            {pending.slice(0, 8).map(task => (
              <div key={task.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 20px', borderBottom: '1px solid rgba(35,45,63,.3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{task.area}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                    {task.block} {task.floor ? `Kat ${task.floor}` : ''} · {task.task_type}
                  </div>
                </div>
                <span className="badge badge-amber">BEKLEMEDE</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LaundryDashboard() {
  const navigate = useNavigate()
  const { data: summary } = useQuery({
    queryKey: ['laundry-summary'],
    queryFn: () => api.get('/laundry/summary').then(r => r.data).catch(() => null),
    refetchInterval: 30000,
  })
  const { data: ready = [] } = useQuery({
    queryKey: ['laundry-ready'],
    queryFn: () => api.get('/laundry/items?status=ready').then(r => r.data).catch(() => []),
    refetchInterval: 30000,
  })
  const c = summary?.counts || {}
  const cards = [
    { label: 'KİRLİ / BEKLEYEN', value: c.dirty || 0, color: 'var(--text3)' },
    { label: 'YIKANIYOR', value: c.washing || 0, color: 'var(--blue)' },
    { label: 'ÜTÜDE', value: c.ironing || 0, color: 'var(--accent)' },
    { label: 'TESLİME HAZIR', value: c.ready || 0, color: 'var(--green)' },
  ]

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', letterSpacing: '4px' }}>ÇAMAŞIRHANE</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
          ÇAMAŞIRHANE PANELİ
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {cards.map(s => (
          <div key={s.label} style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
        {summary?.urgent > 0 && (
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)', borderRadius: '10px', borderTop: '3px solid var(--red)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--red)', lineHeight: 1 }}>{summary.urgent}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1.5px', marginTop: '6px' }}>ACİL</div>
          </div>
        )}
        {summary?.delivered_today > 0 && (
          <div style={{ flex: 1, minWidth: '120px', padding: '16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', borderTop: '3px solid var(--green)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '36px', color: 'var(--green)', lineHeight: 1 }}>{summary.delivered_today}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '6px' }}>BUGÜN TESLİM</div>
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={() => navigate('/laundry')} style={{ marginBottom: '20px' }}>
        Çamaşırhane Sayfasına Git
      </button>

      {ready.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">TESLİME HAZIR</div>
              <div className="panel-subtitle">{ready.length} ÖĞE</div>
            </div>
          </div>
          <div className="panel-body" style={{ padding: '0' }}>
            {ready.slice(0, 10).map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid rgba(35,45,63,.3)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>
                    {it.room_no ? `Oda ${it.room_no}` : (it.intake_name || '—')}{it.block ? ` · ${it.block}` : ''}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                    {it.item_count} parça{it.is_premium ? ' · premium' : ''}
                  </div>
                </div>
                <span className={`badge badge-${it.urgent ? 'red' : 'green'}`}>{it.urgent ? 'ACİL' : 'HAZIR'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isManager = user?.role === 'campus_manager'

  // Role-based dashboards (#10)
  if (user?.role === 'technical') return <TechnicianDashboard />
  if (user?.role === 'housekeeper') return <HousekeeperDashboard />
  if (user?.role === 'laundry') return <LaundryDashboard />

  const { days, from: globalFrom, to: globalTo, label: rangeLabel } = useDateRange()

  const { data: kpi } = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: () => api.get('/dashboard/kpi').then(r => r.data),
    refetchInterval: 30000,
  })
  const { data: heatmap = [] } = useQuery({
    queryKey: ['dashboard-heatmap'],
    queryFn: () => api.get('/dashboard/heatmap').then(r => r.data),
    refetchInterval: 30000,
  })
  const { data: bedOccupancy } = useQuery({
    queryKey: ['dashboard-bed-occupancy'],
    queryFn: () => api.get('/dashboard/bed-occupancy').then(r => r.data),
    refetchInterval: 30000,
  })
  const { data: projection = [] } = useQuery({
    queryKey: ['dashboard-projection'],
    queryFn: () => api.get('/dashboard/projection').then(r => r.data),
  })
  const { data: maintRequests = [] } = useQuery({
    queryKey: ['dashboard-maintenance-open'],
    queryFn: () => api.get('/maintenance/requests?status=open').then(r => r.data),
    refetchInterval: 60000,
  })

  const { notifications } = useNotifications()
  useOccupancy()
  const criticalNotifs = notifications.filter(n => n.type === 'critical').slice(0, 3)

  const occupancyColor = !kpi ? 'blue' : kpi.occupancy_pct > 95 ? 'red' : kpi.occupancy_pct > 80 ? 'orange' : 'green'
  const highOccBlocks = heatmap.filter(b => b.pct >= 90)

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.025em', textTransform: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Dashboard<HelpHint topic="dashboard" title="Dashboard" />
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '6px', letterSpacing: '-0.005em' }}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '20px',
            background: 'color-mix(in srgb, var(--green) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)',
            fontSize: '11px', color: 'var(--green)', fontWeight: 600, letterSpacing: '-0.005em',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
            Canlı
          </div>
          <DateRangeFilter />
          {isManager && <ExportButtons />}
        </div>
      </div>

      {isManager && <ManagementWidgets />}

      {/* Alert banners — full width */}
      {criticalNotifs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {criticalNotifs.map(n => (
            <div key={n.id} className="alert alert-danger">
              <span>!</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{n.message}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: '8px' }}>
                  {n.module} · {new Date(n.created_at).toLocaleString('tr-TR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {highOccBlocks.length > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: '16px' }}>
          <span>!</span>
          <span><strong>{highOccBlocks.map(b => b.block).join(', ')} blok</strong> %90 üzeri dolulukta</span>
        </div>
      )}

      {/* Bento grid */}
      <div className="bento-grid fade-up-stagger">
        {/* KPI 4'lü — span 8 (D1c: yüklenirken skeleton) */}
        {!kpi && (
          <div className="bento-cell bento-span-8">
            <SkeletonGrid count={4} minWidth={170} lines={2} />
          </div>
        )}
        {kpi && (
          <div className="bento-cell bento-span-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
            <KPICard label="Aktif personel" value={kpi.active_personnel} />
            <KPICard
              label="Doluluk" value={`${kpi.occupancy_pct}%`}
              color={occupancyColor} subtitle={`${kpi.occupied}/${kpi.total_beds} yatak`}
              barPct={kpi.occupancy_pct}
            />
            <KPICard
              label="Açık arıza" value={kpi.open_maintenance}
              color={kpi.open_maintenance > 5 ? 'red' : 'green'}
            />
            <KPICard
              label="Karantina" value={kpi.quarantine_rooms}
              color={kpi.quarantine_rooms > 0 ? 'orange' : 'green'}
            />
          </div>
        )}

        {/* Sağ panel #1 — Sağlık Skoru (Faz 3) */}
        <div className="bento-cell bento-span-4">
          <HealthScoreWidget />
        </div>

        {/* Yatak Doluluk — span 8 */}
        <div className="bento-cell bento-span-8">
          <BedOccupancyPanel data={bedOccupancy} />
        </div>

        {/* Sağ panel placeholder #2 — Bugünün Nabzı (Faz 2) */}
        <div className="bento-cell bento-span-4">
          <TodaysPulse />
        </div>

        {/* Trend grafikleri — span 8 (mevcut TrendChartsSection 2x2 internal grid'i yapıyor) */}
        <div className="bento-cell bento-span-8">
          <TrendChartsSection days={days} label={rangeLabel} />
        </div>

        {/* Sağ panel #3 — Yaklaşan Etkinlikler */}
        <div className="bento-cell bento-span-4">
          <UpcomingEvents />
        </div>

        {/* İSG Uyum Durumu — sadece campus_manager/shift_supervisor — span 4 */}
        {isManager && (
          <div className="bento-cell bento-span-4">
            <ComplianceWidget />
          </div>
        )}

        {/* Blok HeatMap — span 12 */}
        <div className="bento-cell bento-span-12">
          <DashCard title="Blok durumu">
            <HeatMap data={heatmap} />
          </DashCard>
        </div>

        {/* Anomali uyarıları */}
        <div className="bento-cell bento-span-12">
          <AnomalyAlerts />
        </div>

        {/* Aktif Arızalar — span 7 */}
        <div className="bento-cell bento-span-7">
          <DashCard
            title="Aktif arızalar"
            action={
              <button className="btn btn-ghost btn-xs" onClick={() => navigate('/maintenance')}>
                Tümü →
              </button>
            }
          >
            {maintRequests.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>
                Açık arıza yok
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {maintRequests.slice(0, 6).map((req, i, arr) => {
                  const sigColor = req.priority === 'high' ? 'var(--red)' : req.priority === 'medium' ? 'var(--accent)' : 'var(--text3)'
                  const sigLabel = req.priority === 'high' ? 'Acil' : req.priority === 'medium' ? 'Normal' : 'Düşük'
                  return (
                    <div key={req.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 0',
                      borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{
                        fontSize: '11px', minWidth: '54px', color: sigColor, fontWeight: 600,
                      }}>{sigLabel}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, marginBottom: '2px' }}>
                          {req.description?.slice(0, 60)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                          {req.location}
                          {req.wait_reason && (
                            <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>· {req.wait_reason}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </DashCard>
        </div>

        {/* 14 Gün Projeksiyon — span 5 */}
        {projection.length > 0 && (
          <div className="bento-cell bento-span-5">
            <DashCard
              title="14 gün projeksiyon"
              action={<span style={{ fontSize: '11px', color: 'var(--text3)' }}>Tahmin</span>}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))', gap: '10px' }}>
                {projection.map(p => (
                  <div key={p.block} style={{
                    textAlign: 'center', padding: '12px 8px',
                    background: 'var(--surface2)', borderRadius: '10px',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>{p.block}</div>
                    <div style={{
                      fontSize: '24px', fontWeight: 700, color: 'var(--text)',
                      letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    }}>{p.c}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>kişi</div>
                  </div>
                ))}
              </div>
            </DashCard>
          </div>
        )}

        {/* Denetim Kaydı — sadece campus_manager — span 12 */}
        {isManager && (
          <div className="bento-cell bento-span-12">
            <AuditLogPanel globalFrom={globalFrom} globalTo={globalTo} />
          </div>
        )}
      </div>
    </div>
  )
}
