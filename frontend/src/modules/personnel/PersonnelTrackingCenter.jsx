import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'
import { exportPersonnelTrackingExcel } from './logic/personnelTrackingExcel.js'
import { describeTrackingErrors } from './logic/trackingErrors.js'
import PersonnelTrackingDrilldown from './PersonnelTrackingDrilldown.jsx'
import './PersonnelTrackingCenter.css'

const EVENT_LABELS = {
  tracking_started: 'Takip başlangıcı', employment_started: 'İşe giriş', assignment_changed: 'Atama değişikliği',
  temporary_project_work: 'Geçici çalışma', shift_changed: 'Vardiya revizyonu', leave_changed: 'İzin / rapor',
  overtime_changed: 'Fazla mesai', absence_recorded: 'Devamsızlık', offboarding_started: 'Çıkış başladı',
  employment_ended: 'İşten çıkış', employment_restored: 'Geri işe alma',
}
const STATUS_LABELS = { active: 'Aktif', offboarding: 'Çıkış sürecinde', exited: 'İşten çıktı' }
const SEVERITY_LABELS = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }

const COMPARISON_METRICS = {
  leave: { label: 'İzin', unit: 'g', metric: 'leave', subtype: 'non_sick', value: person => Number(person.annual_leave_days || 0) + Number(person.other_leave_days || 0) },
  report: { label: 'Rapor', unit: 'g', metric: 'leave', subtype: 'sick', value: person => Number(person.sick_leave_days || 0) },
  overtime: { label: 'Mesai', unit: 's', metric: 'overtime', value: person => Number(person.overtime_hours || 0) },
  absence: { label: 'Devamsızlık', unit: 'g', metric: 'absence', value: person => Number(person.absent_days || 0) },
  shift: { label: 'Vardiya Δ', unit: '', metric: 'shift_change', value: person => Number(person.shift_changes || 0) },
  transfer: { label: 'Transfer', unit: '', metric: 'transfer', value: person => Number(person.permanent_movements || 0) },
  action: { label: 'Aksiyon', unit: '', metric: 'open_alerts', value: person => Number(person.open_alerts || 0) },
}
const COMPARISON_KEYS = Object.keys(COMPARISON_METRICS)

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

function distribution(rows, key, fallback, idKey) {
  const counts = new Map()
  rows.forEach(row => {
    const label = row[key] || fallback
    const mapKey = `${row[idKey] ?? 'none'}:${label}`
    const current = counts.get(mapKey) || { label, id: row[idKey] ?? 'none', value: 0 }
    current.value += 1
    counts.set(mapKey, current)
  })
  return [...counts.values()].sort((a, b) => b.value - a.value)
}

function KpiCard({ metric, label, value, sub, tone = 'blue', active, onClick }) {
  return (
    <button type="button" className={`tracking-kpi tracking-kpi--${tone}${active ? ' tracking-kpi--active' : ''}`}
      aria-expanded={active} aria-controls="personnel-tracking-drilldown" aria-label={`${label} ayrıntısını aç`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}
      <i aria-hidden="true">Ayrıntı →</i><em className="sr-only">{metric}</em>
    </button>
  )
}

function DistributionBars({ title, items, onItemClick, isItemDisabled }) {
  const max = Math.max(1, ...items.map(item => item.value))
  return (
    <section className="tracking-card">
      <div className="tracking-card__header"><div><strong>{title}</strong><span>{items.reduce((sum, item) => sum + item.value, 0)} personel</span></div></div>
      <div className="tracking-bars">
        {items.slice(0, 8).map(item => (
          <button type="button" className="tracking-bar" key={`${item.id}-${item.label}`} disabled={isItemDisabled?.(item)} onClick={event => onItemClick?.(item, event)} aria-label={`${item.label}: ${item.value} personeli göster`}>
            <div><span title={item.label}>{item.label}</span><b>{item.value}</b></div>
            <i><span style={{ width: `${(item.value / max) * 100}%` }} /></i>
          </button>
        ))}
        {!items.length && <div className="tracking-empty">Dağılım verisi yok.</div>}
      </div>
    </section>
  )
}

