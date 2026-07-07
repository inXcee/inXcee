import { useState, useMemo, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useDebounce } from '../../../shared/hooks/useDebounce.js'
import { SkeletonTable, SkeletonGrid } from '../../../shared/components/Skeleton.jsx'
import { BottomSheet, formatShiftHours, leaveTypeLabel, toastErr } from '../shared.jsx'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { actionIdForKey, normalizeRect, cellsInRect, isInRect, moveCell, pushUndo, summarizeColumn } from '../logic/puantajGrid.js'
import { buildFoyuRow, FOYU_LEGEND, FOYU_TOTAL_COLUMNS } from '../logic/puantajFoyu.js'

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
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar' | 'summary'
  const [showEmployer, setShowEmployer] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null) // row object for bordro detail
  const [sortBy, setSortBy] = useState('name')
  const [selectedAction, setSelectedAction] = useState(ACTION_BY_ID.worked)

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['period-locks'] }),
  })

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

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

  const updatingKeys = useMemo(() => (
    updatePuantajDay.isPending
      ? new Set((updatePuantajDay.variables?.changes || []).map(change => `${change.staff.id}-${change.date}`))
      : new Set()
  ), [updatePuantajDay.isPending, updatePuantajDay.variables])

  const [y, m] = month.split('-').map(Number)

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

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()
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
      // CSV download error — intentionally no console.log per project rules
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
      const [daysRes, holidaysRes, ExcelJS] = await Promise.all([
        api.get('/shifts/puantaj/days', { params }).then(res => res.data.days || {}),
        api.get('/shifts/holidays', { params: { year: y } }).then(res => res.data),
        import('exceljs').then(mod => mod.default),
      ])
      const daysInMonth = new Date(y, m, 0).getDate()
      const holidaySet = new Set(holidaysRes.filter(h => h.date?.startsWith(month)).map(h => h.date))
      const holidayNames = Object.fromEntries(holidaysRes.filter(h => h.date?.startsWith(month)).map(h => [h.date, h.name]))
      const deptName = deptFilter ? (departments.find(d => String(d.id) === String(deptFilter))?.name || '—') : 'Tüm Departmanlar'
      const rows = filtered.map(r => buildFoyuRow(r, daysRes[r.id] || [], holidaySet))

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Puantaj', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }] })
      const border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      const totalColStart = 4 + daysInMonth

      ws.mergeCells(1, 1, 1, totalColStart + FOYU_TOTAL_COLUMNS.length - 1)
      const title = ws.getCell(1, 1)
      title.value = `${COMPANY_NAME} — AYLIK PUANTAJ CETVELİ`
      title.font = { bold: true, size: 14 }
      title.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 24

      ws.mergeCells(2, 1, 2, totalColStart + FOYU_TOTAL_COLUMNS.length - 1)
      const sub = ws.getCell(2, 1)
      sub.value = `Dönem: ${monthLabel}   ·   Departman: ${deptName}   ·   ${rows.length} personel`
      sub.font = { size: 10, color: { argb: 'FF64748B' } }
      sub.alignment = { horizontal: 'center', vertical: 'middle' }

      const header = ws.getRow(3)
      header.values = [
        'NO', 'ADI SOYADI', 'DEPARTMAN',
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ...FOYU_TOTAL_COLUMNS.map(c => c.label),
      ]
      header.eachCell((c, colNo) => {
        c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.border = border
        const dayNo = colNo - 3
        if (dayNo >= 1 && dayNo <= daysInMonth) {
          const date = `${month}-${String(dayNo).padStart(2, '0')}`
          if (holidaySet.has(date)) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
            c.note = holidayNames[date]
          } else if (new Date(y, m - 1, dayNo).getDay() === 0) {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } }
          }
        }
      })
      header.height = 18

      rows.forEach((row, idx) => {
        const r = ws.addRow([
          idx + 1, row.name, row.dept,
          ...row.cells.map(cell => cell.code),
          ...FOYU_TOTAL_COLUMNS.map(col => row.totals[col.key] || ''),
        ])
        r.height = 16
        r.eachCell((cell, colNo) => {
          cell.border = border
          cell.font = { size: 8 }
          cell.alignment = { horizontal: colNo === 2 || colNo === 3 ? 'left' : 'center', vertical: 'middle' }
          const dayNo = colNo - 3
          if (dayNo >= 1 && dayNo <= daysInMonth) {
            const c = row.cells[dayNo - 1]
            if (c?.hex) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.hex } }
              cell.font = { size: 8, bold: true, color: { argb: 'FFFFFFFF' } }
            } else if (new Date(y, m - 1, dayNo).getDay() === 0) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF3E0' } }
            }
          } else if (colNo >= totalColStart) {
            cell.font = { size: 8, bold: true }
          }
        })
      })

      ws.addRow([])
      const legendTitle = ws.addRow(['KOD AÇIKLAMALARI'])
      legendTitle.getCell(1).font = { bold: true, size: 9 }
      FOYU_LEGEND.forEach(([code, label]) => {
        const r = ws.addRow([code, label])
        r.getCell(1).alignment = { horizontal: 'center' }
        r.getCell(1).font = { bold: true, size: 8 }
        r.getCell(2).font = { size: 8 }
      })

      ws.addRow([])
      ws.addRow([])
      const signRowIdx = ws.rowCount + 1
      const third = Math.floor((3 + daysInMonth + FOYU_TOTAL_COLUMNS.length) / 3)
      ;['DÜZENLEYEN', 'KONTROL EDEN', 'ONAYLAYAN'].forEach((label, i) => {
        const c1 = 1 + i * third
        ws.mergeCells(signRowIdx, c1, signRowIdx, c1 + third - 1)
        const cell = ws.getCell(signRowIdx, c1)
        cell.value = `${label}\n\nAd Soyad:\n\nİmza:`
        cell.font = { size: 9, bold: true }
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
      })
      ws.getRow(signRowIdx).height = 70

      ws.getColumn(1).width = 4
      ws.getColumn(2).width = 24
      ws.getColumn(3).width = 15
      for (let i = 0; i < daysInMonth; i++) ws.getColumn(4 + i).width = 3.6
      FOYU_TOTAL_COLUMNS.forEach((col, i) => { ws.getColumn(totalColStart + i).width = col.key === 'fmHours' ? 7 : 4.5 })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `puantaj-foyu-${month}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      // export hatası — sessiz geç (console.log yasak); buton tekrar denenebilir
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
          {[['list','📋 LİSTE'],['calendar','📅 TAKVİM'],['summary','🏢 ÖZET']].map(([id, label]) => (
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
