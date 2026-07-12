import { useState, useMemo, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useDebounce } from '../../../shared/hooks/useDebounce.js'
import { SkeletonTable, SkeletonGrid } from '../../../shared/components/Skeleton.jsx'
import { BottomSheet, formatShiftHours, leaveTypeLabel, toastErr, toastOk } from '../shared.jsx'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { actionIdForKey, normalizeRect, cellsInRect, isInRect, moveCell, pushUndo, summarizeColumn } from '../logic/puantajGrid.js'
import { saveWorkbook } from '../logic/excelKit.js'
import { buildPuantajFoyuWorkbook } from '../logic/puantajFoyuExcel.js'
import { buildPuantajControl } from '../logic/puantajControl.js'

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'YYS Kampüs'

const PUANTAJ_ACTIONS = [
  { id: 'worked', status: 'worked', code: 'N', label: 'Normal çalıştı', hint: 'Çalışan', bg: 'rgba(34,197,94,.18)', text: '#22c55e', border: 'rgba(34,197,94,.45)' },
  { id: 'off', status: 'off', code: 'h', label: 'Haftalık izin', hint: 'Hafta tatili', bg: 'rgba(20,184,166,.18)', text: '#14b8a6', border: 'rgba(20,184,166,.45)' },
  { id: 'sick', status: 'on_leave', leave_type: 'sick', code: 'r', label: 'Raporlu', hint: 'Rapor', bg: 'rgba(249,115,22,.18)', text: '#f97316', border: 'rgba(249,115,22,.45)' },
  { id: 'unpaid', status: 'on_leave', leave_type: 'unpaid', code: 'üi', label: 'Ücretsiz izin', hint: 'Ücretsiz', bg: 'rgba(100,116,139,.22)', text: '#94a3b8', border: 'rgba(148,163,184,.5)' },
  { id: 'annual', status: 'on_leave', leave_type: 'annual', code: 'yi', label: 'Yıllık izin', hint: 'Yıllık', bg: 'rgba(59,130,246,.18)', text: '#60a5fa', border: 'rgba(96,165,250,.45)' },
  { id: 'absent', status: 'absent', code: 'Y', label: 'Gelmedi', hint: 'Yok', bg: 'rgba(239,68,68,.16)', text: '#ef4444', border: 'rgba(239,68,68,.45)' },
  { id: 'scheduled', status: 'scheduled', code: 'P', label: 'Planlı', hint: 'Plan', bg: 'rgba(148,163,184,.14)', text: 'var(--text3)', border: 'rgba(148,163,184,.32)' },
  { id: 'clear', status: 'clear', code: 'sil', label: 'Kaydı sil', hint: 'Temizle', bg: 'var(--surface2)', text: 'var(--text3)', border: 'var(--border)' },
]

const ACTION_BY_ID = Object.fromEntries(PUANTAJ_ACTIONS.map(a => [a.id, a]))
const MONTH_SHORT = ['OCA', 'SUB', 'MAR', 'NIS', 'MAY', 'HAZ', 'TEM', 'AGU', 'EYL', 'EKI', 'KAS', 'ARA']
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function dayStatusMeta(entry, isSunday) {
  const status = entry?.status || (isSunday ? 'sunday' : 'no_record')
  if (status === 'on_leave') {
    if (entry?.leave_type === 'sick') return ACTION_BY_ID.sick
    if (entry?.leave_type === 'unpaid') return ACTION_BY_ID.unpaid
    if (entry?.leave_type === 'annual') return ACTION_BY_ID.annual
    return { id: 'leave', code: 'i', label: leaveTypeLabel(entry?.leave_type), hint: 'İzin', bg: 'rgba(167,139,250,.18)', text: 'var(--purple)', border: 'rgba(167,139,250,.45)' }
  }
  if (status === 'worked' || status === 'overtime') return ACTION_BY_ID.worked
  if (status === 'off') return ACTION_BY_ID.off
  if (status === 'absent') return ACTION_BY_ID.absent
  if (status === 'scheduled') return ACTION_BY_ID.scheduled
  if (status === 'sunday') return { id: 'sunday', code: '', label: 'Pazar', hint: 'Kayıt yok', bg: 'rgba(240,165,0,.05)', text: 'var(--accent)', border: 'rgba(240,165,0,.16)' }
  return { id: 'no_record', code: '', label: 'Kayıt yok', hint: 'Boş', bg: 'transparent', text: 'transparent', border: 'var(--border)' }
}

function summarizeCalendarDays(days) {
  return days.reduce((acc, d) => {
    if (d.status === 'worked' || d.status === 'overtime') acc.worked++
    else if (d.status === 'off') acc.off++
    else if (d.status === 'absent') acc.absent++
    else if (d.status === 'on_leave' && d.leave_type === 'sick') acc.sick++
    else if (d.status === 'on_leave' && d.leave_type === 'unpaid') acc.unpaid++
    else if (d.status === 'on_leave') acc.leave++
    return acc
  }, { worked: 0, off: 0, sick: 0, unpaid: 0, absent: 0, leave: 0 })
}

function approvalStatusMeta(status) {
  const map = {
    draft: { label: 'Taslak', color: 'var(--text3)', bg: 'var(--surface2)', border: 'var(--border)' },
    submitted: { label: 'Kontrolde', color: 'var(--accent)', bg: 'rgba(240,165,0,.10)', border: 'rgba(240,165,0,.35)' },
    approved: { label: 'Onaylandi', color: 'var(--green)', bg: 'rgba(34,197,94,.10)', border: 'rgba(34,197,94,.35)' },
    returned: { label: 'Geri dondu', color: 'var(--red)', bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.35)' },
    locked: { label: 'Kilitli', color: 'var(--teal)', bg: 'rgba(20,184,166,.10)', border: 'rgba(20,184,166,.35)' },
    missing: { label: 'Eksik', color: 'var(--text3)', bg: 'transparent', border: 'var(--border)' },
    pending: { label: 'Bekliyor', color: 'var(--accent)', bg: 'rgba(240,165,0,.10)', border: 'rgba(240,165,0,.35)' },
  }
  return map[status] || map.missing
}

function approvalTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PuantajApprovalView({
  approval,
  audit,
  canEdit,
  isManager,
  isLocked,
  monthLabel,
  loading,
  busy,
  onSubmitPeriod,
  onDayStatus,
  onBulkDayStatus,
  onPeriodAction,
  onPersonClick,
}) {
  const period = approval?.period_approval || { status: 'draft' }
  const [periodNote, setPeriodNote] = useState(period.note || '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDay, setSelectedDay] = useState('')

  useEffect(() => {
    setPeriodNote(period.note || '')
  }, [period.note])

  const dailyRows = approval?.daily_approvals || []
  const dailyAuditByDate = useMemo(() => new Map((audit.dailyRows || []).map(row => [row.date, row])), [audit.dailyRows])
  const dailyIssuesByDate = audit.dailyIssuesByDate || {}
  const enrichedDailyRows = useMemo(() => dailyRows.map(row => {
    const dayAudit = dailyAuditByDate.get(row.work_date) || {}
    const hasProblem = (dayAudit.scheduled || 0) + (dayAudit.empty || 0) + (dayAudit.absentWithoutReason || 0) > 0
    const dayIssues = dailyIssuesByDate[row.work_date] || []
    return { ...row, dayAudit, dayIssues, hasProblem }
  }), [dailyRows, dailyAuditByDate, dailyIssuesByDate])
  const counts = useMemo(() => dailyRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, { missing: 0, pending: 0, approved: 0, returned: 0 }), [dailyRows])
  const readyToSendRows = useMemo(() => enrichedDailyRows.filter(row => !row.hasProblem && ['missing', 'returned'].includes(row.status)), [enrichedDailyRows])
  const readyToApproveRows = useMemo(() => enrichedDailyRows.filter(row => !row.hasProblem && row.status === 'pending'), [enrichedDailyRows])
  const problemRows = useMemo(() => enrichedDailyRows.filter(row => row.hasProblem), [enrichedDailyRows])
  const filteredDailyRows = useMemo(() => enrichedDailyRows.filter(row => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'problem') return row.hasProblem
    if (statusFilter === 'ready') return !row.hasProblem && ['missing', 'returned', 'pending'].includes(row.status)
    return row.status === statusFilter
  }), [enrichedDailyRows, statusFilter])
  const meta = approvalStatusMeta(period.status)
  const closeProblems = audit.totals.scheduled + audit.totals.empty + audit.totals.absentWithoutReason + audit.missingOffStaff
  const lockChecks = useMemo(() => ([
    { id: 'sent', label: 'Ay kontrole gonderildi', ok: ['submitted', 'approved', 'locked'].includes(period.status), value: approvalStatusMeta(period.status).label },
    { id: 'planned', label: 'Planli gun kalmadi', ok: audit.totals.scheduled === 0, value: audit.totals.scheduled },
    { id: 'empty', label: 'Bos gun kalmadi', ok: audit.totals.empty === 0, value: audit.totals.empty },
    { id: 'absence', label: 'Nedensiz devamsizlik yok', ok: audit.totals.absentWithoutReason === 0, value: audit.totals.absentWithoutReason },
    { id: 'off', label: 'OFF eksik personel yok', ok: audit.missingOffStaff === 0, value: audit.missingOffStaff },
    { id: 'approved', label: 'Tum gunler onayli', ok: dailyRows.length > 0 && (counts.approved || 0) === dailyRows.length, value: `${counts.approved || 0}/${dailyRows.length}` },
    { id: 'returned', label: 'Geri donen gun yok', ok: (counts.returned || 0) === 0, value: counts.returned || 0 },
    { id: 'pending', label: 'Bekleyen/eksik gun yok', ok: (counts.pending || 0) === 0 && (counts.missing || 0) === 0, value: (counts.pending || 0) + (counts.missing || 0) },
  ]), [period.status, audit, counts, dailyRows.length])
  const lockReady = lockChecks.every(check => check.ok)
  const topProblemDays = useMemo(() => problemRows
    .map(row => ({
      row,
      score: (row.dayAudit?.scheduled || 0) + (row.dayAudit?.empty || 0) + (row.dayAudit?.absentWithoutReason || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5), [problemRows])
  const topStaffIssues = useMemo(() => (audit.staffIssues || []).slice(0, 5), [audit.staffIssues])
  const selectedDayRow = useMemo(() => (
    enrichedDailyRows.find(row => row.work_date === selectedDay) || problemRows[0] || enrichedDailyRows[0] || null
  ), [enrichedDailyRows, problemRows, selectedDay])
  const selectedDayIssues = selectedDayRow?.dayIssues || []
  const selectedDayStatus = approvalStatusMeta(selectedDayRow?.status || 'missing')

  useEffect(() => {
    if (!dailyRows.length) {
      if (selectedDay) setSelectedDay('')
      return
    }
    if (!dailyRows.some(row => row.work_date === selectedDay)) {
      setSelectedDay(problemRows[0]?.work_date || dailyRows[0]?.work_date || '')
    }
  }, [dailyRows, problemRows, selectedDay])

  const askDayStatus = (row, status) => {
    let note = row.note || ''
    if (status === 'returned') {
      note = window.prompt('Geri gonderme notu', row.note || '') ?? null
      if (note == null) return
    }
    onDayStatus(row, status, note)
  }

  const askBulkStatus = async (rows, status, label) => {
    if (!rows.length) return
    const ok = await confirmDialog({
      title: label,
      body: `${rows.length} gun icin onay durumu "${approvalStatusMeta(status).label}" yapilacak.`,
    })
    if (!ok) return
    onBulkDayStatus(rows, status, '')
  }

  if (loading) {
    return <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '16px', color: 'var(--text3)' }}>Onay verileri yukleniyor...</div>
  }

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '1px' }}>PUANTAJ ONAY MASASI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
              {monthLabel} - {audit.staffCount} personel - %{audit.completionRate} tamamlanma
            </div>
          </div>
          <span style={{
            border: `1px solid ${meta.border}`,
            background: meta.bg,
            color: meta.color,
            borderRadius: '8px',
            padding: '7px 10px',
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            fontWeight: 800,
          }}>{meta.label}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '8px', marginTop: '12px' }}>
          {[
            ['Hazir kisi', `${audit.readyStaff}/${audit.staffCount}`, audit.readyStaff === audit.staffCount ? 'var(--green)' : 'var(--accent)'],
            ['Kritik eksik', closeProblems, closeProblems > 0 ? 'var(--red)' : 'var(--green)'],
            ['Gonderilen gun', counts.pending || 0, 'var(--accent)'],
            ['Onayli gun', counts.approved || 0, 'var(--green)'],
            ['Geri donen', counts.returned || 0, counts.returned > 0 ? 'var(--red)' : 'var(--text3)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', padding: '10px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color, marginTop: '4px' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: '8px', alignItems: 'center', marginTop: '12px' }}>
          <input
            className="form-input"
            value={periodNote}
            onChange={e => setPeriodNote(e.target.value)}
            placeholder="Onay/kapanis notu"
            disabled={!canEdit || busy}
            style={{ fontSize: '11px', padding: '8px 10px' }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" disabled={!canEdit || busy || isLocked} onClick={() => onSubmitPeriod(periodNote)} style={{ fontSize: '10px' }}>Kontrole Gonder</button>
            <button className="btn btn-ghost btn-sm" disabled={!isManager || busy || isLocked} onClick={() => onPeriodAction('approve', periodNote)} style={{ fontSize: '10px', color: 'var(--green)' }}>Onayla</button>
            <button className="btn btn-ghost btn-sm" disabled={!isManager || busy || isLocked} onClick={() => onPeriodAction('return', periodNote)} style={{ fontSize: '10px', color: 'var(--red)' }}>Geri Gonder</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!isManager || busy || isLocked || !lockReady}
              onClick={() => onPeriodAction('lock', periodNote)}
              title={lockReady ? 'Ay kilitlenmeye hazir' : 'Kilit icin kapanis kontrol listesini tamamlayin'}
              style={{ fontSize: '10px' }}
            >
              Onayla ve Kilitle
            </button>
            {isLocked && <button className="btn btn-ghost btn-sm" disabled={!isManager || busy} onClick={() => onPeriodAction('reopen', periodNote)} style={{ fontSize: '10px' }}>Taslak Ac</button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
          <span>Gonderen: {period.submitted_by_name || '-'} / {approvalTime(period.submitted_at)}</span>
          <span>Onaylayan: {period.approved_by_name || '-'} / {approvalTime(period.approved_at)}</span>
          <span>Kilitleyen: {period.locked_by_name || '-'} / {approvalTime(period.locked_at)}</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '12px',
      }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px' }}>KILIT ONCESI KAPANIS KONTROLU</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                {lockReady ? 'Ay kilitlenmeye hazir.' : 'Kilitleme icin eksikleri tamamlayin.'}
              </div>
            </div>
            <span style={{
              border: `1px solid ${lockReady ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)'}`,
              background: lockReady ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)',
              color: lockReady ? 'var(--green)' : 'var(--red)',
              borderRadius: '8px',
              padding: '6px 9px',
              fontFamily: 'var(--mono)',
              fontSize: '9px',
              fontWeight: 800,
            }}>{lockReady ? 'KILITLEME HAZIR' : 'KILIT BLOKLU'}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '7px' }}>
            {lockChecks.map(check => (
              <button
                key={check.id}
                type="button"
                onClick={() => {
                  if (!check.ok && ['planned', 'empty', 'absence', 'off'].includes(check.id)) setStatusFilter('problem')
                  if (!check.ok && ['approved', 'returned', 'pending'].includes(check.id)) setStatusFilter(check.id === 'approved' ? 'ready' : check.id)
                }}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${check.ok ? 'rgba(34,197,94,.28)' : 'rgba(239,68,68,.28)'}`,
                  borderRadius: '8px',
                  background: check.ok ? 'rgba(34,197,94,.055)' : 'rgba(239,68,68,.055)',
                  color: 'var(--text)',
                  cursor: check.ok ? 'default' : 'pointer',
                  padding: '8px 9px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700 }}>{check.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: check.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
                    {check.ok ? 'OK' : 'EKSIK'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '4px' }}>{check.value}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', marginBottom: '8px' }}>ONCELIKLI DUZELTMELER</div>
          {topProblemDays.length === 0 && topStaffIssues.length === 0 ? (
            <div style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: '13px' }}>Kritik duzeltme kalmadi.</div>
          ) : (
            <div style={{ display: 'grid', gap: '7px' }}>
              {topProblemDays.map(({ row, score }) => (
                <button
                  key={row.work_date}
                  type="button"
                  onClick={() => {
                    setStatusFilter('problem')
                    setSelectedDay(row.work_date)
                  }}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    padding: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800 }}>{row.work_date}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)' }}>{score}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '3px' }}>
                    P {row.dayAudit?.scheduled || 0} · Bos {row.dayAudit?.empty || 0} · Y? {row.dayAudit?.absentWithoutReason || 0}
                  </div>
                </button>
              ))}
              {topStaffIssues.slice(0, Math.max(0, 5 - topProblemDays.length)).map(issue => (
                <button
                  key={issue.staff.id}
                  type="button"
                  onClick={() => setStatusFilter('problem')}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    padding: '8px',
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.staff.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '3px', lineHeight: 1.35 }}>
                    {issue.issueLabels.join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        background: 'var(--surface)',
        padding: '10px',
      }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', marginRight: '4px' }}>HIZLI GUN ISLEMLERI</div>
        <button
          className="btn btn-ghost btn-sm"
          disabled={!canEdit || busy || isLocked || readyToSendRows.length === 0}
          onClick={() => askBulkStatus(readyToSendRows, 'pending', 'Sorunsuz Gunleri Kontrole Gonder')}
          style={{ fontSize: '10px' }}
        >
          Sorunsuzlari Gonder ({readyToSendRows.length})
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={!isManager || busy || isLocked || readyToApproveRows.length === 0}
          onClick={() => askBulkStatus(readyToApproveRows, 'approved', 'Bekleyen Sorunsuz Gunleri Onayla')}
          style={{ fontSize: '10px', color: 'var(--green)' }}
        >
          Bekleyenleri Onayla ({readyToApproveRows.length})
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setStatusFilter('problem')}
          style={{ fontSize: '10px', color: problemRows.length ? 'var(--red)' : 'var(--text3)' }}
        >
          Sorunlu Gunler ({problemRows.length})
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)', overflowX: 'auto' }}>
          {[
            ['all', 'Tum'],
            ['ready', 'Hazir'],
            ['problem', 'Kontrol'],
            ['missing', 'Eksik'],
            ['pending', 'Bekleyen'],
            ['approved', 'Onayli'],
            ['returned', 'Geri'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              style={{
                border: 'none',
                borderRadius: '6px',
                background: statusFilter === id ? 'var(--accent)' : 'transparent',
                color: statusFilter === id ? '#000' : 'var(--text3)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '9px',
                padding: '5px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 330px)', gap: '12px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px' }}>
            GUN GUN ONAY
            <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{filteredDailyRows.length}/{dailyRows.length}</span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: '54vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  <th style={{ padding: '8px', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface2)' }}>Gun</th>
                  <th style={{ padding: '8px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--surface2)' }}>N</th>
                  <th style={{ padding: '8px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--surface2)' }}>P</th>
                  <th style={{ padding: '8px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--surface2)' }}>Bos</th>
                  <th style={{ padding: '8px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--surface2)' }}>Y?</th>
                  <th style={{ padding: '8px', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface2)' }}>Durum</th>
                  <th style={{ padding: '8px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--surface2)' }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {filteredDailyRows.map(row => {
                  const dayAudit = row.dayAudit || {}
                  const dayMeta = approvalStatusMeta(row.status)
                  return (
                    <tr
                      key={row.work_date}
                      onClick={() => setSelectedDay(row.work_date)}
                      style={{
                        borderTop: '1px solid var(--border)',
                        background: selectedDayRow?.work_date === row.work_date
                          ? 'rgba(240,165,0,.10)'
                          : row.is_weekend ? 'rgba(240,165,0,.035)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{row.work_date}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: row.is_weekend ? 'var(--accent)' : 'var(--text3)' }}>{DAY_SHORT[row.weekday]}</div>
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{dayAudit.worked || 0}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: (dayAudit.scheduled || 0) > 0 ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{dayAudit.scheduled || 0}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: (dayAudit.empty || 0) > 0 ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{dayAudit.empty || 0}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: (dayAudit.absentWithoutReason || 0) > 0 ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{dayAudit.absentWithoutReason || 0}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span title={row.note || undefined} style={{
                          border: `1px solid ${dayMeta.border}`,
                          background: dayMeta.bg,
                          color: dayMeta.color,
                          borderRadius: '6px',
                          padding: '3px 6px',
                          fontFamily: 'var(--mono)',
                          fontSize: '9px',
                          fontWeight: 800,
                        }}>{dayMeta.label}</span>
                        {row.hasProblem && <span style={{ marginLeft: '6px', color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '8px' }}>kontrol</span>}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" disabled={!canEdit || busy || isLocked} onClick={() => askDayStatus(row, 'pending')} style={{ fontSize: '9px', padding: '3px 6px' }}>Gonder</button>
                        {isManager && <button className="btn btn-ghost btn-sm" disabled={busy || isLocked} onClick={() => askDayStatus(row, 'approved')} style={{ fontSize: '9px', padding: '3px 6px', color: 'var(--green)' }}>Onay</button>}
                        {isManager && <button className="btn btn-ghost btn-sm" disabled={busy || isLocked} onClick={() => askDayStatus(row, 'returned')} style={{ fontSize: '9px', padding: '3px 6px', color: 'var(--red)' }}>Geri</button>}
                      </td>
                    </tr>
                  )
                })}
                {filteredDailyRows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '18px', textAlign: 'center', color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
                      Bu filtrede gun yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px', minHeight: '190px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px' }}>GUN DETAYI</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                  {selectedDayRow ? `${selectedDayRow.work_date} - ${DAY_SHORT[selectedDayRow.weekday]}` : 'Gun secin'}
                </div>
              </div>
              <span style={{
                border: `1px solid ${selectedDayStatus.border}`,
                background: selectedDayStatus.bg,
                color: selectedDayStatus.color,
                borderRadius: '7px',
                padding: '5px 8px',
                fontFamily: 'var(--mono)',
                fontSize: '8px',
                fontWeight: 800,
              }}>{selectedDayStatus.label}</span>
            </div>

            {selectedDayRow ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                  {[
                    ['N', selectedDayRow.dayAudit?.worked || 0, 'var(--green)'],
                    ['P', selectedDayRow.dayAudit?.scheduled || 0, 'var(--accent)'],
                    ['Bos', selectedDayRow.dayAudit?.empty || 0, 'var(--red)'],
                    ['Y?', selectedDayRow.dayAudit?.absentWithoutReason || 0, 'var(--red)'],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--surface2)', padding: '7px 6px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: '15px', color, marginTop: '2px' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {selectedDayIssues.length === 0 ? (
                  <div style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: '13px' }}>Bu gun kapanisa hazir.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '7px', maxHeight: '240px', overflow: 'auto' }}>
                    {selectedDayIssues.map((issue, idx) => (
                      <button
                        key={`${issue.type}-${issue.staff.id}-${idx}`}
                        type="button"
                        onClick={() => onPersonClick?.(issue.staff)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${issue.severity === 'critical' ? 'rgba(239,68,68,.28)' : 'rgba(240,165,0,.35)'}`,
                          borderRadius: '8px',
                          background: issue.severity === 'critical' ? 'rgba(239,68,68,.055)' : 'rgba(240,165,0,.075)',
                          color: 'var(--text)',
                          cursor: onPersonClick ? 'pointer' : 'default',
                          padding: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.staff.full_name}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: issue.severity === 'critical' ? 'var(--red)' : 'var(--accent)', fontWeight: 800 }}>
                            {issue.type === 'scheduled' ? 'P' : issue.type === 'empty' ? 'BOS' : 'Y?'}
                          </span>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '3px' }}>
                          {issue.staff.dept_name || '-'}{issue.work_location_name ? ` - ${issue.work_location_name}` : ''}
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text2)', marginTop: '4px', lineHeight: 1.35 }}>
                          {issue.label} - {issue.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Gun listesi yukleniyor.</div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px', minHeight: '220px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', marginBottom: '10px' }}>ISLEM GECMISI</div>
            {(approval?.events || []).length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Bu ay icin onay hareketi yok.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '34vh', overflow: 'auto' }}>
                {approval.events.map(event => {
                  const eventMeta = approvalStatusMeta(event.status)
                  return (
                    <div key={event.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', padding: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ color: eventMeta.color, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 800 }}>{event.action}</span>
                        <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '8px' }}>{approvalTime(event.created_at)}</span>
                      </div>
                      <div style={{ fontSize: '10px', marginTop: '3px' }}>{event.user_name || '-'}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '2px' }}>{event.work_date || event.period}</div>
                      {event.note && <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '5px', lineHeight: 1.35 }}>{event.note}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PuantajSummaryView({ filtered, formatMoney }) {
  const byDept = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = r.dept_name || 'Departmansız'
      if (!map[key]) map[key] = { name: key, staff: 0, worked: 0, absent: 0, overtime: 0, leave: 0, gross: 0, net: 0, employer: 0 }
      const d = map[key]
      d.staff++
      d.worked += r.worked_days || 0
      d.absent += r.absent_days || 0
      d.overtime += r.overtime_hours || 0
      d.leave += r.leave_days || 0
      d.gross += r.gross || 0
      d.net += r.net || 0
      d.employer += r.employer_total_cost || 0
    })
    return Object.values(map)
  }, [filtered])

  if (byDept.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">🏢</div>
      <div className="empty-title">KAYIT YOK</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
      {byDept.map(d => (
        <div key={d.name} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>{d.name}</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>{d.staff} kişi</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {[
              ['Çalışılan', `${d.worked} gün`, 'var(--green)'],
              ['Devamsız', `${d.absent} gün`, 'var(--red)'],
              ['Mesai', `${d.overtime}s`, 'var(--accent)'],
              ['İzin', `${d.leave} gün`, 'var(--purple)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--surface2)', borderRadius: '6px', padding: '6px 8px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '14px', color, marginTop: '2px' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: 'var(--text3)' }}>Brüt Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatMoney(d.gross)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: 'var(--text3)' }}>Net Toplam</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(d.net)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span style={{ color: 'var(--text3)' }}>İşveren Maliyeti</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(d.employer)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PuantajClosurePanel({ audit, canEdit, isLocked, monthLabel, onOpenCalendar, onOpenControl, onSyncScheduled, syncing }) {
  const blockingCount = audit.staffIssues.filter(issue => issue.scheduled > 0 || issue.empty > 0 || issue.off === 0 || issue.absentWithoutReason > 0).length
  const topIssues = audit.staffIssues.slice(0, 5)
  const cards = [
    ['Kapanış', audit.readyToClose ? 'Hazır' : 'Kontrol', audit.readyToClose ? 'var(--green)' : 'var(--accent)'],
    ['Tamamlanma', `%${audit.completionRate}`, audit.completionRate >= 95 ? 'var(--green)' : audit.completionRate >= 80 ? 'var(--accent)' : 'var(--red)'],
    ['Planlı Kalan', audit.totals.scheduled, audit.totals.scheduled > 0 ? 'var(--accent)' : 'var(--green)'],
    ['Boş Gün', audit.totals.empty, audit.totals.empty > 0 ? 'var(--red)' : 'var(--green)'],
    ['OFF Eksik', audit.missingOffStaff, audit.missingOffStaff > 0 ? 'var(--red)' : 'var(--green)'],
    ['Nedensiz Y', audit.totals.absentWithoutReason, audit.totals.absentWithoutReason > 0 ? 'var(--red)' : 'var(--green)'],
    ['Devamsız', audit.totals.absent, audit.totals.absent > 0 ? 'var(--red)' : 'var(--text2)'],
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '10px',
      marginBottom: '12px',
    }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>PUANTAJ KAPANIŞ KONTROLÜ</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {monthLabel} · {audit.staffCount} personel · {blockingCount} kontrol gerektiren kişi
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onOpenControl} style={{ fontSize: '10px' }}>Kontrol</button>
            <button className="btn btn-ghost btn-sm" onClick={onOpenCalendar} style={{ fontSize: '10px' }}>Takvim</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!canEdit || isLocked || syncing || audit.scheduledCells.length === 0}
              onClick={onSyncScheduled}
              style={{ fontSize: '10px' }}
              title="Vardiya çizelgesinden kalan P planlı günleri N çalıştı olarak puantaja işler"
            >
              {syncing ? 'İşleniyor...' : `P → N (${audit.scheduledCells.length})`}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '8px' }}>
          {cards.map(([label, value, color]) => (
            <div key={label} style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--surface2)',
              padding: '9px 10px',
              minHeight: '58px',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '.8px' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color, marginTop: '4px', lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', padding: '12px', minHeight: '130px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>ÖNE ÇIKAN KONTROLLER</div>
        {topIssues.length === 0 ? (
          <div style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: '14px' }}>Kapanış için kritik eksik görünmüyor.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {topIssues.map(issue => (
              <button
                key={issue.staff.id}
                type="button"
                onClick={onOpenControl}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  borderRadius: '7px',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  padding: '7px 8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.staff.full_name}</span>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{issue.issueCount}</span>
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.35 }}>
                  {issue.issueLabels.join(' · ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PuantajControlView({ audit, monthLabel, canEdit, isLocked, onOpenCalendar, onSyncScheduled, syncing, onPersonClick }) {
  const [issueFilter, setIssueFilter] = useState('blocking')
  const issueRows = useMemo(() => {
    const rows = audit.staffIssues || []
    if (issueFilter === 'planned') return rows.filter(row => row.scheduled > 0)
    if (issueFilter === 'empty') return rows.filter(row => row.empty > 0)
    if (issueFilter === 'off') return rows.filter(row => row.off === 0)
    if (issueFilter === 'reason') return rows.filter(row => row.absentWithoutReason > 0)
    if (issueFilter === 'absent') return rows.filter(row => row.absent > 0)
    return rows.filter(row => row.scheduled > 0 || row.empty > 0 || row.off === 0 || row.absentWithoutReason > 0)
  }, [audit.staffIssues, issueFilter])

  const deptRows = useMemo(() => {
    const map = new Map()
    ;(audit.staffIssues || []).forEach(issue => {
      const name = issue.staff.dept_name || 'Departmansız'
      if (!map.has(name)) map.set(name, { name, people: 0, scheduled: 0, empty: 0, missingOff: 0, reason: 0, absent: 0 })
      const row = map.get(name)
      row.people += 1
      row.scheduled += issue.scheduled || 0
      row.empty += issue.empty || 0
      row.missingOff += issue.off === 0 ? 1 : 0
      row.reason += issue.absentWithoutReason || 0
      row.absent += issue.absent || 0
    })
    return [...map.values()].sort((a, b) => (
      (b.scheduled + b.empty + b.reason + b.missingOff) - (a.scheduled + a.empty + a.reason + a.missingOff)
      || a.name.localeCompare(b.name, 'tr')
    ))
  }, [audit.staffIssues])

  const workflow = [
    {
      label: 'Planlı günleri kapat',
      value: `${audit.totals.scheduled} P`,
      ok: audit.totals.scheduled === 0,
      action: onSyncScheduled,
      disabled: !canEdit || isLocked || syncing || audit.totals.scheduled === 0,
      actionLabel: syncing ? 'İşleniyor' : 'P → N',
    },
    {
      label: 'Boş günleri temizle',
      value: `${audit.totals.empty} boş`,
      ok: audit.totals.empty === 0,
      action: onOpenCalendar,
      actionLabel: 'Takvim',
    },
    {
      label: 'Haftalık izin kontrolü',
      value: `${audit.missingOffStaff} kişi`,
      ok: audit.missingOffStaff === 0,
      action: onOpenCalendar,
      actionLabel: 'Takvim',
    },
    {
      label: 'Devamsızlık nedeni',
      value: `${audit.totals.absentWithoutReason} eksik`,
      ok: audit.totals.absentWithoutReason === 0,
      action: onOpenCalendar,
      actionLabel: 'Takvim',
    },
  ]

  const filterButtons = [
    ['blocking', 'Kapanış'],
    ['planned', 'Planlı'],
    ['empty', 'Boş'],
    ['off', 'OFF'],
    ['reason', 'Y Nedeni'],
    ['absent', 'Devamsız'],
  ]

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: '10px',
      }}>
        {workflow.map(step => (
          <div key={step.label} style={{
            border: `1px solid ${step.ok ? 'rgba(34,197,94,.35)' : 'rgba(240,165,0,.45)'}`,
            borderRadius: '10px',
            background: step.ok ? 'rgba(34,197,94,.08)' : 'rgba(240,165,0,.08)',
            padding: '12px',
            minHeight: '92px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '.8px' }}>{step.ok ? 'TAMAM' : 'KONTROL'}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '14px', marginTop: '4px' }}>{step.label}</div>
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', color: step.ok ? 'var(--green)' : 'var(--accent)', whiteSpace: 'nowrap' }}>{step.value}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={step.disabled}
              onClick={step.action}
              style={{ marginTop: '10px', width: '100%', fontSize: '10px' }}
            >
              {step.actionLabel}
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">GÜNLÜK KONTROL</div>
              <div className="panel-subtitle">{monthLabel} · gün gün kapanış durumu</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onOpenCalendar} style={{ fontSize: '10px' }}>Takvim</button>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: '360px', overflow: 'auto' }}>
            <table className="data-table" style={{ fontSize: '10px' }}>
              <thead>
                <tr>
                  <th>TARİH</th>
                  <th style={{ textAlign: 'center' }}>N</th>
                  <th style={{ textAlign: 'center' }}>İZİN</th>
                  <th style={{ textAlign: 'center' }}>P</th>
                  <th style={{ textAlign: 'center' }}>BOŞ</th>
                  <th style={{ textAlign: 'center' }}>Y</th>
                  <th style={{ textAlign: 'center' }}>DURUM</th>
                </tr>
              </thead>
              <tbody>
                {audit.dailyRows.map(day => {
                  const unresolved = (day.scheduled || 0) + (day.empty || 0)
                  const statusColor = unresolved > 0 ? 'var(--accent)' : day.absentWithoutReason > 0 ? 'var(--red)' : 'var(--green)'
                  return (
                    <tr key={day.date}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{day.date.slice(8, 10)} · {DAY_SHORT[day.weekday]}</div>
                        {day.isHoliday && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)' }}>RT</div>}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{day.worked || '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>{(day.off + day.leave) || '—'}</td>
                      <td style={{ textAlign: 'center', color: day.scheduled ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{day.scheduled || '—'}</td>
                      <td style={{ textAlign: 'center', color: day.empty ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{day.empty || '—'}</td>
                      <td style={{ textAlign: 'center', color: day.absent ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{day.absent || '—'}</td>
                      <td style={{ textAlign: 'center', color: statusColor, fontFamily: 'var(--mono)', fontWeight: 800 }}>
                        {unresolved > 0 ? 'Kontrol' : day.absentWithoutReason > 0 ? 'Y nedeni' : 'Hazır'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">DEPARTMAN RİSKİ</div>
              <div className="panel-subtitle">Sorun yoğunluğu yüksek bölümler</div>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: '8px' }}>
            {deptRows.length === 0 ? (
              <div style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: '14px' }}>Departman bazında açık kontrol yok.</div>
            ) : deptRows.slice(0, 8).map(row => (
              <div key={row.name} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 10px', background: 'var(--surface2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: 700, fontSize: '12px' }}>
                  <span>{row.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{row.people} kişi</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                  {[
                    ['P', row.scheduled, 'var(--accent)'],
                    ['Boş', row.empty, 'var(--red)'],
                    ['OFF', row.missingOff, 'var(--red)'],
                    ['Y Not', row.reason, 'var(--red)'],
                    ['Y', row.absent, 'var(--text3)'],
                  ].filter(([, value]) => value > 0).map(([label, value, color]) => (
                    <span key={label} style={{ fontFamily: 'var(--mono)', fontSize: '9px', color, border: '1px solid var(--border)', borderRadius: '5px', padding: '2px 5px' }}>
                      {label}:{value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">PERSONEL KAPANIŞ LİSTESİ</div>
            <div className="panel-subtitle">{issueRows.length} kayıt · filtreli kontrol listesi</div>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {filterButtons.map(([id, label]) => (
              <button key={id} className={`filter-chip ${issueFilter === id ? 'active' : ''}`} onClick={() => setIssueFilter(id)} style={{ fontSize: '9px', padding: '3px 8px' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: '11px' }}>
            <thead>
              <tr>
                <th>PERSONEL</th>
                <th>DEPARTMAN</th>
                <th style={{ textAlign: 'center' }}>P</th>
                <th style={{ textAlign: 'center' }}>BOŞ</th>
                <th style={{ textAlign: 'center' }}>h</th>
                <th style={{ textAlign: 'center' }}>Y</th>
                <th style={{ textAlign: 'center' }}>Y NOT</th>
                <th>NOT</th>
              </tr>
            </thead>
            <tbody>
              {issueRows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--green)', padding: '20px' }}>Bu filtrede kontrol gerektiren kayıt yok.</td></tr>
              ) : issueRows.map(issue => (
                <tr key={issue.staff.id} onClick={() => onPersonClick?.(issue.staff)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700 }}>{issue.staff.full_name}</td>
                  <td>{issue.staff.dept_name || '—'}</td>
                  <td style={{ textAlign: 'center', color: issue.scheduled ? 'var(--accent)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{issue.scheduled || '—'}</td>
                  <td style={{ textAlign: 'center', color: issue.empty ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{issue.empty || '—'}</td>
                  <td style={{ textAlign: 'center', color: issue.off === 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)' }}>{issue.off || '—'}</td>
                  <td style={{ textAlign: 'center', color: issue.absent ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{issue.absent || '—'}</td>
                  <td style={{ textAlign: 'center', color: issue.absentWithoutReason ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--mono)' }}>{issue.absentWithoutReason || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{issue.issueLabels.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PuantajCalendarView({ filtered, month, deptFilter, y, m, isLoading, canEdit, selectedAction, setSelectedAction, onApplyStatus, updatingKeys, onPersonClick }) {
  const [dayData, setDayData] = useState({}) // staffId → days array

  const [entryMode, setEntryMode] = useState('cell')
  const paintingRef = useRef(false)
  const paintedKeysRef = useRef(new Set())

  // Excel-grid etkileşimi: aktif hücre + Shift seçim çapası + undo yığını
  const [activeCell, setActiveCell] = useState(null) // { row: filtered index, day: 1..31 }
  const [anchor, setAnchor] = useState(null)
  const [undoCount, setUndoCount] = useState(0)
  const undoStackRef = useRef([])
  const [cellEditor, setCellEditor] = useState(null) // sağ tık → { staff, date, entry }

  const daysInMonth = new Date(y, m, 0).getDate()

  // Resmi tatiller — kolon vurgusu + tatil çalışması sayacı
  const { data: holidayRows = [] } = useQuery({
    queryKey: ['holidays', y],
    queryFn: () => api.get('/shifts/holidays', { params: { year: y } }).then(res => res.data),
  })
  const holidayMap = useMemo(() => {
    const map = new Map()
    holidayRows.forEach(h => { if (h.date?.startsWith(month)) map.set(h.date, h) })
    return map
  }, [holidayRows, month])
  const holidayDays = useMemo(
    () => new Set([...holidayMap.keys()].map(d => parseInt(d.split('-')[2], 10))),
    [holidayMap]
  )
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const { data: monthDayData, isFetching: daysFetching } = useQuery({
    queryKey: ['puantaj-days-month', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj/days', { params }).then(res => res.data.days || {})
    },
    enabled: !isLoading,
  })

  useEffect(() => {
    setDayData({})
  }, [month, deptFilter])

  useEffect(() => {
    if (monthDayData) setDayData(monthDayData)
  }, [monthDayData])

  useEffect(() => {
    const stopPainting = () => { paintingRef.current = false }
    window.addEventListener('mouseup', stopPainting)
    return () => window.removeEventListener('mouseup', stopPainting)
  }, [])

  // Sunday indices (day of week for day 1)
  const sundayDays = new Set(dayNumbers.filter(d => new Date(y, m - 1, d).getDay() === 0))
  const loadedDayRows = filtered.flatMap(row => dayData[row.id] || [])
  const monthTotals = summarizeCalendarDays(loadedDayRows)

  const emptyMonthDays = () => dayNumbers.map(d => {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const dow = new Date(y, m - 1, d).getDay()
    return { date, day_of_week: dow, status: dow === 0 ? 'sunday' : 'no_record' }
  })

  const replaceLocalDays = (changes) => {
    setDayData(prev => {
      const next = { ...prev }
      changes.forEach(change => {
        const staffId = change.staff.id
        next[staffId] = (next[staffId] || emptyMonthDays())
          .map(d => d.date === change.date ? change.nextEntry : d)
      })
      return next
    })
  }

  const buildLocalEntry = (date, action, entry) => {
    const dow = new Date(date).getDay()
    if (action.status === 'clear') return { date, day_of_week: dow, status: dow === 0 ? 'sunday' : 'no_record' }
    const next = { date, day_of_week: dow, status: action.status }
    if (action.leave_type) next.leave_type = action.leave_type
    if (['worked', 'scheduled', 'overtime'].includes(action.status)) {
      if (entry?.shift_def_id) next.shift_def_id = entry.shift_def_id
      if (entry?.shift_name) next.shift_name = entry.shift_name
      if (entry?.start_hour != null) next.start_hour = entry.start_hour
      if (entry?.end_hour != null) next.end_hour = entry.end_hour
      if (entry?.work_location_id) next.work_location_id = entry.work_location_id
      if (entry?.work_location_name) next.work_location_name = entry.work_location_name
      if (entry?.work_location_color) next.work_location_color = entry.work_location_color
    }
    return next
  }

  const buildChange = (row, day, entry, action = selectedAction) => {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const nextEntry = buildLocalEntry(date, action, entry)
    return { staff: row, date, entry, action, nextEntry }
  }

  const applyChanges = (changes, action = selectedAction) => {
    if (!canEdit || !action || changes.length === 0) return
    onApplyStatus({
      changes,
      action,
      onLocalUpdate: () => {
        replaceLocalDays(changes)
        if (action.status !== 'restore') {
          undoStackRef.current = pushUndo(undoStackRef.current, changes)
          setUndoCount(undoStackRef.current.length)
        }
      },
    })
  }

  const entryFor = (row, day) => {
    const dayStr = String(day).padStart(2, '0')
    return (dayData[row.id] || []).find(d => d.date.endsWith(`-${dayStr}`))
  }

  const applyCell = (row, day, entry) => {
    applyChanges([buildChange(row, day, entry)])
  }

  const applyRow = (row) => {
    const days = selectedAction.status === 'clear' ? dayNumbers : dayNumbers.filter(d => !sundayDays.has(d))
    applyChanges(days.map(day => buildChange(row, day, entryFor(row, day))))
  }

  const applyColumn = (day) => {
    applyChanges(filtered.map(row => buildChange(row, day, entryFor(row, day))))
  }

  // Seçili dikdörtgene (yoksa aktif hücreye) kodu uygula
  const selectionRect = anchor && activeCell ? normalizeRect(anchor, activeCell) : null

  const applyActionToSelection = (action) => {
    if (!canEdit || !action) return
    const cells = selectionRect ? cellsInRect(selectionRect) : (activeCell ? [activeCell] : [])
    const changes = cells
      .filter(c => filtered[c.row])
      .map(c => buildChange(filtered[c.row], c.day, entryFor(filtered[c.row], c.day), action))
    applyChanges(changes, action)
  }

  const undoLast = () => {
    const batch = undoStackRef.current[undoStackRef.current.length - 1]
    if (!batch) return
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setUndoCount(undoStackRef.current.length)
    const emptyEntryFor = (date) => {
      const dow = new Date(date).getDay()
      return { date, day_of_week: dow, status: dow === 0 ? 'sunday' : 'no_record' }
    }
    // Ters uygulama: batch'in "önceki" durumları hedef olur
    const changes = batch.map(c => ({
      staff: c.staff,
      date: c.date,
      entry: c.nextEntry,
      nextEntry: c.entry || emptyEntryFor(c.date),
    }))
    applyChanges(changes, { id: 'restore', status: 'restore', label: 'Geri al' })
  }

  const handleGridKeyDown = (e) => {
    if (!canEdit || filtered.length === 0) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase('tr') === 'z') {
      e.preventDefault()
      undoLast()
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault()
      const base = activeCell || { row: 0, day: 1 }
      if (e.shiftKey) { if (!anchor) setAnchor(base) } else setAnchor(null)
      setActiveCell(moveCell(base, e.key, filtered.length - 1, daysInMonth))
      return
    }
    if (e.key === 'Escape') { setAnchor(null); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      applyActionToSelection(ACTION_BY_ID.clear)
      return
    }
    const actionId = actionIdForKey(e.key)
    if (actionId && ACTION_BY_ID[actionId]) {
      e.preventDefault()
      applyActionToSelection(ACTION_BY_ID[actionId])
    }
  }

  const clickCell = (row, day, entry, rowIdx, event) => {
    if (entryMode === 'paint') return
    if (event.shiftKey && activeCell) {
      // Excel gibi: Shift+tık — aktif hücreden tıklanana dikdörtgen, seçili kodla doldur
      const rect = normalizeRect(activeCell, { row: rowIdx, day })
      const changes = cellsInRect(rect)
        .filter(c => filtered[c.row])
        .map(c => buildChange(filtered[c.row], c.day, entryFor(filtered[c.row], c.day)))
      applyChanges(changes)
      setAnchor(activeCell)
      setActiveCell({ row: rowIdx, day })
      return
    }
    setAnchor(null)
    setActiveCell({ row: rowIdx, day })
    applyCell(row, day, entry)
  }

  const paintCell = (row, day, entry) => {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const key = `${row.id}-${date}`
    if (paintedKeysRef.current.has(key)) return
    paintedKeysRef.current.add(key)
    applyCell(row, day, entry)
  }

  const beginPaint = (row, day, entry, event) => {
    if (entryMode !== 'paint' || event.button !== 0) return
    event.preventDefault()
    paintingRef.current = true
    paintedKeysRef.current = new Set()
    paintCell(row, day, entry)
  }

  const enterPaint = (row, day, entry) => {
    if (entryMode !== 'paint' || !paintingRef.current) return
    paintCell(row, day, entry)
  }

  if (isLoading || (daysFetching && Object.keys(dayData).length === 0)) return <SkeletonTable rows={6} cols={32} />

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: '8px',
        marginBottom: '10px',
      }}>
        {[
          ['N', 'Normal', monthTotals.worked, ACTION_BY_ID.worked],
          ['h', 'Haftalık', monthTotals.off, ACTION_BY_ID.off],
          ['r', 'Raporlu', monthTotals.sick, ACTION_BY_ID.sick],
          ['üi', 'Ücretsiz', monthTotals.unpaid, ACTION_BY_ID.unpaid],
          ['Y', 'Gelmedi', monthTotals.absent, ACTION_BY_ID.absent],
        ].map(([code, label, value, meta]) => (
          <div key={code} style={{
            border: `1px solid ${meta.border}`,
            background: meta.bg,
            borderRadius: '8px',
            padding: '8px 10px',
            minHeight: '54px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', color: meta.text, lineHeight: 1 }}>{value}</div>
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: code.length > 1 ? '12px' : '16px', fontWeight: 800, color: meta.text }}>{code}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: '10px',
        padding: '8px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'var(--surface)',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginRight: '2px' }}>KOD</span>
        {PUANTAJ_ACTIONS.map(action => {
          const active = selectedAction.id === action.id
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedAction(action)}
              title={action.label}
              disabled={!canEdit}
              style={{
                minWidth: action.code.length > 1 ? '46px' : '36px',
                height: '32px',
                borderRadius: '7px',
                border: `2px solid ${active ? action.text : action.border}`,
                background: active ? action.bg : 'var(--surface2)',
                color: active ? action.text : 'var(--text2)',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--mono)',
                fontSize: action.code.length > 1 ? '10px' : '12px',
                fontWeight: 800,
              }}
            >
              {action.code}
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '2px', marginLeft: '8px' }}>
          {[
            ['cell', 'Hucre'],
            ['paint', 'Boya'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={!canEdit}
              onClick={() => setEntryMode(id)}
              title={id === 'paint' ? 'Basili tutup hucrelerin uzerinden gecerek giris yap' : 'Tek hucreye tiklayarak giris yap'}
              style={{
                border: 'none',
                borderRadius: '5px',
                background: entryMode === id ? 'var(--accent)' : 'transparent',
                color: entryMode === id ? '#000' : 'var(--text3)',
                cursor: canEdit ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--mono)',
                fontSize: '9px',
                padding: '5px 8px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!canEdit || undoCount === 0}
          onClick={undoLast}
          title="Son işlemi geri al (Ctrl+Z)"
          style={{
            height: '32px',
            padding: '0 10px',
            borderRadius: '7px',
            border: '1px solid var(--border)',
            background: 'var(--surface2)',
            color: undoCount > 0 ? 'var(--accent)' : 'var(--text3)',
            cursor: canEdit && undoCount > 0 ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            fontWeight: 800,
            marginLeft: '8px',
          }}
        >
          ↩ {undoCount > 0 ? `(${undoCount})` : ''}
        </button>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: canEdit ? 'var(--text3)' : 'var(--red)' }}>
          {canEdit ? selectedAction.label : 'Sadece yetkili kullanıcı giriş yapabilir'}
        </span>
      </div>

      {canEdit && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginBottom: '8px', letterSpacing: '0.4px' }}>
          ⌨ Ok tuşları: gezin · Shift+ok / Shift+tık: aralık seç · N=çalıştı H=hafta izni R=rapor Ü=ücretsiz İ=yıllık Y=gelmedi P=planlı · Del: sil · Ctrl+Z: geri al · Sağ tık: FM saati / devamsızlık nedeni · <span style={{ color: 'var(--red)' }}>RT=resmi tatil</span>
        </div>
      )}

      <div
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        style={{ overflow: 'auto', maxHeight: '68vh', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface)', outline: 'none' }}
      >
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '10px', width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, top: 0, background: 'var(--surface)', zIndex: 6, minWidth: '230px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
              PERSONEL
            </th>
            {dayNumbers.map(d => {
              const isHoliday = holidayDays.has(d)
              const holidayName = isHoliday ? holidayMap.get(`${month}-${String(d).padStart(2, '0')}`)?.name : null
              const headColor = isHoliday ? 'var(--red)' : sundayDays.has(d) ? 'var(--accent)' : 'var(--text3)'
              return (
              <th key={d} title={holidayName || undefined} style={{
                position: 'sticky', top: 0, zIndex: 5,
                width: '42px', textAlign: 'center', padding: '5px 0',
                borderBottom: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                background: isHoliday
                  ? 'linear-gradient(rgba(239,68,68,.08), rgba(239,68,68,.08)) var(--surface)'
                  : sundayDays.has(d) ? 'linear-gradient(rgba(240,165,0,.06), rgba(240,165,0,.06)) var(--surface)' : 'var(--surface)',
                color: headColor,
                fontFamily: 'var(--mono)', fontSize: '9px',
              }}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => applyColumn(d)}
                  title={holidayName ? `${holidayName} — bu günü tüm listeye seçili kodla doldur` : 'Bu gunu tum listeye secili kodla doldur'}
                  style={{
                    width: '30px',
                    height: '22px',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    background: canEdit ? 'var(--surface2)' : 'transparent',
                    color: isHoliday ? 'var(--red)' : sundayDays.has(d) ? 'var(--accent)' : 'var(--text2)',
                    cursor: canEdit ? 'pointer' : 'default',
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {d}
                </button>
                <div style={{ fontSize: '7px', opacity: .75 }}>{isHoliday ? 'RT' : new Date(y, m - 1, d).toLocaleDateString('tr-TR', { weekday: 'short' }).slice(0, 3)}</div>
              </th>
            )})}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, rowIdx) => {
            const days = dayData[r.id] || []
            const dayMap = {}
            days.forEach(d => { dayMap[d.date.split('-')[2]] = d })
            const rowStats = summarizeCalendarDays(days)
            const rowFmHours = days.reduce((s, dd) => s + (dd.overtime_hours || 0), 0)
            const rowHolidayWorked = days.filter(dd => holidayMap.has(dd.date) && ['worked', 'overtime'].includes(dd.status)).length

            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '7px 10px', fontWeight: '500', zIndex: 3, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--display)',
                      fontSize: '12px',
                      flexShrink: 0,
                    }}>{r.full_name?.charAt(0)?.toUpperCase() || '?'}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <button
                        type="button"
                        onClick={() => onPersonClick?.(r)}
                        title="Personel detayini ac"
                        style={{
                          display: 'block',
                          width: '100%',
                          maxWidth: '155px',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          padding: 0,
                        }}
                      >
                        {r.full_name}
                      </button>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '155px' }}>{r.dept_name || 'Departmansız'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => applyRow(r)}
                    title="Bu personelin ayini secili kodla doldur"
                    style={{
                      width: '100%',
                      marginTop: '6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface2)',
                      color: canEdit ? 'var(--accent)' : 'var(--text3)',
                      cursor: canEdit ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--mono)',
                      fontSize: '8px',
                      fontWeight: 800,
                      padding: '3px 6px',
                    }}
                  >
                    Ayi secili kodla doldur
                  </button>
                  <div style={{ display: 'flex', gap: '3px', marginTop: '5px', flexWrap: 'wrap' }}>
                    {[
                      ['N', rowStats.worked, ACTION_BY_ID.worked],
                      ['h', rowStats.off, ACTION_BY_ID.off],
                      ['r', rowStats.sick, ACTION_BY_ID.sick],
                      ['üi', rowStats.unpaid, ACTION_BY_ID.unpaid],
                      ['Y', rowStats.absent, ACTION_BY_ID.absent],
                      ['T', rowHolidayWorked, { text: 'var(--red)', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.4)' }],
                      ['FM', rowFmHours ? `${rowFmHours}s` : 0, { text: 'var(--accent)', bg: 'rgba(240,165,0,.12)', border: 'rgba(240,165,0,.4)' }],
                    ].filter(([, value]) => value && value !== 0).map(([code, value, meta]) => (
                      <span key={code} style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: meta.text, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: '4px', padding: '1px 4px' }}>{code}:{value}</span>
                    ))}
                  </div>
                </td>
                {dayNumbers.map(d => {
                  const dayStr = String(d).padStart(2, '0')
                  const entry = dayMap[dayStr]
                  const date = `${month}-${dayStr}`
                  const status = entry?.status || (sundayDays.has(d) ? 'sunday' : 'no_record')
                  const meta = dayStatusMeta(entry, sundayDays.has(d))
                  const busy = updatingKeys?.has(`${r.id}-${date}`)
                  const hours = entry?.start_hour != null ? formatShiftHours(entry.start_hour, entry.end_hour) : ''
                  const holidayName = holidayMap.get(date)?.name
                  const title = `${r.full_name} · ${date} · ${meta.label}`
                    + (hours ? ` · ${hours}` : '')
                    + (entry?.work_location_name ? ` · ${entry.work_location_name}` : '')
                    + (holidayName ? ` · 🎌 ${holidayName}` : '')
                    + (entry?.overtime_hours ? ` · FM ${entry.overtime_hours}s` : '')
                    + (entry?.absent_reason ? ` · Neden: ${entry.absent_reason}` : '')
                    + (canEdit ? ' · sağ tık: FM/neden' : '')
                  const isActive = activeCell?.row === rowIdx && activeCell?.day === d
                  const inSelection = isInRect(selectionRect, rowIdx, d)
                  return (
                    <td key={d}
                      style={{
                        width: '42px', textAlign: 'center', padding: '3px',
                        background: inSelection ? 'rgba(240,165,0,.12)'
                          : holidayDays.has(d) ? 'rgba(239,68,68,.05)'
                          : sundayDays.has(d) ? 'rgba(240,165,0,.035)' : 'transparent',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                      <button
                        type="button"
                        title={title}
                        disabled={!canEdit || busy}
                        onContextMenu={e => {
                          e.preventDefault()
                          if (canEdit) setCellEditor({ staff: r, date, entry })
                        }}
                        onMouseDown={e => beginPaint(r, d, entry, e)}
                        onMouseEnter={e => {
                          enterPaint(r, d, entry)
                          if (canEdit) e.currentTarget.style.filter = 'brightness(1.12)'
                        }}
                        onClick={e => clickCell(r, d, entry, rowIdx, e)}
                        style={{
                          width: '34px',
                          height: '30px',
                          borderRadius: '7px',
                          border: status === 'no_record' || status === 'sunday' ? `1px dashed ${meta.border}` : `1px solid ${meta.border}`,
                          boxShadow: isActive ? '0 0 0 2px var(--accent)' : 'none',
                          position: 'relative',
                          background: meta.bg,
                          color: meta.text,
                          cursor: canEdit ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: meta.code?.length > 1 ? '9px' : '12px',
                          fontWeight: 800,
                          opacity: busy ? .55 : 1,
                          transition: 'transform .08s, filter .12s',
                        }}
                        onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
                      >
                        {busy ? '...' : meta.code}
                        {!busy && entry?.overtime_hours ? (
                          <span style={{ position: 'absolute', top: '0px', right: '1px', fontSize: '6px', lineHeight: 1, color: 'var(--accent)', fontWeight: 800 }}>
                            +{entry.overtime_hours}
                          </span>
                        ) : null}
                        {!busy && entry?.absent_reason ? (
                          <span style={{ position: 'absolute', bottom: '0px', right: '2px', fontSize: '7px', lineHeight: 1, color: 'var(--red)' }}>•</span>
                        ) : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ position: 'sticky', left: 0, bottom: 0, background: 'var(--surface2)', zIndex: 6, padding: '6px 10px', borderTop: '2px solid var(--border)', borderRight: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px' }}>
              GÜN TOPLAMI
              <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                <span style={{ color: ACTION_BY_ID.worked.text }}>■ çalışan</span>
                <span style={{ color: 'var(--purple)' }}>■ izin</span>
                <span style={{ color: ACTION_BY_ID.absent.text }}>■ yok</span>
              </div>
            </td>
            {dayNumbers.map(d => {
              const dayStr = String(d).padStart(2, '0')
              const col = summarizeColumn(filtered.map(r => (dayData[r.id] || []).find(x => x.date.endsWith(`-${dayStr}`))))
              const leaveTotal = col.leave + col.off
              return (
                <td key={d} style={{
                  position: 'sticky', bottom: 0, zIndex: 5,
                  textAlign: 'center', padding: '4px 0',
                  borderTop: '2px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  background: 'var(--surface2)',
                  fontFamily: 'var(--mono)', fontSize: '9px', lineHeight: 1.35,
                }}>
                  <div style={{ color: col.worked > 0 ? ACTION_BY_ID.worked.text : 'var(--text3)', fontWeight: 800 }}>{col.worked || '·'}</div>
                  <div style={{ color: leaveTotal > 0 ? 'var(--purple)' : 'var(--text3)', fontSize: '8px' }}>{leaveTotal || '·'}</div>
                  <div style={{ color: col.absent > 0 ? ACTION_BY_ID.absent.text : 'var(--text3)', fontSize: '8px' }}>{col.absent || '·'}</div>
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
      </div>

      {cellEditor && (
        <PuantajCellEditor
          editor={cellEditor}
          holidayName={holidayMap.get(cellEditor.date)?.name}
          onClose={() => setCellEditor(null)}
        />
      )}
    </div>
  )
}

// Sağ tık hücre editörü — FM saati (overtime_records upsert) + devamsızlık nedeni
function PuantajCellEditor({ editor, holidayName, onClose }) {
  const qc = useQueryClient()
  const { staff, date, entry } = editor
  const [fmHours, setFmHours] = useState(entry?.overtime_hours ?? '')
  const [reason, setReason] = useState(entry?.absent_reason || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isAbsent = entry?.status === 'absent'
  const statusMeta = dayStatusMeta(entry, new Date(date).getDay() === 0)

  const save = async () => {
    const hours = fmHours === '' ? 0 : Number(fmHours)
    if (!Number.isFinite(hours) || hours < 0 || hours > 12) {
      setError('Mesai saati 0-12 arasında olmalı')
      return
    }
    setSaving(true)
    setError('')
    try {
      if ((entry?.overtime_hours || 0) !== hours) {
        await api.post('/shifts/overtime/day', { staff_id: staff.id, work_date: date, hours })
      }
      if (isAbsent && (entry?.absent_reason || '') !== reason.trim()) {
        await api.post('/shifts/schedule', {
          entries: [{
            staff_id: staff.id,
            dept_id: staff.department_id || null,
            shift_def_id: null,
            work_date: date,
            status: 'absent',
            absent_reason: reason.trim() || null,
          }]
        })
      }
      qc.invalidateQueries({ queryKey: ['puantaj'] })
      qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
      onClose()
    } catch (e) {
      setSaving(false)
      setError(e?.response?.data?.error || 'Kaydedilemedi')
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '15px', letterSpacing: '0.5px' }}>{staff.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {date} · {statusMeta.label}{holidayName ? ` · 🎌 ${holidayName}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <div>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>
            FAZLA MESAİ (saat, 0 = sil)
          </label>
          <input
            className="form-input"
            type="number"
            min="0"
            max="12"
            step="0.5"
            value={fmHours}
            onChange={e => setFmHours(e.target.value)}
            style={{ width: '120px', fontSize: '12px' }}
          />
        </div>

        {isAbsent && (
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: '4px' }}>
              DEVAMSIZLIK NEDENİ (opsiyonel)
            </label>
            <input
              className="form-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={200}
              placeholder="Örn. mazeretsiz, geç bildirim..."
              style={{ width: '100%', fontSize: '12px' }}
            />
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: '11px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Vazgeç</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

function PuantajListView({ filtered, totals, isLoading, month, monthLabel, showEmployer, sortBy, setSortBy, formatMoney, onRowClick }) {
  const SORTS = [{ id: 'name', label: 'AD' }, { id: 'worked', label: 'ÇALIŞTI' }, { id: 'absent', label: 'DEVAMSIZ' }, { id: 'net', label: 'NET' }]

  if (isLoading) return <SkeletonTable rows={8} cols={5} />
  if (filtered.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <div className="empty-title">KAYIT YOK</div>
      <div className="empty-desc">Bu ay için puantaj verisi bulunamadı.</div>
    </div>
  )

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">PUANTAJ TABLOSU</div>
          <div className="panel-subtitle">{filtered.length} personel · {monthLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SORTS.map(s => (
            <button key={s.id} className={`filter-chip ${sortBy === s.id ? 'active' : ''}`}
              onClick={() => setSortBy(s.id)} style={{ fontSize: '9px', padding: '3px 8px' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '11px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2, minWidth: '140px' }}>AD SOYAD</th>
              <th>DEPT</th>
              <th style={{ textAlign: 'center' }}>DEVAM %</th>
              <th style={{ textAlign: 'center', color: 'var(--green)' }}>İŞ</th>
              <th style={{ textAlign: 'center', color: 'var(--purple)' }}>İZİN TÜRÜ</th>
              <th style={{ textAlign: 'center', color: 'var(--red)' }}>YOK</th>
              <th style={{ textAlign: 'center', color: 'var(--accent)' }}>MESAİ</th>
              <th style={{ textAlign: 'right' }}>BRÜT</th>
              <th style={{ textAlign: 'right' }}>KESİNTİ</th>
              <th style={{ textAlign: 'right', color: 'var(--green)' }}>NET</th>
              {showEmployer && <th style={{ textAlign: 'right', color: 'var(--teal)' }}>İŞVEREN MAL.</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => onRowClick(r)}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontWeight: '600', zIndex: 1 }}>
                  {r.full_name}
                  {r.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{r.position}</div>}
                </td>
                <td>
                  <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {r.dept_name || '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, r.attend_rate || 0)}%`, height: '100%', background: (r.attend_rate || 0) >= 80 ? 'var(--green)' : (r.attend_rate || 0) >= 50 ? 'var(--accent)' : 'var(--red)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>%{r.attend_rate || 0}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.worked_days || 0}</td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {(r.annual_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(59,130,246,.15)', color: 'var(--blue)' }}>Y:{r.annual_leave_days}</span>}
                    {(r.sick_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>H:{r.sick_leave_days}</span>}
                    {(r.emergency_leave_days || 0) > 0 && <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(234,179,8,.15)', color: 'var(--accent)' }}>A:{r.emergency_leave_days}</span>}
                    {(r.annual_leave_days || 0) === 0 && (r.sick_leave_days || 0) === 0 && (r.emergency_leave_days || 0) === 0 && <span style={{ color: 'var(--text3)', fontSize: '10px' }}>—</span>}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{r.absent_days || 0}</td>
                <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.overtime_hours ? `${r.overtime_hours}s` : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px' }}>{formatMoney(r.gross)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)' }}
                  title={r.total_deductions ? `SGK: ${r.ssi_worker} ₺ | GV: ${r.income_tax} ₺ | DV: ${r.stamp_tax} ₺` : ''}>
                  {formatMoney(r.total_deductions)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: '700', color: 'var(--green)' }}>{formatMoney(r.net)}</td>
                {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--teal)' }}>{formatMoney(r.employer_total_cost)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: '700', borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
              <td colSpan={showEmployer ? 10 : 9} style={{ paddingLeft: '12px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>
                TOPLAM — {filtered.length} kişi
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: '700' }}>{formatMoney(totals.net)}</td>
              {showEmployer && <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(totals.employer_total_cost)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function BordroSlip({ row, month, monthLabel }) {
  const [y] = month.split('-').map(Number)
  const maskTc = (tc) => tc ? `${tc.slice(0,3)}*****${tc.slice(-3)}` : '—'
  const fmt = (v) => v ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₺' : '0,00 ₺'

  return (
    <div className="bordro-slip">
      <div className="bordro-header">
        <div style={{ fontWeight: '700', fontSize: '14px' }}>{COMPANY_NAME}</div>
        <div style={{ textAlign: 'center', fontWeight: '700', fontSize: '14px' }}>ÜCRET BORDROSU</div>
        <div style={{ textAlign: 'right', fontSize: '12px' }}>Dönem: {monthLabel}</div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-info">
        <div><span>Ad Soyad:</span> <strong>{row.full_name?.toUpperCase()}</strong></div>
        <div><span>Sicil:</span> <strong>#{row.id}</strong></div>
        <div><span>Departman:</span> <strong>{(row.dept_name || '—').toUpperCase()}</strong></div>
        <div><span>TC:</span> <strong>{maskTc(row.tc_no)}</strong></div>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-row">
        <span>DEVAM:</span>
        <span>İş Günü {row.work_days_in_month} │ Çalıştı {row.worked_days || 0} │ İzin {row.leave_days || 0} │ Devamsız {row.absent_days || 0}</span>
      </div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">ÜCRET BİLEŞENLERİ</div>
      <div className="bordro-line"><span>Temel Ücret ({row.worked_days || 0} × {fmt(row.daily_rate)})</span><span>{fmt(row.base_pay)}</span></div>
      <div className="bordro-line"><span>Ücretli İzin ({(row.annual_leave_days || 0) + (row.emergency_leave_days || 0)} × {fmt(row.daily_rate)})</span><span>{fmt(row.leave_pay)}</span></div>
      {(row.weekly_off_pay || 0) > 0 && (
        <div className="bordro-line"><span>Hafta Tatili ({row.off_days || 0} × {fmt(row.daily_rate)})</span><span>{fmt(row.weekly_off_pay)}</span></div>
      )}
      <div className="bordro-line"><span>Fazla Mesai ({row.overtime_hours || 0}s × 1.5)</span><span>{fmt(row.overtime_pay)}</span></div>
      <div className="bordro-line bordro-total"><span>BRÜT TOPLAM</span><span>{fmt(row.gross)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-section-title">KESİNTİLER</div>
      <div className="bordro-line"><span>SGK İşçi (%14)</span><span>−{fmt(row.ssi_worker)}</span></div>
      <div className="bordro-line"><span>İşsizlik İşçi (%1)</span><span>−{fmt(row.unemployment_worker)}</span></div>
      <div className="bordro-line"><span>Gelir Vergisi</span><span>−{fmt(row.income_tax)}</span></div>
      <div className="bordro-line"><span>Damga Vergisi (%0.759)</span><span>−{fmt(row.stamp_tax)}</span></div>
      <div className="bordro-line bordro-total"><span>TOPLAM KESİNTİ</span><span>−{fmt(row.total_deductions)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line bordro-net"><span>NET ELE GEÇEN:</span><span>{fmt(row.net)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-line" style={{ fontSize: '10px' }}>
        <span>İşveren SGK (%20.5): {fmt(row.ssi_employer)} │ İşveren İşsizlik: {fmt(row.unemployment_employer)}</span>
      </div>
      <div className="bordro-line bordro-total"><span>TOPLAM İŞVEREN MALİYETİ:</span><span>{fmt(row.employer_total_cost)}</span></div>
      <div className="bordro-divider" />
      <div className="bordro-footer">
        <span>İmza: _______________</span>
        <span>Tarih: ___/___/{y}</span>
      </div>
    </div>
  )
}

function BordroDetailSheet({ row, month, monthLabel, formatMoney, onClose }) {
  const [tab, setTab] = useState('hesap') // 'hesap' | 'gun' | 'ytd'

  const { data: days = [], isFetching: daysLoading } = useQuery({
    queryKey: ['puantaj-days', row.id, month],
    queryFn: () => api.get(`/shifts/puantaj/${row.id}/days`, { params: { month } }).then(r => r.data),
    enabled: tab === 'gun',
  })

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const TABS = [['hesap', '💰 HESAP'], ['gun', '📅 GÜN DÖKÜMÜ'], ['ytd', '📈 YIL']]

  const [y, m] = month.split('-').map(Number)

  // Mini calendar grid helpers
  const firstDow = new Date(y, m - 1, 1).getDay() // 0=Sun
  const startPad = firstDow === 0 ? 6 : firstDow - 1 // make Mon=0

  const DAY_STATUS_STYLE = {
    worked:    { bg: 'var(--green)',            color: '#fff' },
    absent:    { bg: 'rgba(239,68,68,.15)',     color: 'var(--red)' },
    on_leave:  { bg: 'rgba(167,139,250,.15)',   color: 'var(--purple)' },
    overtime:  { bg: 'rgba(240,165,0,.15)',     color: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)',         color: 'var(--text3)' },
    sunday:    { bg: 'transparent',            color: 'var(--border)' },
    no_record: { bg: 'transparent',            color: 'transparent' },
  }

  return (
    <BottomSheet onClose={onClose}>
      {/* Dept color band */}
      <div style={{ height: '3px', background: 'var(--accent)', flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '1px' }}>{row.full_name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {row.position || '—'} · {row.dept_name || '—'} · {monthLabel}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginTop: '12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px',
              color: tab === id ? 'var(--accent)' : 'var(--text3)',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* HESAP PUSULASI */}
        {tab === 'hesap' && (
          <div>
            {/* Pay components */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>ÜCRET BİLEŞENLERİ</div>
              {[
                ['Temel Ücret', formatMoney(row.base_pay)],
                ['Ücretli İzin', formatMoney(row.leave_pay)],
                ['Hafta Tatili', formatMoney(row.weekly_off_pay || 0)],
                ['Fazla Mesai', formatMoney(row.overtime_pay)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: '700', fontSize: '13px' }}>
                <span>BRÜT TOPLAM</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{formatMoney(row.gross)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>KESİNTİLER</div>
              {[
                ['SGK İşçi (%14)', formatMoney(row.ssi_worker)],
                ['İşsizlik İşçi (%1)', formatMoney(row.unemployment_worker)],
                ['Gelir Vergisi', formatMoney(row.income_tax)],
                ['Damga Vergisi (%0.759)', formatMoney(row.stamp_tax)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '12px', color: 'var(--text3)' }}>
                <span>TOPLAM KESİNTİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>−{formatMoney(row.total_deductions)}</span>
              </div>
            </div>

            {/* Net */}
            <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)' }}>NET ELE GEÇEN</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--green)', letterSpacing: '1px' }}>{formatMoney(row.net)}</span>
            </div>

            {/* Employer cost */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>İŞVEREN MALİYETİ</div>
              {[
                ['SGK İşveren (%20.5)', formatMoney(row.ssi_employer)],
                ['İşsizlik İşveren (%2)', formatMoney(row.unemployment_employer)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
                  <span style={{ color: 'var(--text3)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '12px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                <span>TOPLAM İŞVEREN MALİYETİ</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{formatMoney(row.employer_total_cost)}</span>
              </div>
            </div>

            {/* Print button */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()} style={{ fontSize: '11px' }}>
                🖨 Bordro Fişi Yazdır
              </button>
            </div>

            {/* Hidden print slip */}
            <BordroSlip row={row} month={month} monthLabel={monthLabel} />
          </div>
        )}

        {/* GÜN DÖKÜMÜ */}
        {tab === 'gun' && (
          <div>
            {daysLoading ? (
              <SkeletonGrid count={7} minWidth={40} />
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                  {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', padding: '2px 0' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                  {Array.from({ length: startPad }, (_, i) => <div key={`pad-${i}`} />)}
                  {days.map((d, i) => {
                    if (d.status === 'sunday') return <div key={i} style={{ aspectRatio: '1', borderRadius: '4px' }} />
                    const s = DAY_STATUS_STYLE[d.status] || DAY_STATUS_STYLE.no_record
                    const dayNum = parseInt(d.date.split('-')[2])
                    return (
                      <div key={i} title={d.shift_name || d.leave_type || d.status}
                        style={{ aspectRatio: '1', borderRadius: '4px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontFamily: 'var(--mono)', color: s.color, border: '1px solid var(--border)' }}>
                        {dayNum}
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[['worked','Çalıştı','var(--green)'],['absent','Devamsız','var(--red)'],['on_leave','İzin','var(--purple)'],['off','Haftalık izin','var(--teal)'],['overtime','Mesai','var(--accent)']].map(([s,label,color]) => (
                    <span key={s} style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--text3)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block' }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* YIL BAZLARI */}
        {tab === 'ytd' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>YILBAŞINDAN BU AYA</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Brüt</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: '700' }}>{formatMoney(row.ytd_gross)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Kümülatif Vergi</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatMoney(row.ytd_tax)}</span>
              </div>
            </div>
            {/* Tax bracket bar */}
            <div style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '10px' }}>GELİR VERGİSİ DİLİMİ</div>
              {[
                [110_000, '%15'],
                [230_000, '%20'],
                [870_000, '%27'],
                [3_000_000, '%35'],
                [Infinity, '%40'],
              ].map(([limit, rate], i) => {
                const prev = [0, 110_000, 230_000, 870_000, 3_000_000][i]
                const ytd = row.ytd_gross || 0
                const inBracket = ytd > prev
                const current = ytd > prev && ytd <= (limit === Infinity ? Number.MAX_SAFE_INTEGER : limit)
                return (
                  <div key={rate} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', width: '28px', color: current ? 'var(--accent)' : 'var(--text3)' }}>{rate}</span>
                    <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                      {inBracket && (
                        <div style={{
                          height: '100%', borderRadius: '3px',
                          background: current ? 'var(--accent)' : 'var(--green)',
                          width: current ? `${Math.min(100, ((ytd - prev) / (Math.min(limit === Infinity ? ytd : limit, ytd) - prev || 1)) * 100)}%` : '100%',
                        }} />
                      )}
                    </div>
                    {current && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)' }}>← şu an</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export default function PuantajTab({ departments }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const roleCanEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const isManager = user?.role === 'campus_manager'
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const debouncedPuantajSearch = useDebounce(search, 250)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar' | 'summary' | 'control' | 'approval'
  const [showEmployer, setShowEmployer] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null) // row object for bordro detail
  const [sortBy, setSortBy] = useState('name')
  const [selectedAction, setSelectedAction] = useState(ACTION_BY_ID.worked)
  const [y, m] = month.split('-').map(Number)

  // Faz 31 — dönem kilidi: kilitli ay salt-okunur
  const { data: periodLocks = [] } = useQuery({
    queryKey: ['period-locks'],
    queryFn: () => api.get('/shifts/period-locks').then(r => r.data),
    enabled: roleCanEdit,
  })
  const monthLock = periodLocks.find(l => l.period === month)
  const isLocked = !!monthLock
  const canEdit = roleCanEdit && !isLocked

  const toggleLock = useMutation({
    mutationFn: ({ lock, note }) => lock
      ? api.post('/shifts/period-locks', { period: month, note })
      : api.delete(`/shifts/period-locks/${month}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['period-locks'] })
      qc.invalidateQueries({ queryKey: ['puantaj-approval'] })
    },
  })

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

  const { data: auditDayPayload = { days: {} } } = useQuery({
    queryKey: ['puantaj-days-month', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj/days', { params }).then(res => res.data)
    },
    enabled: !isLoading,
  })

  const { data: holidayRows = [] } = useQuery({
    queryKey: ['holidays', y],
    queryFn: () => api.get('/shifts/holidays', { params: { year: y } }).then(res => res.data),
  })

  const { data: approvalPayload = null, isFetching: approvalFetching } = useQuery({
    queryKey: ['puantaj-approval', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj/approval', { params }).then(res => res.data)
    },
    enabled: roleCanEdit,
  })

  const refreshApproval = () => {
    qc.invalidateQueries({ queryKey: ['puantaj-approval'] })
    qc.invalidateQueries({ queryKey: ['period-locks'] })
  }

  const updatePuantajDay = useMutation({
    mutationFn: ({ changes, action }) => {
      if (action.status === 'clear') {
        return Promise.all(changes.map(change => api.delete(`/shifts/schedule/${change.staff.id}/${change.date}`)))
      }
      if (action.status === 'restore') {
        // Undo: her hücre kendi önceki durumuna döner — boşa dönenler silinir, kalanlar upsert edilir
        const isEmpty = change => !change.nextEntry?.status || ['no_record', 'sunday'].includes(change.nextEntry.status)
        const deletions = changes.filter(isEmpty)
        const upserts = changes.filter(change => !isEmpty(change))
        return Promise.all([
          ...deletions.map(change => api.delete(`/shifts/schedule/${change.staff.id}/${change.date}`)),
          ...(upserts.length ? [api.post('/shifts/schedule', {
            entries: upserts.map(change => ({
              staff_id: change.staff.id,
              dept_id: change.staff.department_id || null,
              shift_def_id: change.nextEntry.shift_def_id || null,
              work_location_id: ['worked', 'scheduled', 'overtime'].includes(change.nextEntry.status) ? (change.nextEntry.work_location_id || null) : null,
              work_date: change.date,
              status: change.nextEntry.status,
              leave_type: change.nextEntry.leave_type || null,
            }))
          })] : []),
        ])
      }
      return api.post('/shifts/schedule', {
        entries: changes.map(change => ({
          staff_id: change.staff.id,
          dept_id: change.staff.department_id || null,
          shift_def_id: ['worked', 'scheduled', 'overtime'].includes(action.status) ? (change.entry?.shift_def_id || null) : null,
          work_location_id: ['worked', 'scheduled', 'overtime'].includes(action.status) ? (change.entry?.work_location_id || change.nextEntry?.work_location_id || null) : null,
          work_date: change.date,
          status: action.status,
          leave_type: action.leave_type || null,
        }))
      })
    },
    onSuccess: (_, variables) => {
      variables.onLocalUpdate?.()
      qc.invalidateQueries({ queryKey: ['puantaj'] })
      qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
    },
    onError: (err) => {
      // Dönem kilidi (423) veya diğer hatalar — sunucu reddetti, yerel değişiklik uygulanmaz
      toastErr(err)
      qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
    },
  })

  const submitApproval = useMutation({
    mutationFn: (note) => api.post('/shifts/puantaj/approval/submit', {
      period: month,
      dept_id: deptFilter || null,
      note: note || null,
    }),
    onSuccess: () => {
      refreshApproval()
      toastOk('Puantaj kontrole gonderildi')
    },
    onError: toastErr,
  })

  const dayApprovalMutation = useMutation({
    mutationFn: ({ row, rows: targetRows, status, note }) => {
      const targets = targetRows?.length ? targetRows : [row]
      return Promise.all(targets.map(target => api.patch('/shifts/puantaj/approval/day', {
        period: month,
        work_date: target.work_date,
        dept_id: deptFilter || null,
        status,
        note: note || null,
      })))
    },
    onSuccess: (_, variables) => {
      refreshApproval()
      const count = variables.rows?.length || 1
      toastOk(count > 1 ? `${count} gun onay durumu guncellendi` : 'Gun onay durumu guncellendi')
    },
    onError: toastErr,
  })

  const periodApprovalMutation = useMutation({
    mutationFn: ({ action, note }) => api.patch('/shifts/puantaj/approval/period', {
      period: month,
      dept_id: deptFilter || null,
      action,
      note: note || null,
    }),
    onSuccess: (_, variables) => {
      refreshApproval()
      toastOk(variables.action === 'lock' ? 'Puantaj onaylandi ve kilitlendi' : 'Puantaj onay durumu guncellendi')
    },
    onError: toastErr,
  })

  const updatingKeys = useMemo(() => (
    updatePuantajDay.isPending
      ? new Set((updatePuantajDay.variables?.changes || []).map(change => `${change.staff.id}-${change.date}`))
      : new Set()
  ), [updatePuantajDay.isPending, updatePuantajDay.variables])

  const formatMoney = (val) => {
    if (val == null || val === 0) return '—'
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' ₺'
  }

  const filtered = useMemo(() => {
    let list = rows
    if (debouncedPuantajSearch) {
      const q = debouncedPuantajSearch.toLowerCase()
      list = list.filter(r => r.full_name?.toLowerCase().includes(q) || r.dept_name?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'worked') return (b.worked_days || 0) - (a.worked_days || 0)
      if (sortBy === 'absent') return (b.absent_days || 0) - (a.absent_days || 0)
      if (sortBy === 'net') return (b.net || 0) - (a.net || 0)
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, debouncedPuantajSearch, sortBy])

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    worked: acc.worked + (r.worked_days || 0),
    leave: acc.leave + (r.leave_days || 0),
    absent: acc.absent + (r.absent_days || 0),
    overtime_hours: acc.overtime_hours + (r.overtime_hours || 0),
    gross: acc.gross + (r.gross || 0),
    net: acc.net + (r.net || 0),
    employer_total_cost: acc.employer_total_cost + (r.employer_total_cost || 0),
  }), { worked: 0, leave: 0, absent: 0, overtime_hours: 0, gross: 0, net: 0, employer_total_cost: 0 }),
  [filtered])

  const puantajAudit = useMemo(() => buildPuantajControl({
    staffRows: filtered,
    daysByStaff: auditDayPayload.days || {},
    holidays: holidayRows,
    month,
  }), [filtered, auditDayPayload, holidayRows, month])

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()

  const syncScheduledToWorked = async () => {
    if (!canEdit || puantajAudit.scheduledCells.length === 0) return
    const ok = await confirmDialog({
      title: 'Planlı Günleri Puantaja Aktar',
      body: `${monthLabel} içinde ${puantajAudit.scheduledCells.length} planlı gün "N - çalıştı" yapılacak. Vardiya saati ve çalışma noktası korunur.`,
    })
    if (!ok) return
    const changes = puantajAudit.scheduledCells.map(({ staff, entry }) => ({
      staff,
      date: entry.date,
      entry,
      action: ACTION_BY_ID.worked,
      nextEntry: { ...entry, status: 'worked' },
    }))
    updatePuantajDay.mutate(
      { changes, action: ACTION_BY_ID.worked },
      { onSuccess: () => toastOk(`${changes.length} planlı gün puantaja aktarıldı`) }
    )
  }

  const setMonthInYear = (targetMonth, targetYear = y) => {
    setMonth(`${targetYear}-${String(targetMonth).padStart(2, '0')}`)
  }

  const prevMonth = () => {
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const downloadCsv = async () => {
    try {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      const res = await api.get('/shifts/puantaj/export/csv', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `puantaj-${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      // CSV download is optional; keep the current screen usable if it fails.
    }
  }

  // Faz 29 — Resmi puantaj cetveli: imzalık aylık föy (renkli kod matrisi + toplamlar + lejant + imza blokları)
  const [foyuExporting, setFoyuExporting] = useState(false)
  const downloadFoyu = async () => {
    if (foyuExporting) return
    setFoyuExporting(true)
    try {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      const approvalRequest = roleCanEdit
        ? api.get('/shifts/puantaj/approval', { params }).then(res => res.data).catch(() => approvalPayload)
        : Promise.resolve(null)
      const [daysRes, holidaysRes, approvalRes, ExcelJS] = await Promise.all([
        api.get('/shifts/puantaj/days', { params }).then(res => res.data.days || {}),
        api.get('/shifts/holidays', { params: { year: y } }).then(res => res.data),
        approvalRequest,
        import('exceljs').then(mod => mod.default),
      ])
      const deptName = deptFilter ? (departments.find(d => String(d.id) === String(deptFilter))?.name || '—') : 'Tüm Departmanlar'
      const { workbook } = buildPuantajFoyuWorkbook(ExcelJS, {
        staffRows: filtered,
        daysByStaff: daysRes,
        holidays: holidaysRes,
        month,
        monthLabel,
        deptName,
        companyName: COMPANY_NAME,
        approval: approvalRes,
      })

      const buf = await workbook.xlsx.writeBuffer()
      saveWorkbook(buf, `puantaj-foyu-${month}.xlsx`, {
        onError: (error) => {
          error.response = { data: { error: 'Puantaj föyü indirilemedi' } }
        },
      })
      toastOk('Puantaj föyü hazırlandı')
    } catch (e) {
      toastErr(e)
    } finally {
      setFoyuExporting(false)
    }
  }

  return (
    <div className="fade-up">
      {/* Top bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <button className="btn btn-ghost btn-sm" onClick={prevMonth}>←</button>
        <span style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '1px' }}>{monthLabel}</span>
        <button className="btn btn-ghost btn-sm" onClick={nextMonth}>→</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)}>Bu Ay</button>

        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px', fontSize: '11px', padding: '5px 11px' }}>
          <option value="">Tüm Departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="form-input" placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '150px', fontSize: '11px', padding: '5px 11px' }} />

        {/* View mode */}
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface2)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
          {[['list','📋 LİSTE'],['calendar','📅 TAKVİM'],['summary','🏢 ÖZET'],['control','🔎 KONTROL']].map(([id, label]) => (
            <button key={id} onClick={() => setViewMode(id)}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--mono)',
                letterSpacing: '0.5px', border: 'none', cursor: 'pointer',
                background: viewMode === id ? 'var(--accent)' : 'transparent',
                color: viewMode === id ? '#000' : 'var(--text3)',
              }}>
              {label}
            </button>
          ))}
          <button
            key="approval"
            onClick={() => setViewMode('approval')}
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--mono)',
              letterSpacing: '0.5px', border: 'none', cursor: 'pointer',
              background: viewMode === 'approval' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'approval' ? '#000' : 'var(--text3)',
            }}
          >
            ONAY
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmployer(v => !v)}
            style={{ fontSize: '10px' }}>
            💼 {showEmployer ? 'Maliyet Gizle' : 'Maliyet Göster'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadCsv} style={{ fontSize: '10px' }}>
            ⬇ CSV İndir
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadFoyu} disabled={foyuExporting} style={{ fontSize: '10px' }}>
            📄 {foyuExporting ? 'HAZIRLANIYOR...' : 'PUANTAJ FÖYÜ'}
          </button>
          {isManager && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={toggleLock.isPending}
              style={{ fontSize: '10px', color: isLocked ? 'var(--green)' : 'var(--red)' }}
              onClick={async () => {
                if (isLocked) {
                  if (await confirmDialog({ title: 'Dönem Kilidini Aç', body: `${monthLabel} tekrar düzenlenebilir olacak. Emin misiniz?`, danger: true })) {
                    toggleLock.mutate({ lock: false })
                  }
                } else if (await confirmDialog({ title: 'Dönemi Kilitle', body: `${monthLabel} puantajı kilitlenecek — kimse (siz dahil) değiştiremeyecek. Bordro kesildiyse kilitleyin.` })) {
                  toggleLock.mutate({ lock: true, note: `${monthLabel} kapatıldı` })
                }
              }}>
              {isLocked ? '🔓 KİLİDİ AÇ' : '🔒 AYI KİLİTLE'}
            </button>
          )}
        </div>
      </div>

      {isLocked && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          marginBottom: '12px', padding: '8px 12px',
          background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.35)', borderRadius: '8px',
        }}>
          <span style={{ fontSize: '13px' }}>🔒</span>
          <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
            <strong>{monthLabel} dönemi kilitli</strong> — puantaj salt-okunur.
            {monthLock?.note ? ` (${monthLock.note})` : ''}
            {monthLock?.locked_by_name ? ` · ${monthLock.locked_by_name}` : ''}
          </span>
          {!isManager && <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: 'auto' }}>Açmak için müdür yetkisi gerekir</span>}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        overflowX: 'auto',
        marginBottom: '12px',
        padding: '6px',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'var(--surface)',
      }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonthInYear(m, y - 1)} style={{ minWidth: '34px' }}>{'<'}</button>
        <span style={{ minWidth: '54px', textAlign: 'center', fontFamily: 'var(--display)', fontSize: '13px', color: 'var(--text)' }}>{y}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonthInYear(m, y + 1)} style={{ minWidth: '34px' }}>{'>'}</button>
        {MONTH_SHORT.map((label, index) => {
          const targetMonth = index + 1
          const active = targetMonth === m
          return (
            <button
              key={label}
              type="button"
              onClick={() => setMonthInYear(targetMonth)}
              style={{
                minWidth: '46px',
                height: '30px',
                borderRadius: '7px',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: active ? 'var(--accent)' : 'var(--surface2)',
                color: active ? '#000' : 'var(--text3)',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '9px',
                fontWeight: 800,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <PuantajClosurePanel
        audit={puantajAudit}
        canEdit={canEdit}
        isLocked={isLocked}
        monthLabel={monthLabel}
        onOpenCalendar={() => setViewMode('calendar')}
        onOpenControl={() => setViewMode('control')}
        onSyncScheduled={syncScheduledToWorked}
        syncing={updatePuantajDay.isPending}
      />

      {/* Mode content */}
      {viewMode === 'list' && (
        <PuantajListView
          filtered={filtered} totals={totals} isLoading={isLoading}
          month={month} monthLabel={monthLabel}
          showEmployer={showEmployer} sortBy={sortBy} setSortBy={setSortBy}
          formatMoney={formatMoney} onRowClick={setSelectedRow}
        />
      )}
      {viewMode === 'calendar' && (
        <PuantajCalendarView
          filtered={filtered}
          month={month}
          deptFilter={deptFilter}
          y={y}
          m={m}
          isLoading={isLoading}
          canEdit={canEdit}
          selectedAction={selectedAction}
          setSelectedAction={setSelectedAction}
          onApplyStatus={updatePuantajDay.mutate}
          updatingKeys={updatingKeys}
          onPersonClick={setSelectedRow}
        />
      )}
      {viewMode === 'summary' && (
        <PuantajSummaryView filtered={filtered} formatMoney={formatMoney} />
      )}
      {viewMode === 'control' && (
        <PuantajControlView
          audit={puantajAudit}
          monthLabel={monthLabel}
          canEdit={canEdit}
          isLocked={isLocked}
          onOpenCalendar={() => setViewMode('calendar')}
          onSyncScheduled={syncScheduledToWorked}
          syncing={updatePuantajDay.isPending}
          onPersonClick={setSelectedRow}
        />
      )}
      {viewMode === 'approval' && (
        <PuantajApprovalView
          approval={approvalPayload}
          audit={puantajAudit}
          canEdit={canEdit}
          isManager={isManager}
          isLocked={isLocked}
          monthLabel={monthLabel}
          loading={approvalFetching}
          busy={submitApproval.isPending || dayApprovalMutation.isPending || periodApprovalMutation.isPending}
          onSubmitPeriod={(note) => submitApproval.mutate(note)}
          onDayStatus={(row, status, note) => dayApprovalMutation.mutate({ row, status, note })}
          onBulkDayStatus={(rows, status, note) => dayApprovalMutation.mutate({ rows, status, note })}
          onPeriodAction={(action, note) => periodApprovalMutation.mutate({ action, note })}
          onPersonClick={setSelectedRow}
        />
      )}

      {/* Bordro detail bottom sheet */}
      {selectedRow && (
        <BordroDetailSheet
          row={selectedRow} month={month} monthLabel={monthLabel}
          formatMoney={formatMoney}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  )
}