function MetricCell({ label, value, onClick, sub, active = false }) {
  return <button type="button" className={`tracking-metric-cell${active ? ' is-active' : ''}`} aria-label={`${label} detayını aç`} onClick={event => { event.stopPropagation(); onClick(event) }}>
    <strong>{value}</strong>{sub && <small>{sub}</small>}<i aria-hidden="true">→</i>
  </button>
}

function ComparisonColumnHeader({ metricKey, activeKey, order, onSelect }) {
  const item = COMPARISON_METRICS[metricKey]
  const active = metricKey === activeKey
  const nextDirection = active && order === 'desc' ? 'en aza' : 'en çoğa'
  return <th aria-sort={active ? (order === 'desc' ? 'descending' : 'ascending') : 'none'}>
    <button type="button" className={`tracking-comparison-sort${active ? ' is-active' : ''}`}
      aria-label={`${item.label} sütununu ${nextDirection} sırala`} onClick={() => onSelect(metricKey)}>
      <span>{item.label.toLocaleUpperCase('tr-TR')}</span><i aria-hidden="true">{active ? (order === 'desc' ? '↓' : '↑') : '↕'}</i>
    </button>
  </th>
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

function ActionRow({ alert, users, onPersonClick, onUpdate, onFollowup, pending }) {
  const [assignedUserId, setAssignedUserId] = useState(alert.assigned_user_id ? String(alert.assigned_user_id) : '')
  const [dueAt, setDueAt] = useState(alert.due_at ? String(alert.due_at).slice(0, 10) : '')
  return (
    <article className={`tracking-alert tracking-alert--${alert.severity}`}>
      <div><span>{SEVERITY_LABELS[alert.severity]}</span><small>{alert.rule_key}</small></div>
      <button type="button" onClick={() => onPersonClick?.(alert.staff_id)}>
        <strong>{alert.title || alert.full_name}</strong><span>{alert.message}</span>
        <small>{alert.full_name} · {alert.assigned_user_name || 'Sorumlu atanmamış'} · Son: {dateTime(alert.due_at)}</small>
      </button>
      <div className="tracking-alert__actions">
        <select aria-label={`${alert.full_name} aksiyon sorumlusu`} className="form-select" value={assignedUserId} onChange={event => setAssignedUserId(event.target.value)} disabled={!!alert.followup_id}>
          <option value="">Sorumlu seç</option>{users.map(item => <option key={item.id} value={item.id}>{item.full_name || item.username}</option>)}
        </select>
        <input aria-label={`${alert.full_name} aksiyon son tarihi`} className="form-input" type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} disabled={!!alert.followup_id} />
        {alert.status === 'open' && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onUpdate({ id: alert.id, status: 'acknowledged' })}>Görüldü</button>}
        <button type="button" className="btn btn-ghost btn-xs" disabled={pending} onClick={() => onUpdate({ id: alert.id, status: 'resolved' })}>Çözüldü</button>
        <button type="button" className="btn btn-primary btn-xs" disabled={pending || alert.followup_id} onClick={() => onFollowup({ alertId: alert.id, payload: { assigned_user_id: assignedUserId || null, due_at: dueAt || null } })}>{alert.followup_id ? 'Görev Açık' : 'Göreve Dönüştür'}</button>
      </div>
    </article>
  )
}

