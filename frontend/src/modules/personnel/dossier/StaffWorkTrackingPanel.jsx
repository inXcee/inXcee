import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { SkeletonGrid } from '../../../shared/components/Skeleton.jsx'
import { DossierAnnualLeave, DossierSection } from './StaffDossierShared.jsx'
import './StaffWorkTrackingPanel.css'

const EVENT_LABELS = {
  tracking_started: 'Takip başlangıcı', employment_started: 'İşe giriş', assignment_changed: 'Kalıcı atama',
  temporary_project_work: 'Geçici çalışma', shift_changed: 'Vardiya revizyonu', leave_changed: 'İzin / rapor revizyonu',
  overtime_changed: 'Mesai revizyonu', absence_recorded: 'Devamsızlık', offboarding_started: 'Çıkış başlangıcı',
  employment_ended: 'İşten çıkış', employment_restored: 'Geri işe alma',
}

const PANELS = [
  ['summary', 'Özet'], ['shifts', 'Vardiyalar'], ['leave', 'İzin ve Rapor'], ['overtime', 'Fazla Mesai'],
  ['assignments', 'Atama Hareketleri'], ['temporary', 'Geçici Çalışmalar'], ['movements', 'Tüm Hareketler'],
]

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function datesForRange(range) {
  const to = new Date()
  const from = new Date(to)
  if (range === 'year') { from.setMonth(0); from.setDate(1) }
  else from.setDate(from.getDate() - (Number(range) - 1))
  return { from: isoDate(from), to: isoDate(to) }
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits })
}

function displayDate(value, withTime = false) {
  if (!value) return '—'
  const parsed = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('tr-TR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' })
}

function displayValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value !== 'object') return String(value)
  return Object.entries(value).map(([key, item]) => `${key}: ${item ?? '—'}`).join(' · ')
}

