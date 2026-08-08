import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'
import './PersonnelTrackingCenter.css'

const EVENT_LABELS = {
  tracking_started: 'Takip başlangıcı', employment_started: 'İşe giriş', assignment_changed: 'Atama değişikliği',
  temporary_project_work: 'Geçici çalışma', shift_changed: 'Vardiya revizyonu', leave_changed: 'İzin / rapor',
  overtime_changed: 'Fazla mesai', absence_recorded: 'Devamsızlık', offboarding_started: 'Çıkış başladı',
  employment_ended: 'İşten çıkış', employment_restored: 'Geri işe alma',
}
const STATUS_LABELS = { active: 'Aktif', offboarding: 'Çıkış sürecinde', exited: 'İşten çıktı' }
const SEVERITY_LABELS = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function rangeDates(key) {
  const end = new Date()
  const start = new Date(end)
  if (key === 'month') start.setDate(1)
  else if (key === 'year') { start.setMonth(0); start.setDate(1) }
  else start.setDate(start.getDate() - (Number(key || 30) - 1))
  return { from: isoDate(start), to: isoDate(end) }
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

function dateTime(value) {
  if (!value) return '—'
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

function compactValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item ?? '—'}`).join(' · ')
  return String(value)
}

function distribution(rows, key, fallback) {
  const counts = new Map()
  rows.forEach(row => {
    const label = row[key] || fallback
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function KpiCard({ label, value, sub, tone = 'blue' }) {
  return (
    <div className={`tracking-kpi tracking-kpi--${tone}`}>
      <span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}
    </div>
  )
}

function DistributionBars({ title, items }) {
  const max = Math.max(1, ...items.map(item => item.value))
  return (
    <section className="tracking-card">
      <div className="tracking-card__header"><div><strong>{title}</strong><span>{items.reduce((sum, item) => sum + item.value, 0)} personel</span></div></div>
      <div className="tracking-bars">
        {items.slice(0, 8).map(item => (
          <div className="tracking-bar" key={item.label}>
            <div><span title={item.label}>{item.label}</span><b>{item.value}</b></div>
            <i><span style={{ width: `${(item.value / max) * 100}%` }} /></i>
          </div>
        ))}
        {!items.length && <div className="tracking-empty">Dağılım verisi yok.</div>}
      </div>
    </section>
  )
}

function RuleRow({ rule, onSave, pending }) {
  const [draft, setDraft] = useState(() => ({ ...rule, enabled: !!rule.enabled }))
  const patch = (key, value) => setDraft(previous => ({ ...previous, [key]: value }))
  return (
    <div className="tracking-rule">
      <label className="tracking-rule__toggle"><input type="checkbox" checked={draft.enabled} onChange={event => patch('enabled', event.target.checked)} /><span /></label>
      <div className="tracking-rule__copy"><strong>{rule.label}</strong><span>{rule.description}</span></div>
      <label><span>Dönem</span><input type="number" min="0" max="3660" value={draft.window_days} onChange={event => patch('window_days', Number(event.target.value))} /></label>
      <label><span>Eşik</span><input type="number" min="0" step="0.5" value={draft.threshold_primary} onChange={event => patch('threshold_primary', Number(event.target.value))} /></label>
      <label><span>Önem</span><select value={draft.severity} onChange={event => patch('severity', event.target.value)}><option value="info">Bilgi</option><option value="warning">Uyarı</option><option value="critical">Kritik</option></select></label>
      <label><span>Hedef gün</span><input type="number" min="0" max="365" value={draft.due_days} onChange={event => patch('due_days', Number(event.target.value))} /></label>
      <button type="button" className="btn btn-primary btn-xs" disabled={pending} onClick={() => onSave({
        rule_key: rule.rule_key, enabled: draft.enabled, window_days: draft.window_days,
        threshold_primary: draft.threshold_primary, threshold_secondary: draft.threshold_secondary,
        severity: draft.severity, due_days: draft.due_days,
      })}>Kaydet</button>
    </div>
  )
}

export default function PersonnelTrackingCenter({ projects = [], departments = [], onPersonClick }) {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)
  const [showSettings, setShowSettings] = useState(false)
  const range = params.get('range') || '30'
  const defaults = rangeDates(range === 'custom' ? '30' : range)
  const q = params.get('q') || ''
  const debouncedQ = useDebounce(q, 250)
  const filters = {
    from: params.get('from') || defaults.from,
    to: params.get('to') || defaults.to,
    project_id: params.get('project_id') || '', department_id: params.get('department_id') || '',
    status: params.get('status') || '', event_type: params.get('event_type') || '', q: debouncedQ,
  }
  const requestFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
  const setFilter = (key, value) => setParams(previous => {
    const next = new URLSearchParams(previous)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    return next
  }, { replace: true })
  const setRange = key => {
    const dates = rangeDates(key === 'custom' ? '30' : key)
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('view', 'tracking'); next.set('range', key)
      if (key === 'custom') {
        if (!next.get('from')) next.set('from', dates.from)
        if (!next.get('to')) next.set('to', dates.to)
      } else { next.set('from', dates.from); next.set('to', dates.to) }
      return next
    }, { replace: true })
  }

  const overview = useQuery({ queryKey: ['personnel-tracking-overview', requestFilters], queryFn: () => api.get('/personnel/tracking/overview', { params: requestFilters }).then(response => response.data) })
  const people = useQuery({ queryKey: ['personnel-tracking-people', requestFilters], queryFn: () => api.get('/personnel/tracking/people', { params: requestFilters }).then(response => response.data) })
  const events = useQuery({ queryKey: ['personnel-tracking-events', requestFilters], queryFn: () => api.get('/personnel/tracking/events', { params: { ...requestFilters, limit: 100 } }).then(response => response.data) })
  const alerts = useQuery({ queryKey: ['personnel-tracking-alerts'], queryFn: () => api.get('/personnel/tracking/alerts', { params: { limit: 100 } }).then(response => response.data) })
  const rules = useQuery({ queryKey: ['personnel-tracking-settings'], queryFn: () => api.get('/personnel/tracking/settings').then(response => response.data), enabled: showSettings })
  const refresh = () => ['personnel-tracking-overview', 'personnel-tracking-people', 'personnel-tracking-events', 'personnel-tracking-alerts', 'personnel-tracking-settings'].forEach(key => queryClient.invalidateQueries({ queryKey: [key] }))
  const followupMutation = useMutation({ mutationFn: alertId => api.post(`/personnel/tracking/alerts/${alertId}/followup`, {}), onSuccess: () => { refresh(); useToastStore.getState().addToast('Uyarı takip görevine dönüştürüldü', 'success') }, onError: error => useToastStore.getState().addToast(error.response?.data?.error || 'Görev oluşturulamadı', 'error') })
  const alertMutation = useMutation({ mutationFn: ({ id, status }) => api.patch(`/personnel/tracking/alerts/${id}`, { status }), onSuccess: refresh })
  const ruleMutation = useMutation({ mutationFn: rule => api.patch('/personnel/tracking/settings', { rules: [rule] }), onSuccess: () => { refresh(); useToastStore.getState().addToast('Takip kuralı güncellendi', 'success') }, onError: error => useToastStore.getState().addToast(error.response?.data?.error || 'Kural güncellenemedi', 'error') })

  const kpi = overview.data?.kpis || {}
  const peopleRows = people.data?.items || []
  const eventRows = events.data?.items || []
  const visiblePersonIds = useMemo(() => new Set(peopleRows.map(person => Number(person.id))), [peopleRows])
  const alertRows = (alerts.data?.items || []).filter(alert => ['open', 'acknowledged'].includes(alert.status) && visiblePersonIds.has(Number(alert.staff_id)))
  const projectDistribution = useMemo(() => distribution(peopleRows, 'project_name', 'Proje atanmamış'), [peopleRows])
  const departmentDistribution = useMemo(() => distribution(peopleRows, 'department_name', 'Departman atanmamış'), [peopleRows])
  const maxTrend = Math.max(1, ...(overview.data?.trends || []).map(item => Number(item.shift_changes || 0) + Number(item.movements || 0) + Number(item.exits || 0)))

  return (
    <div className="personnel-tracking-center">
      <section className="tracking-filterbar" aria-label="Takip merkezi filtreleri">
        <div className="tracking-range" aria-label="Rapor dönemi">
          {[['7', '7 gün'], ['30', '30 gün'], ['90', '90 gün'], ['month', 'Bu ay'], ['year', 'Bu yıl'], ['custom', 'Özel']].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>
          ))}
        </div>
        <div className="tracking-filtergrid">
          <input aria-label="Takip merkezinde personel ara" className="form-input" value={q} onChange={event => setFilter('q', event.target.value)} placeholder="Personel, TC, telefon veya pozisyon ara" />
          <select aria-label="Takip merkezi proje filtresi" className="form-select" value={filters.project_id} onChange={event => setFilter('project_id', event.target.value)}><option value="">Tüm projeler</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="none">Proje atanmamış</option></select>
          <select aria-label="Takip merkezi departman filtresi" className="form-select" value={filters.department_id} onChange={event => setFilter('department_id', event.target.value)}><option value="">Tüm departmanlar</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label="Takip merkezi durum filtresi" className="form-select" value={filters.status} onChange={event => setFilter('status', event.target.value)}><option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="offboarding">Çıkış sürecinde</option><option value="exited">İşten çıktı</option></select>
          <select aria-label="Takip merkezi olay filtresi" className="form-select" value={filters.event_type} onChange={event => setFilter('event_type', event.target.value)}><option value="">Tüm hareketler</option>{Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          {range === 'custom' && <><input aria-label="Başlangıç tarihi" type="date" className="form-input" value={filters.from} onChange={event => setFilter('from', event.target.value)} /><input aria-label="Bitiş tarihi" type="date" className="form-input" value={filters.to} onChange={event => setFilter('to', event.target.value)} /></>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>Yenile</button>
          <button type="button" className={`btn btn-sm ${showSettings ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowSettings(value => !value)}>Uyarı Kuralları</button>
        </div>
        <div className="tracking-filterbar__meta"><span>{filters.from} → {filters.to}</span><span>{people.data?.total || 0} personel</span><span>{events.data?.total || 0} hareket</span></div>
      </section>

      {[overview, people, events, alerts].some(query => query.isError) && <div className="tracking-error" role="alert">Takip verilerinin bir bölümü alınamadı. Bağlantıyı kontrol edip Yenile ile tekrar deneyin.</div>}

      {showSettings && (
        <section className="tracking-settings">
          <div className="tracking-card__header"><div><strong>Uyarı kuralları</strong><span>Eşik, dönem, önem ve hedef süre</span></div>{user?.role !== 'campus_manager' && <span>Salt okunur</span>}</div>
          {rules.isLoading ? <SkeletonGrid count={3} minWidth={260} /> : (rules.data?.rules || []).map(rule => user?.role === 'campus_manager'
            ? <RuleRow key={rule.rule_key} rule={rule} pending={ruleMutation.isPending} onSave={payload => ruleMutation.mutate(payload)} />
            : <div className="tracking-rule tracking-rule--readonly" key={rule.rule_key}><div className="tracking-rule__copy"><strong>{rule.label}</strong><span>{rule.description}</span></div><b>{rule.threshold_primary} / {rule.window_days} gün · {SEVERITY_LABELS[rule.severity]}</b></div>)}
        </section>
      )}

      {overview.isLoading ? <SkeletonGrid count={8} minWidth={130} /> : (
        <div className="tracking-kpis">
          <KpiCard label="Aktif" value={number(kpi.active)} tone="green" /><KpiCard label="Çıkış sürecinde" value={number(kpi.offboarding)} tone="amber" /><KpiCard label="İşten çıkan" value={number(kpi.exited)} tone="muted" />
          <KpiCard label="Yeni başlayan" value={number(kpi.hired)} /><KpiCard label="Kalıcı transfer" value={number(kpi.permanent_movements)} tone="purple" /><KpiCard label="Geçici proje" value={number(kpi.temporary_project_work)} tone="purple" />
          <KpiCard label="Vardiya revizyonu" value={number(kpi.shift_changes)} /><KpiCard label="İzin / rapor" value={`${number(Number(kpi.annual_leave_days || 0) + Number(kpi.sick_leave_days || 0) + Number(kpi.other_leave_days || 0), 1)}g`} sub={`${number(kpi.sick_leave_days, 1)}g rapor`} tone="amber" />
          <KpiCard label="Fazla mesai" value={`${number(kpi.overtime_hours, 1)}s`} /><KpiCard label="Devamsızlık" value={`${number(kpi.absent_days)}g`} tone="red" /><KpiCard label="Açık aksiyon" value={number(kpi.open_alerts)} tone="amber" /><KpiCard label="Gecikmiş / kritik" value={`${number(kpi.overdue_alerts)} / ${number(kpi.critical_alerts)}`} tone="red" />
        </div>
      )}

      <div className="tracking-dashboard-grid">
        <section className="tracking-card tracking-card--wide">
          <div className="tracking-card__header"><div><strong>Aylık hareket eğilimi</strong><span>Vardiya, atama ve çıkış hareketleri</span></div></div>
          <div className="tracking-trend" aria-label="Aylık hareket grafiği">
            {(overview.data?.trends || []).map(item => {
              const total = Number(item.shift_changes || 0) + Number(item.movements || 0) + Number(item.exits || 0)
              return <div key={item.month} className="tracking-trend__month"><div title={`${total} hareket`}><i style={{ height: `${Math.max(4, (total / maxTrend) * 100)}%` }} /></div><strong>{total}</strong><span>{item.month}</span></div>
            })}
            {!overview.data?.trends?.length && <div className="tracking-empty">Seçili dönemde hareket yok.</div>}
          </div>
        </section>
        <DistributionBars title="Proje dağılımı" items={projectDistribution} />
        <DistributionBars title="Departman dağılımı" items={departmentDistribution} />
      </div>

      <section className="tracking-card">
        <div className="tracking-card__header"><div><strong>Personel karşılaştırması</strong><span>Seçili dönemin izin, mesai, devamsızlık ve hareket toplamları</span></div></div>
        {people.isLoading ? <SkeletonGrid count={5} minWidth={240} /> : <div className="tracking-table-wrap"><table className="data-table tracking-people-table"><thead><tr><th>PERSONEL</th><th>PROJE / DEPARTMAN</th><th>SON HAREKET</th><th>İZİN</th><th>RAPOR</th><th>MESAİ</th><th>DEVAMSIZLIK</th><th>VARDİYA Δ</th><th>TRANSFER</th><th>AKSİYON</th><th /></tr></thead><tbody>
          {peopleRows.map(person => <tr key={person.id} onClick={() => onPersonClick?.(person.id)}>
            <td><strong>{person.full_name}</strong><span className={`tracking-status tracking-status--${person.employment_status}`}>{STATUS_LABELS[person.employment_status]}</span></td>
            <td>{person.project_name || 'Proje yok'}<small>{person.department_name || 'Departman yok'}</small></td><td>{EVENT_LABELS[person.last_event_type] || '—'}<small>{dateTime(person.last_event_at)}</small></td>
            <td>{number(person.annual_leave_days, 1)}g</td><td>{number(person.sick_leave_days, 1)}g<small>{number(person.sick_occurrences)} olay</small></td><td>{number(person.overtime_hours, 1)}s</td><td>{number(person.absent_days)}g</td><td>{number(person.shift_changes)}</td><td>{number(person.permanent_movements)}</td><td>{number(person.open_alerts)}</td>
            <td onClick={event => event.stopPropagation()}><button type="button" className="btn btn-ghost btn-xs" onClick={() => onPersonClick?.(person.id)}>Hızlı Kart</button><Link className="btn btn-primary btn-xs" to={`/shifts/personnel/${person.id}?tab=work`}>Tam Dosya</Link></td>
          </tr>)}
        </tbody></table>{!peopleRows.length && <div className="tracking-empty">Filtrelerle eşleşen personel yok.</div>}</div>}
      </section>

      <div className="tracking-lower-grid">
        <section className="tracking-card">
          <div className="tracking-card__header"><div><strong>Kim değişti?</strong><span>Önce → sonra hareket akışı</span></div><b>{events.data?.total || 0}</b></div>
          <div className="tracking-event-list">
            {eventRows.map(event => <button type="button" key={event.id} className="tracking-event" onClick={() => onPersonClick?.(event.staff_id)}>
              <i className={`tracking-event__dot tracking-event__dot--${event.event_type}`} /><span><b>{event.full_name}</b><em>{EVENT_LABELS[event.event_type] || event.event_type} · {dateTime(event.effective_at)}</em><small>{compactValue(event.before)} <strong>→</strong> {compactValue(event.after)}</small>{event.reason && <small className="tracking-event__reason">{event.reason}{event.actor_name ? ` · ${event.actor_name}` : ''}</small>}</span>
            </button>)}
            {!eventRows.length && <div className="tracking-empty">Seçili dönemde hareket yok.</div>}
          </div>
        </section>
        <section className="tracking-card">
          <div className="tracking-card__header"><div><strong>Aksiyon kuyruğu</strong><span>Risk, sorumlu, son tarih ve görev durumu</span></div><b>{alertRows.length}</b></div>
          <div className="tracking-alert-list">
            {alertRows.map(alert => <article className={`tracking-alert tracking-alert--${alert.severity}`} key={alert.id}>
              <div><span>{SEVERITY_LABELS[alert.severity]}</span><small>{alert.rule_key}</small></div><button type="button" onClick={() => onPersonClick?.(alert.staff_id)}><strong>{alert.full_name}</strong><span>{alert.message}</span><small>{alert.assigned_user_name || 'Sorumlu atanmamış'} · Son: {dateTime(alert.due_at)}</small></button><div>
                {alert.status === 'open' && <button type="button" className="btn btn-ghost btn-xs" onClick={() => alertMutation.mutate({ id: alert.id, status: 'acknowledged' })}>Görüldü</button>}
                <button type="button" className="btn btn-primary btn-xs" disabled={followupMutation.isPending || alert.followup_id} onClick={() => followupMutation.mutate(alert.id)}>{alert.followup_id ? 'Görev Açık' : 'Göreve Dönüştür'}</button>
              </div>
            </article>)}
            {!alertRows.length && <div className="tracking-empty tracking-empty--success">Açık takip aksiyonu yok.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