export default function PersonnelTrackingCenter({ projects = [], departments = [], onPersonClick }) {
  const [params, setParams] = useSearchParams()
  const metric = params.get('metric') || ''
  const requestedComparison = params.get('compare_metric') || 'leave'
  const comparisonKey = COMPARISON_METRICS[requestedComparison] ? requestedComparison : 'leave'
  const comparisonOrder = params.get('compare_order') === 'asc' ? 'asc' : 'desc'
  const comparisonNonzero = params.get('compare_nonzero') === '1'
  const metricOrigins = useRef(new Map())
  const previousMetric = useRef(metric)
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)
  const [showSettings, setShowSettings] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
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
  const setComparison = changes => setParams(previous => {
    const next = new URLSearchParams(previous)
    Object.entries(changes).forEach(([key, value]) => value == null || value === '' ? next.delete(key) : next.set(key, String(value)))
    return next
  }, { replace: true })
  const selectComparison = key => setComparison({
    compare_metric: key,
    compare_order: comparisonKey === key ? (comparisonOrder === 'desc' ? 'asc' : 'desc') : 'desc',
  })
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
  const openMetric = (metricName, event, options = {}) => {
    metricOrigins.current.set(metricName, event.currentTarget)
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('metric', metricName); next.set('metric_view', options.view || 'people'); next.set('metric_page', '1')
      if (metricName === 'leave') next.set('metric_status', 'approved')
      else if (metricName === 'overtime') next.set('metric_status', 'recorded')
      else next.delete('metric_status')
      ;['staff_id', 'bucket', 'metric_sort', 'metric_order', 'metric_project_id', 'metric_department_id', 'metric_subtype'].forEach(key => next.delete(key))
      if (options.staffId) next.set('staff_id', String(options.staffId))
      if (options.bucket) next.set('bucket', String(options.bucket))
      if (options.projectId != null) next.set('metric_project_id', String(options.projectId))
      if (options.departmentId != null) next.set('metric_department_id', String(options.departmentId))
      if (options.subtype) next.set('metric_subtype', String(options.subtype))
      if (options.sort) next.set('metric_sort', String(options.sort))
      if (options.order) next.set('metric_order', String(options.order))
      return next
    })
  }
  const closeMetric = useCallback(() => {
    const currentMetric = metric
    setParams(previous => {
      const next = new URLSearchParams(previous)
      ;['metric', 'metric_view', 'metric_status', 'metric_page', 'metric_sort', 'metric_order', 'staff_id', 'bucket', 'metric_project_id', 'metric_department_id', 'metric_subtype'].forEach(key => next.delete(key))
      return next
    }, { replace: true })
    requestAnimationFrame(() => metricOrigins.current.get(currentMetric)?.focus())
  }, [metric, setParams])

  useEffect(() => {
    if (previousMetric.current && !metric) requestAnimationFrame(() => metricOrigins.current.get(previousMetric.current)?.focus())
    previousMetric.current = metric
  }, [metric])

  const overview = useQuery({ queryKey: ['personnel-tracking-overview', requestFilters], queryFn: () => api.get('/personnel/tracking/overview', { params: requestFilters }).then(response => response.data) })
  const people = useQuery({ queryKey: ['personnel-tracking-people', requestFilters], queryFn: () => api.get('/personnel/tracking/people', { params: requestFilters }).then(response => response.data) })
  const events = useQuery({ queryKey: ['personnel-tracking-events', requestFilters], queryFn: () => api.get('/personnel/tracking/events', { params: { ...requestFilters, limit: 100 } }).then(response => response.data) })
  const alerts = useQuery({ queryKey: ['personnel-tracking-alerts'], queryFn: () => api.get('/personnel/tracking/alerts', { params: { limit: 100 } }).then(response => response.data) })
  const users = useQuery({ queryKey: ['users-for-personnel-alerts'], queryFn: () => api.get('/users').then(response => response.data).catch(() => []), staleTime: 300000 })
  const rules = useQuery({ queryKey: ['personnel-tracking-settings'], queryFn: () => api.get('/personnel/tracking/settings').then(response => response.data), enabled: showSettings })
  const yuklemeHatasi = describeTrackingErrors([
    { label: 'Özet', query: overview },
    { label: 'Personel listesi', query: people },
    { label: 'Hareketler', query: events },
    { label: 'Uyarılar', query: alerts },
  ])
  const refresh = () => ['personnel-tracking-overview', 'personnel-tracking-people', 'personnel-tracking-events', 'personnel-tracking-alerts', 'personnel-tracking-settings'].forEach(key => queryClient.invalidateQueries({ queryKey: [key] }))
  const followupMutation = useMutation({ mutationFn: ({ alertId, payload }) => api.post(`/personnel/tracking/alerts/${alertId}/followup`, payload), onSuccess: () => { refresh(); useToastStore.getState().addToast('Uyarı takip görevine dönüştürüldü', 'success') }, onError: error => useToastStore.getState().addToast(error.response?.data?.error || 'Görev oluşturulamadı', 'error') })
  const alertMutation = useMutation({ mutationFn: ({ id, status }) => api.patch(`/personnel/tracking/alerts/${id}`, { status }), onSuccess: refresh })
  const ruleMutation = useMutation({ mutationFn: rule => api.patch('/personnel/tracking/settings', { rules: [rule] }), onSuccess: () => { refresh(); useToastStore.getState().addToast('Takip kuralı güncellendi', 'success') }, onError: error => useToastStore.getState().addToast(error.response?.data?.error || 'Kural güncellenemedi', 'error') })

  const kpi = overview.data?.kpis || {}
  const peopleRows = people.data?.items || []
  const comparison = COMPARISON_METRICS[comparisonKey]
  const comparisonRows = useMemo(() => peopleRows
    .map(person => ({ ...person, comparison_value: comparison.value(person) }))
    .filter(person => !comparisonNonzero || person.comparison_value > 0)
    .sort((left, right) => {
      const difference = left.comparison_value - right.comparison_value
      if (difference !== 0) return comparisonOrder === 'asc' ? difference : -difference
      return String(left.full_name || '').localeCompare(String(right.full_name || ''), 'tr', { sensitivity: 'base' })
    }), [peopleRows, comparison, comparisonNonzero, comparisonOrder])
  const comparisonActiveCount = comparisonRows.filter(person => person.comparison_value > 0).length
  const comparisonLeaders = (comparisonOrder === 'desc'
    ? comparisonRows.filter(person => person.comparison_value > 0)
    : comparisonRows).slice(0, 3)
  const openComparisonDetail = (person, event) => openMetric(comparison.metric, event, {
    view: 'records', staffId: person.id, subtype: comparison.subtype,
    sort: comparison.metric === 'open_alerts' ? 'occurred_at' : 'quantity', order: 'desc',
  })
  const eventRows = events.data?.items || []
  const visiblePersonIds = useMemo(() => new Set(peopleRows.map(person => Number(person.id))), [peopleRows])
  const alertRows = (alerts.data?.items || []).filter(alert => ['open', 'acknowledged'].includes(alert.status) && visiblePersonIds.has(Number(alert.staff_id)))
  const projectDistribution = useMemo(() => distribution(peopleRows, 'project_name', 'Proje atanmamış', 'project_id'), [peopleRows])
  const departmentDistribution = useMemo(() => distribution(peopleRows, 'department_name', 'Departman atanmamış', 'department_id'), [peopleRows])
  const maxTrend = Math.max(1, ...(overview.data?.trends || []).map(item => Number(item.shift_changes || 0) + Number(item.movements || 0) + Number(item.exits || 0)))
  const exportReport = async () => {
    setIsExporting(true)
    try {
      const project = projects.find(item => String(item.id) === String(filters.project_id))
      const department = departments.find(item => String(item.id) === String(filters.department_id))
      const labels = [
        filters.project_id === 'none' ? 'Proje: Atanmamış' : project ? `Proje: ${project.name}` : 'Proje: Tümü',
        department ? `Departman: ${department.name}` : 'Departman: Tümü',
        `Durum: ${STATUS_LABELS[filters.status] || 'Tümü'}`,
        `Hareket: ${EVENT_LABELS[filters.event_type] || 'Tümü'}`,
        filters.q ? `Arama: ${filters.q}` : null,
      ]
      const report = await exportPersonnelTrackingExcel({
        api, filters: requestFilters, filterLabels: labels,
        generatedBy: user?.full_name || user?.username || 'YYS Kullanıcısı',
      })
      useToastStore.getState().addToast(`${report.rows} personel için Excel raporu hazırlandı`, 'success')
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Excel raporu oluşturulamadı', 'error')
    } finally {
      setIsExporting(false)
    }
  }

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
          <button type="button" className="btn btn-primary btn-sm" disabled={isExporting} onClick={exportReport}>{isExporting ? 'Hazırlanıyor…' : 'Excel Raporu'}</button>
          <button type="button" className={`btn btn-sm ${showSettings ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowSettings(value => !value)}>Uyarı Kuralları</button>
        </div>
        <div className="tracking-filterbar__meta"><span>{filters.from} → {filters.to}</span><span>{people.data?.total || 0} personel</span><span>{events.data?.total || 0} hareket</span></div>
      </section>

      {/* Hata kaynağını adıyla söyle. Tek cümlelik "bir bölümü alınamadı"
          uyarısı hangi bölümün neden düştüğünü gizliyordu; sebep bağlantı
          sanılıp sunucudaki asıl arıza (eksik şema) gözden kaçtı. */}
      {yuklemeHatasi && (
        <div className="tracking-error" role="alert">
          <strong>{yuklemeHatasi.labels.join(', ')} alınamadı.</strong>{' '}
          {yuklemeHatasi.reasons.join(' · ')}
          {yuklemeHatasi.retryable
            ? <> — <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>Yenile</button> ile tekrar deneyebilirsiniz.</>
            : ' Bu bölüm için tekrar denemek işe yaramaz; yetki veya oturum sorunudur.'}
        </div>
      )}

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
          <KpiCard metric="active" label="Aktif" value={number(kpi.active)} tone="green" active={metric === 'active'} onClick={event => openMetric('active', event)} />
          <KpiCard metric="offboarding" label="Çıkış sürecinde" value={number(kpi.offboarding)} tone="amber" active={metric === 'offboarding'} onClick={event => openMetric('offboarding', event)} />
          <KpiCard metric="exited" label="İşten çıkan" value={number(kpi.exited)} sub={kpi.undated_exited ? `${number(kpi.undated_exited)} tarihsiz eski kayıt` : 'Seçili dönem'} tone="muted" active={metric === 'exited'} onClick={event => openMetric('exited', event)} />
          <KpiCard metric="hired" label="Yeni başlayan" value={number(kpi.hired)} active={metric === 'hired'} onClick={event => openMetric('hired', event)} />
          <KpiCard metric="transfer" label="Kalıcı transfer" value={number(kpi.permanent_movements)} tone="purple" active={metric === 'transfer'} onClick={event => openMetric('transfer', event)} />
          <KpiCard metric="temporary_work" label="Geçici proje" value={number(kpi.temporary_project_work)} tone="purple" active={metric === 'temporary_work'} onClick={event => openMetric('temporary_work', event)} />
          <KpiCard metric="shift_change" label="Vardiya revizyonu" value={number(kpi.shift_changes)} active={metric === 'shift_change'} onClick={event => openMetric('shift_change', event)} />
          <KpiCard metric="leave" label="İzin / rapor" value={`${number(Number(kpi.annual_leave_days || 0) + Number(kpi.sick_leave_days || 0) + Number(kpi.other_leave_days || 0), 1)}g`} sub={`${number(kpi.sick_leave_days, 1)}g rapor${kpi.leave_hours ? ` · ${number(kpi.leave_hours, 1)}s saatlik` : ''}`} tone="amber" active={metric === 'leave'} onClick={event => openMetric('leave', event)} />
          <KpiCard metric="overtime" label="Fazla mesai" value={`${number(kpi.overtime_hours, 1)}s`} active={metric === 'overtime'} onClick={event => openMetric('overtime', event)} />
          <KpiCard metric="absence" label="Devamsızlık" value={`${number(kpi.absent_days)}g`} tone="red" active={metric === 'absence'} onClick={event => openMetric('absence', event)} />
          <KpiCard metric="open_alerts" label="Açık aksiyon" value={number(kpi.open_alerts)} tone="amber" active={metric === 'open_alerts'} onClick={event => openMetric('open_alerts', event)} />
          <KpiCard metric="overdue_critical" label="Gecikmiş / kritik" value={`${number(kpi.overdue_alerts)} / ${number(kpi.critical_alerts)}`} tone="red" active={metric === 'overdue_critical'} onClick={event => openMetric('overdue_critical', event)} />
        </div>
      )}

      <div className="tracking-dashboard-grid">
        <section className="tracking-card tracking-card--wide">
          <div className="tracking-card__header"><div><strong>Aylık hareket eğilimi</strong><span>Vardiya, atama ve çıkış hareketleri</span></div></div>
          <div className="tracking-trend" aria-label="Aylık hareket grafiği">
            {(overview.data?.trends || []).map(item => {
              const total = Number(item.shift_changes || 0) + Number(item.movements || 0) + Number(item.exits || 0)
              return <button type="button" key={item.month} className="tracking-trend__month" aria-label={`${item.month}: ${total} hareketi göster`} onClick={event => openMetric('movement', event, { view: 'records', bucket: item.month })}><div title={`${total} hareket`}><i style={{ height: `${Math.max(4, (total / maxTrend) * 100)}%` }} /></div><strong>{total}</strong><span>{item.month}</span></button>
            })}
            {!overview.data?.trends?.length && <div className="tracking-empty">Seçili dönemde hareket yok.</div>}
          </div>
        </section>
        <DistributionBars title="Proje dağılımı" items={projectDistribution} onItemClick={(item, event) => openMetric('people', event, { projectId: item.id })} />
        <DistributionBars title="Departman dağılımı" items={departmentDistribution} isItemDisabled={item => item.id === 'none'} onItemClick={(item, event) => openMetric('people', event, { departmentId: item.id })} />
      </div>

      <section className="tracking-card">
        <div className="tracking-card__header"><div><strong>Personel karşılaştırması</strong><span>En çok / en az kullananları bul, ham kayıtlara tek tıkla ulaş</span></div><b>{comparisonRows.length}</b></div>
        {!people.isLoading && <div className="tracking-comparison-control" aria-label="Personel karşılaştırma ayarları">
          <div className="tracking-comparison-metrics" role="tablist" aria-label="Karşılaştırma metriği">
            {COMPARISON_KEYS.map(key => <button key={key} type="button" role="tab" aria-selected={comparisonKey === key}
              onClick={() => setComparison({ compare_metric: key, compare_order: 'desc' })}>{COMPARISON_METRICS[key].label}</button>)}
          </div>
          <div className="tracking-comparison-options">
            <button type="button" aria-pressed={comparisonOrder === 'desc'} onClick={() => setComparison({ compare_order: 'desc' })}>En çok ↓</button>
            <button type="button" aria-pressed={comparisonOrder === 'asc'} onClick={() => setComparison({ compare_order: 'asc' })}>En az ↑</button>
            <label><input type="checkbox" checked={comparisonNonzero} onChange={event => setComparison({ compare_nonzero: event.target.checked ? '1' : null })} /> Yalnız hareketi olanlar</label>
          </div>
        </div>}
        {!people.isLoading && <div className="tracking-comparison-insights">
          <div className="tracking-comparison-insights__summary"><span>SEÇİLİ ANALİZ</span><strong>{comparison.label}</strong><small>{comparisonActiveCount} personelde kayıt · {comparisonOrder === 'desc' ? 'en yüksekten' : 'en düşükten'} sıralı</small></div>
          {comparisonLeaders.map((person, index) => <button type="button" key={person.id} onClick={event => openComparisonDetail(person, event)} aria-label={`${person.full_name} ${comparison.label} detayını aç`}>
            <i>{index + 1}</i><span><strong>{person.full_name}</strong><small>{person.project_name || 'Proje yok'} · {person.department_name || 'Departman yok'}</small></span><b>{number(person.comparison_value, 1)}{comparison.unit}</b><em aria-hidden="true">→</em>
          </button>)}
          {!comparisonLeaders.length && <div className="tracking-comparison-insights__empty">Bu seçimde karşılaştırılacak personel yok.</div>}
        </div>}
        {people.isLoading ? <SkeletonGrid count={5} minWidth={240} /> : <div className="tracking-table-wrap"><table className="data-table tracking-people-table"><thead><tr><th>PERSONEL</th><th>PROJE / DEPARTMAN</th><th>SON HAREKET</th>
          <ComparisonColumnHeader metricKey="leave" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="report" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="overtime" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="absence" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="shift" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="transfer" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} />
          <ComparisonColumnHeader metricKey="action" activeKey={comparisonKey} order={comparisonOrder} onSelect={selectComparison} /><th /></tr></thead><tbody>
          {comparisonRows.map((person, index) => <tr key={person.id} onClick={() => onPersonClick?.(person.id)}>
            <td><span className="tracking-comparison-rank">#{index + 1}</span><strong>{person.full_name}</strong><span className={`tracking-status tracking-status--${person.employment_status}`}>{STATUS_LABELS[person.employment_status]}</span></td>
            <td>{person.project_name || 'Proje yok'}<small>{person.department_name || 'Departman yok'}</small></td><td>{EVENT_LABELS[person.last_event_type] || '—'}<small>{dateTime(person.last_event_at)}</small></td>
            <td><MetricCell active={comparisonKey === 'leave'} label={`${person.full_name} izin`} value={`${number(Number(person.annual_leave_days || 0) + Number(person.other_leave_days || 0), 1)}g`} sub={person.leave_hours ? `${number(person.leave_hours, 1)}s saatlik` : null} onClick={event => openMetric('leave', event, { view: 'records', staffId: person.id, subtype: 'non_sick' })} /></td>
            <td><MetricCell active={comparisonKey === 'report'} label={`${person.full_name} rapor`} value={`${number(person.sick_leave_days, 1)}g`} sub={`${number(person.sick_occurrences)} olay`} onClick={event => openMetric('leave', event, { view: 'records', staffId: person.id, subtype: 'sick' })} /></td>
            <td><MetricCell active={comparisonKey === 'overtime'} label={`${person.full_name} fazla mesai`} value={`${number(person.overtime_hours, 1)}s`} onClick={event => openMetric('overtime', event, { view: 'records', staffId: person.id })} /></td>
            <td><MetricCell active={comparisonKey === 'absence'} label={`${person.full_name} devamsızlık`} value={`${number(person.absent_days)}g`} onClick={event => openMetric('absence', event, { view: 'records', staffId: person.id })} /></td>
            <td><MetricCell active={comparisonKey === 'shift'} label={`${person.full_name} vardiya revizyonu`} value={number(person.shift_changes)} onClick={event => openMetric('shift_change', event, { view: 'records', staffId: person.id })} /></td>
            <td><MetricCell active={comparisonKey === 'transfer'} label={`${person.full_name} kalıcı transfer`} value={number(person.permanent_movements)} onClick={event => openMetric('transfer', event, { view: 'records', staffId: person.id })} /></td>
            <td><MetricCell active={comparisonKey === 'action'} label={`${person.full_name} açık aksiyon`} value={number(person.open_alerts)} onClick={event => openMetric('open_alerts', event, { view: 'records', staffId: person.id })} /></td>
            <td onClick={event => event.stopPropagation()}><button type="button" className="btn btn-ghost btn-xs" onClick={() => onPersonClick?.(person.id)}>Hızlı Kart</button><Link className="btn btn-primary btn-xs" to={`/shifts/personnel/${person.id}?tab=work`}>Tam Dosya</Link></td>
          </tr>)}
        </tbody></table>{!comparisonRows.length && <div className="tracking-empty">Karşılaştırma ayarlarıyla eşleşen personel yok.</div>}</div>}
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
            {alertRows.map(alert => <ActionRow key={alert.id} alert={alert} users={users.data || []} onPersonClick={onPersonClick}
              pending={alertMutation.isPending || followupMutation.isPending} onUpdate={payload => alertMutation.mutate(payload)} onFollowup={payload => followupMutation.mutate(payload)} />)}
            {!alertRows.length && <div className="tracking-empty tracking-empty--success">Açık takip aksiyonu yok.</div>}
          </div>
        </section>
      </div>
      {metric && <PersonnelTrackingDrilldown metric={metric} baseFilters={requestFilters} onClose={closeMetric} onPersonClick={onPersonClick} />}
    </div>
  )
}