function WorkMetric({ label, value, note, tone = 'blue' }) {
  return <div className={`staff-work-metric staff-work-metric--${tone}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
}

function Empty({ children = 'Bu döneme ait kayıt bulunmuyor.' }) {
  return <div className="staff-work-empty">{children}</div>
}

function ShiftTable({ rows }) {
  if (!rows.length) return <Empty />
  return <div className="staff-work-table-wrap"><table className="data-table"><thead><tr><th>TARİH</th><th>VARDİYA</th><th>ÇALIŞMA NOKTASI / PROJE</th><th>DURUM</th><th>AÇIKLAMA</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{displayDate(row.work_date)}</td><td>{row.shift_name || '—'}</td><td>{row.work_location_name || '—'}<small>{row.work_project_name || 'Proje yok'}</small></td><td><span className={`staff-work-status staff-work-status--${row.status}`}>{row.status}</span></td><td>{row.detail_note || row.absent_reason || row.leave_type || '—'}</td></tr>)}</tbody></table></div>
}

function LeaveTable({ rows }) {
  if (!rows.length) return <Empty />
  return <div className="staff-work-table-wrap"><table className="data-table"><thead><tr><th>TÜR</th><th>TARİH ARALIĞI</th><th>SÜRE</th><th>DURUM</th><th>GEREKÇE</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.leave_type}</td><td>{displayDate(row.start_date)} → {displayDate(row.end_date)}</td><td>{number(row.total_days, 1)} gün</td><td><span className={`staff-work-status staff-work-status--${row.status}`}>{row.status}</span></td><td>{row.reason || '—'}</td></tr>)}</tbody></table></div>
}

function OvertimeTable({ rows }) {
  if (!rows.length) return <Empty />
  return <div className="staff-work-table-wrap"><table className="data-table"><thead><tr><th>TARİH</th><th>SAAT</th><th>DURUM</th><th>GEREKÇE</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{displayDate(row.work_date)}</td><td>{number(row.hours, 1)} saat</td><td><span className={`staff-work-status staff-work-status--${row.status || 'recorded'}`}>{row.status || 'Kayıtlı'}</span></td><td>{row.reason || row.notes || '—'}</td></tr>)}</tbody></table></div>
}

function AssignmentTable({ rows }) {
  if (!rows.length) return <Empty />
  return <div className="staff-work-timeline">{rows.map(row => <article key={row.id}><i /><div><strong>{row.project_name || 'Proje yok'} · {row.department_name || 'Departman yok'}</strong><span>{row.role_name || 'Rol yok'} · {row.work_location_name || 'Lokasyon yok'}</span><small>{displayDate(row.effective_from)} → {row.effective_to ? displayDate(row.effective_to) : 'devam ediyor'}{row.note ? ` · ${row.note}` : ''}</small></div></article>)}</div>
}

export function StaffMovementTimeline({ staffId, compact = false }) {
  const dates = datesForRange('year')
  const query = useQuery({
    queryKey: ['personnel-tracking-timeline', String(staffId), dates.from, dates.to],
    queryFn: () => api.get(`/personnel/${staffId}/tracking`, { params: { ...dates, event_limit: compact ? 12 : 100 } }).then(response => response.data),
    enabled: !!staffId,
    staleTime: 30000,
  })
  if (query.isLoading) return <SkeletonGrid count={3} minWidth={220} />
  const events = query.data?.events || []
  return (
    <DossierSection title="ÇALIŞAN HAREKET GÜNLÜĞÜ" subtitle={`${events.length} yapılandırılmış hareket`}>
      <div className="staff-movement-list">{events.map(event => <article key={event.id}><i className={`staff-movement-dot staff-movement-dot--${event.event_type}`} /><div><div><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><time>{displayDate(event.effective_at, true)}</time></div><span>{displayValue(event.before)} <b>→</b> {displayValue(event.after)}</span>{(event.reason || event.actor_name) && <small>{event.reason || 'Açıklama yok'}{event.actor_name ? ` · ${event.actor_name}` : ''}</small>}</div></article>)}</div>
      {!events.length && <Empty>Bu yıl için hareket kaydı bulunmuyor.</Empty>}
    </DossierSection>
  )
}

export default function StaffWorkTrackingPanel({ staffId, dossier, legacyDetail, isLegacyLoading }) {
  const [range, setRange] = useState('90')
  const [panel, setPanel] = useState('summary')
  const dates = datesForRange(range)
  const query = useQuery({
    queryKey: ['personnel-tracking-detail', String(staffId), dates.from, dates.to],
    queryFn: () => api.get(`/personnel/${staffId}/tracking`, { params: { ...dates, event_limit: 150 } }).then(response => response.data),
    enabled: !!staffId,
    staleTime: 30000,
  })
  const data = query.data
  const summary = data?.summary || {}
  const shifts = data?.shifts || legacyDetail?.shiftHistory || []
  const leaves = data?.leaves || legacyDetail?.leaveHistory || []
  const overtime = data?.overtime || legacyDetail?.overtimeRecords || []
  const assignments = data?.assignments || []
  const events = data?.events || []
  const temporary = useMemo(() => shifts.filter(row => row.work_project_name && data?.staff?.project_name && row.work_project_name !== data.staff.project_name), [shifts, data?.staff?.project_name])
  const sickOccurrences = leaves.filter(row => row.leave_type === 'sick').length

  return (
    <div className="staff-work-tracking">
      <div className="staff-work-toolbar">
        <div><strong>Çalışma ve Hareketler</strong><span>{dates.from} → {dates.to}</span></div>
        <div className="staff-work-range">{[['30', '30 gün'], ['90', '90 gün'], ['365', '365 gün'], ['year', 'Bu yıl']].map(([key, label]) => <button type="button" key={key} aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>)}</div>
      </div>
      <div className="staff-work-tabs" role="tablist" aria-label="Çalışma dosyası bölümleri">{PANELS.map(([key, label]) => <button type="button" role="tab" aria-selected={panel === key} key={key} onClick={() => setPanel(key)}>{label}</button>)}</div>
      {(query.isLoading || isLegacyLoading) && <SkeletonGrid count={6} minWidth={150} />}
      {!query.isLoading && panel === 'summary' && <>
        <div className="staff-work-metrics"><WorkMetric label="Planlanan" value={`${number(summary.scheduled_days)} gün`} /><WorkMetric label="Çalışılan" value={`${number(summary.worked_days)} gün`} tone="green" /><WorkMetric label="İzinli" value={`${number(summary.approved_leave_days, 1)} gün`} tone="amber" /><WorkMetric label="Rapor" value={`${number(summary.sick_days, 1)} gün`} note={`${sickOccurrences} olay`} tone="red" /><WorkMetric label="Fazla mesai" value={`${number(summary.overtime_hours, 1)} saat`} tone="purple" /><WorkMetric label="Devamsızlık" value={`${number(summary.absent_days)} gün`} tone="red" /><WorkMetric label="Vardiya Δ" value={number(summary.shift_changes)} /><WorkMetric label="Kalıcı transfer" value={number(summary.permanent_movements)} tone="purple" /></div>
        <div className="staff-work-summary-grid"><DossierSection title="MEVCUT ÇALIŞMA DÜZENİ"><div className="staff-work-current"><strong>{data?.staff?.project_name || dossier.person?.project_name || 'Proje atanmamış'}</strong><span>{data?.staff?.department_name || dossier.person?.dept_name || 'Departman atanmamış'}</span><small>{data?.staff?.role_name || dossier.person?.role_name || dossier.person?.position || 'Rol atanmamış'}</small></div></DossierSection><DossierSection title="YILLIK İZİN HAKKI" subtitle="Kıdem bazlı"><DossierAnnualLeave annual={dossier.annual_leave} /></DossierSection></div>
      </>}
      {!query.isLoading && panel === 'shifts' && <DossierSection title="VARDİYALAR" subtitle={`${shifts.length} kayıt · ${summary.shift_changes || 0} revizyon`}><ShiftTable rows={shifts} /></DossierSection>}
      {!query.isLoading && panel === 'leave' && <DossierSection title="İZİN VE RAPOR" subtitle={`${leaves.length} olay · ${number(summary.approved_leave_days, 1)} onaylı gün`}><LeaveTable rows={leaves} /></DossierSection>}
      {!query.isLoading && panel === 'overtime' && <DossierSection title="FAZLA MESAİ" subtitle={`${number(summary.overtime_hours, 1)} saat`}><OvertimeTable rows={overtime} /></DossierSection>}
      {!query.isLoading && panel === 'assignments' && <DossierSection title="ATAMA HAREKETLERİ" subtitle={`${assignments.length} dönem`}><AssignmentTable rows={assignments} /></DossierSection>}
      {!query.isLoading && panel === 'temporary' && <DossierSection title="GEÇİCİ ÇAPRAZ ÇALIŞMALAR" subtitle={`${temporary.length} gün`}><ShiftTable rows={temporary} /></DossierSection>}
      {!query.isLoading && panel === 'movements' && <div className="staff-movement-list">{events.map(event => <article key={event.id}><i className={`staff-movement-dot staff-movement-dot--${event.event_type}`} /><div><div><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><time>{displayDate(event.effective_at, true)}</time></div><span>{displayValue(event.before)} <b>→</b> {displayValue(event.after)}</span>{(event.reason || event.actor_name) && <small>{event.reason || 'Açıklama yok'}{event.actor_name ? ` · ${event.actor_name}` : ''}</small>}</div></article>)}</div>}
    </div>
  )
}
