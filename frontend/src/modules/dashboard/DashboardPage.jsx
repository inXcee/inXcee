import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import KPICard from './KPICard.jsx'
import HeatMap from './HeatMap.jsx'
import { useNotifications } from '../../shared/hooks/useNotifications.js'
import { useAuthStore } from '../../shared/store/authStore.js'

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

  return (
    <div className="panel">
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--teal))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">YATAK DOLULUK RAPORU</div>
          <div className="panel-subtitle">BLOK BAZLI KAPASİTE DURUMU</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: barColor(totals.pct), lineHeight: 1 }}>
              %{totals.pct}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px' }}>GENEL DOLULUK</div>
          </div>
        </div>
      </div>
      <div className="panel-body">
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'TOPLAM YATAK', value: totals.total_beds, color: 'var(--text)' },
            { label: 'DOLU', value: totals.occupied, color: 'var(--accent)' },
            { label: 'BOŞ', value: totals.empty, color: 'var(--green)' },
            { label: 'TOPLAM ODA', value: totals.total_rooms, color: 'var(--blue)' },
            { label: 'AKTİF ODA', value: totals.active_rooms, color: 'var(--teal)' },
            { label: 'BAKIM / KARANTİNA', value: totals.maintenance_rooms + totals.quarantine_rooms, color: totals.quarantine_rooms > 0 ? 'var(--red)' : 'var(--text3)' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '10px 12px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: '8px',
            }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Per-block breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {blocks.map(b => {
            const color = barColor(b.pct)
            return (
              <div key={b.block} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: '8px',
              }}>
                <div style={{
                  fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '2px',
                  color: b.block.startsWith('M') ? 'var(--blue)' : 'var(--purple)',
                  width: '36px', flexShrink: 0,
                }}>{b.block}</div>

                {/* Progress bar */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
                      {b.occupied} / {b.total_beds} yatak dolu
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color, fontWeight: 700 }}>
                      %{b.pct}
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${b.pct}%`, height: '100%', borderRadius: '3px',
                      background: color, transition: 'width .6s ease',
                    }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--green)', lineHeight: 1 }}>{b.empty}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px' }}>BOŞ</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--text2)', lineHeight: 1 }}>{b.total_rooms}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px' }}>ODA</div>
                  </div>
                  {(b.maintenance_rooms > 0 || b.quarantine_rooms > 0) && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--red)', lineHeight: 1 }}>
                        {b.maintenance_rooms + b.quarantine_rooms}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px' }}>
                        {b.quarantine_rooms > 0 ? 'KARANT.' : 'BAKIM'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AuditLogPanel() {
  const { data: logs = [] } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => api.get('/dashboard/audit-log?limit=20').then(r => r.data),
    refetchInterval: 60000,
  })

  const actionLabels = {
    discipline_card: 'Disiplin Kartı',
    discipline_delete: 'Kart Silme',
    blacklist_add: 'Kara Listeye Ekleme',
    blacklist_remove: 'Kara Listeden Çıkarma',
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
  }

  if (logs.length === 0) return null

  return (
    <div className="panel" style={{ marginBottom: '28px' }}>
      <div className="panel-header">
        <div>
          <div className="panel-title">SON İŞLEMLER</div>
          <div className="panel-subtitle">DENETİM KAYDI</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '0', maxHeight: '300px', overflowY: 'auto' }}>
        {logs.map(log => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 20px', borderBottom: '1px solid rgba(35,45,63,.3)',
            fontSize: '12px',
          }}>
            <span className={`badge badge-${log.action.includes('delete') || log.action.includes('quarantine') ? 'red' : 'blue'}`} style={{ fontSize: '8px', padding: '2px 6px' }}>
              {actionLabels[log.action] || log.action}
            </span>
            <span style={{ flex: 1, color: 'var(--text2)' }}>{log.detail || '—'}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
              {log.user_name} · {new Date(log.created_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isManager = user?.role === 'campus_manager'

  // Role-based dashboards (#10)
  if (user?.role === 'technical') return <TechnicianDashboard />
  if (user?.role === 'housekeeper') return <HousekeeperDashboard />

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
  const criticalNotifs = notifications.filter(n => n.type === 'critical').slice(0, 3)

  const occupancyColor = !kpi ? 'blue' : kpi.occupancy_pct > 95 ? 'red' : kpi.occupancy_pct > 80 ? 'orange' : 'green'
  const highOccBlocks = heatmap.filter(b => b.pct >= 90)

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>DASHBOARD</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            ŞANTİYE YATAKHANE — GENEL DURUM
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isManager && <ExportButtons />}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="live-dot" />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>CANLI</span>
          </div>
        </div>
      </div>

      {/* Alert banners */}
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
          <span>
            <strong>{highOccBlocks.map(b => b.block).join(', ')} blok</strong> %90 üzeri dolulukta
          </span>
        </div>
      )}

      {/* KPI Cards */}
      {kpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' }} className="fade-up-1">
          <KPICard icon="👤" label="Aktif Personel" value={kpi.active_personnel} color="blue" />
          <KPICard
            icon="🛏" label="Doluluk" value={`${kpi.occupancy_pct}%`}
            color={occupancyColor} subtitle={`${kpi.occupied}/${kpi.total_beds} yatak`}
            barPct={kpi.occupancy_pct}
          />
          <KPICard
            icon="🔧" label="Açık Arıza" value={kpi.open_maintenance}
            color={kpi.open_maintenance > 5 ? 'red' : 'green'}
          />
          <KPICard
            icon="🏠" label="Karantina" value={kpi.quarantine_rooms}
            color={kpi.quarantine_rooms > 0 ? 'orange' : 'green'}
          />
        </div>
      )}

      {/* Bed Occupancy Report */}
      <div className="sect fade-up-2">
        <div className="sect-title">YATAK DOLULUK</div>
        <div className="sect-line" />
      </div>
      <div style={{ marginBottom: '28px' }} className="fade-up-2">
        <BedOccupancyPanel data={bedOccupancy} />
      </div>

      {/* Blok Durumu */}
      <div className="sect fade-up-3">
        <div className="sect-title">BLOK DURUMU</div>
        <div className="sect-line" />
      </div>
      <div style={{ marginBottom: '28px' }} className="fade-up-3">
        <HeatMap data={heatmap} />
      </div>

      {/* Aktif Arızalar */}
      <div className="panel fade-up-4" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">AKTİF ARIZALAR</div>
            <div className="panel-subtitle">AÇIK TEKNİK TALEPLER</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => navigate('/maintenance')}>
            Tümü →
          </button>
        </div>
        <div className="panel-body" style={{ padding: '10px 20px' }}>
          {maintRequests.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <div className="empty-icon">✓</div>
              <div className="empty-sub">Açık arıza yok</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: '0 24px' }}>
              {maintRequests.slice(0, 6).map(req => (
                <div key={req.id} className="maint-row">
                  <PriorityBar priority={req.priority} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12.5px', color: 'var(--text)', fontWeight: 500, marginBottom: '3px' }}>
                      {req.description?.slice(0, 50)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.5px' }}>
                      {req.location}
                      {req.wait_reason && (
                        <span style={{ color: 'var(--amber)', marginLeft: '6px' }}> · {req.wait_reason}</span>
                      )}
                    </div>
                  </div>
                  <span className={`badge badge-${req.priority === 'high' ? 'red' : req.priority === 'medium' ? 'amber' : 'blue'}`}>
                    {req.priority === 'high' ? 'ACİL' : req.priority === 'medium' ? 'NORMAL' : 'DÜŞÜK'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Projection */}
      {projection.length > 0 && (
        <div className="panel fade-up-4" style={{ marginBottom: '28px' }}>
          <div className="panel-header">
            <div>
              <div className="panel-title">14 GÜN PROJEKSİYON</div>
              <div className="panel-subtitle">AYRILACAK PERSONEL</div>
            </div>
            <span className="badge badge-amber">TAHMİN</span>
          </div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))', gap: '8px' }}>
            {projection.map(p => (
              <div key={p.block} style={{
                background: 'var(--surface2)', borderRadius: '7px', padding: '10px 8px', textAlign: 'center',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '4px' }}>{p.block} BLOK</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--accent)', letterSpacing: '1px' }}>{p.c}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>kişi</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Log (#3) — only for campus_manager */}
      {isManager && (
        <div className="fade-up-4">
          <div className="sect">
            <div className="sect-title">DENETİM KAYDI</div>
            <div className="sect-line" />
          </div>
          <AuditLogPanel />
        </div>
      )}
    </div>
  )
}
