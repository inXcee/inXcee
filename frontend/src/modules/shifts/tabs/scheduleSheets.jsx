// Çizelge alt-sheet'leri — ScheduleTab orkestratöründen birebir taşındı.
// DailyView: günlük departman görünümü; WeekFillSheet: kişinin haftasını doldur;
// CellAssignSheet: tek hücre vardiya ata/sil. Hepsi prop-tabanlı, davranış aynı.
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { addDays, todayStr, shiftColor, BottomSheet, formatShiftHours, leaveTypeLabel } from '../shared.jsx'

// ─── Daily View ───────────────────────────────────────────────────────────────
export function DailyView({ departments, date, onDateChange }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['personnel-daily', date],
    queryFn: () => api.get(`/shifts/personnel?date=${date}`).then(r => r.data),
    staleTime: 30000,
  })

  // Group by department, then by shift/status
  const deptGroups = useMemo(() => {
    const map = new Map()
    rows.forEach(row => {
      const deptName = row.dept_name || 'Departmansız'
      const deptColor = row.dept_color || 'gray'
      if (!map.has(deptName)) {
        map.set(deptName, { deptName, deptColor, shifts: new Map(), leave: [], absent: [] })
      }
      const g = map.get(deptName)
      if (row.leave_status === 'approved') {
        g.leave.push(row)
      } else if (row.shift_status === 'on_leave' || row.shift_status === 'off') {
        g.leave.push(row)
      } else if (row.shift_status === 'scheduled' || row.shift_status === 'overtime') {
        const shiftKey = row.shift_name || 'Bilinmiyor'
        if (!g.shifts.has(shiftKey)) {
          g.shifts.set(shiftKey, { name: shiftKey, start: row.start_hour, end: row.end_hour, color: row.shift_color, staff: [] })
        }
        g.shifts.get(shiftKey).staff.push(row)
      } else {
        g.absent.push(row)
      }
    })
    return Array.from(map.values())
  }, [rows])

  // shiftColor2: DailyView'a özel. Module-level shiftColor() uses different return format.
  const shiftColor2 = (cls) => {
    const map = { 'shift-blue': { bg: 'rgba(52,152,219,.18)', text: '#3498db' }, 'shift-teal': { bg: 'rgba(26,188,156,.18)', text: '#1abc9c' }, 'shift-amber': { bg: 'rgba(240,165,0,.18)', text: '#f0a500' }, 'shift-red': { bg: 'rgba(231,76,60,.18)', text: '#e74c3c' }, 'shift-purple': { bg: 'rgba(155,89,182,.18)', text: '#9b59b6' } }
    return map[cls] || { bg: 'var(--surface2)', text: 'var(--text2)' }
  }

  const deptColorMap = { 'dept-blue': 'var(--blue)', 'dept-teal': 'var(--teal)', 'dept-amber': 'var(--accent)', 'dept-red': 'var(--red)', 'dept-purple': '#9b59b6', 'dept-green': 'var(--green)' }

  return (
    <div>
      {/* Tarih seçici */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => onDateChange(addDays(date, -1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>
        <div style={{
          fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text)',
          background: 'var(--surface2)', borderRadius: '10px', padding: '6px 20px',
        }}>
          {new Date(date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => onDateChange(addDays(date, 1))} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
        {date !== (typeof todayStr === 'function' ? todayStr() : todayStr) && (
          <button onClick={() => onDateChange(typeof todayStr === 'function' ? todayStr() : todayStr)} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
            cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        )}
      </div>

      {isLoading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>YÜKLENİYOR...</div>}

      {/* Dept cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {deptGroups.map(g => {
          const totalStaff = Array.from(g.shifts.values()).reduce((s, sh) => s + sh.staff.length, 0) + g.leave.length + g.absent.length
          const accentColor = deptColorMap[g.deptColor] || 'var(--accent)'
          return (
            <div key={g.deptName} style={{
              borderRadius: '14px', border: '1px solid var(--border)',
              background: 'var(--surface)', overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                borderLeft: `4px solid ${accentColor}`,
                background: 'var(--surface2)',
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px', color: 'var(--text)', flex: 1 }}>
                  {g.deptName.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                  {totalStaff} kişi
                </div>
              </div>

              {/* Shift groups */}
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from(g.shifts.values()).map(sh => {
                  const sc = shiftColor2(sh.color)
                  const pct = totalStaff > 0 ? (sh.staff.length / totalStaff) * 100 : 0
                  return (
                    <div key={sh.name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px',
                          background: sc.bg, color: sc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                        }}>{sh.name}</span>
                        {sh.start != null && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                            {formatShiftHours(sh.start, sh.end)}
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', fontWeight: 600, marginLeft: 'auto' }}>
                          {sh.staff.length} kişi
                        </span>
                      </div>
                      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: sc.text, borderRadius: '3px', transition: 'width .3s' }} />
                      </div>
                    </div>
                  )
                })}

                {g.leave.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(26,188,156,.12)', color: 'var(--teal)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>İZİNDE</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      {g.leave.map(s => {
                        const tag = s.shift_status === 'off' ? 'OFF' : leaveTypeLabel(s.leave_type)
                        return `${s.full_name}${tag ? ` (${tag})` : ''}`
                      }).join(' · ')}
                    </span>
                  </div>
                )}

                {g.absent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--surface3)', color: 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>YOKTA</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', opacity: 0.7 }}>
                      {g.absent.map(s => s.full_name).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function WeekFillSheet({ weekFillPopover, setWeekFillPopover, shiftDefs, weekFillDef, setWeekFillDef, weekFillOffDay, setWeekFillOffDay, fillWeek, weekStart, weekEnd, formatDate, shiftColor }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setWeekFillPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setWeekFillPopover])

  const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

  return (
    <BottomSheet onClose={() => setWeekFillPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📆 HAFTA DOLDUR</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {weekFillPopover.person.full_name} · {formatDate(weekStart)}–{formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekFillPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>VARDIYA SEÇ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {shiftDefs.map(s => {
              const active = weekFillDef === s.id.toString()
              const sc = shiftColor(s.color_class)
              return (
                <button key={s.id} onClick={() => setWeekFillDef(s.id.toString())}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                    fontSize: '13px', cursor: 'pointer',
                    border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                    background: active ? sc.bg : 'var(--surface2)',
                    color: active ? sc.text : 'var(--text2)',
                  }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                    {formatShiftHours(s.start_hour, s.end_hour)}
                  </span>
                  {active && <span style={{ float: 'right', fontSize: '10px' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>OFF GÜNÜ (HAFTALIK İZİN)</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {DAY_LABELS.map((lbl, i) => (
              <button key={i} onClick={() => setWeekFillOffDay(i)}
                style={{
                  flex: 1, padding: '8px 2px', borderRadius: '6px', cursor: 'pointer',
                  border: `2px solid ${weekFillOffDay === i ? 'var(--teal)' : 'var(--border)'}`,
                  background: weekFillOffDay === i ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
                  color: weekFillOffDay === i ? 'var(--teal)' : 'var(--text3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600, textAlign: 'center',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" style={{ width: '100%', opacity: !weekFillDef ? 0.5 : 1 }}
          disabled={!weekFillDef || fillWeek.isPending}
          onClick={() => {
            setError(null)
            fillWeek.mutate(
              { staffId: weekFillPopover.person.id, deptId: weekFillPopover.person.dept_id, shiftDefId: parseInt(weekFillDef), offDayIdx: weekFillOffDay },
              { onError: () => setError('Hafta doldurulamadı. Tekrar deneyin.') }
            )
          }}>
          {fillWeek.isPending ? 'Dolduruluyor...' : '6 Gün Doldur + 1 OFF'}
        </button>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '8px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}

export function CellAssignSheet({
  cellPopover, setCellPopover, shiftDefs, assignCell, deleteShift,
  workLocations = [], staffRoles = [], canOverrideLeave = false,
  formatDate, shortDay, shiftColor,
}) {
  const qc = useQueryClient()
  const [error, setError] = useState(null)
  const [draftShiftId, setDraftShiftId] = useState(cellPopover.existing?.shift_def_id ? String(cellPopover.existing.shift_def_id) : '')
  const [draftLocationId, setDraftLocationId] = useState(cellPopover.existing?.work_location_id ? String(cellPopover.existing.work_location_id) : '')
  const [overrideLeave, setOverrideLeave] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [editingSegmentId, setEditingSegmentId] = useState(null)
  const [showCandidates, setShowCandidates] = useState(false)
  const [segmentDraft, setSegmentDraft] = useState({
    shift_def_id: '', role_id: cellPopover.person?.role_id ? String(cellPopover.person.role_id) : '',
    work_location_id: draftLocationId, start_time: '', end_time: '', break_minutes: '0', note: '',
  })

  const detailKey = ['schedule-segments', cellPopover.staffId, cellPopover.date]
  const { data: segmentDetail } = useQuery({
    queryKey: detailKey,
    queryFn: () => api.get(`/shifts/schedule/${cellPopover.staffId}/${cellPopover.date}/segments`).then(r => r.data),
  })
  const segments = segmentDetail?.segments || cellPopover.existing?.segments || []

  const resetSegmentDraft = () => {
    setEditingSegmentId(null)
    setShowCandidates(false)
    setSegmentDraft({
      shift_def_id: '', role_id: cellPopover.person?.role_id ? String(cellPopover.person.role_id) : '',
      work_location_id: draftLocationId, start_time: '', end_time: '', break_minutes: '0', note: '',
    })
  }

  const segmentMutation = useMutation({
    mutationFn: payload => editingSegmentId
      ? api.put(`/shifts/schedule/segments/${editingSegmentId}`, payload)
      : api.post('/shifts/schedule/segments', {
          ...payload,
          staff_id: cellPopover.staffId,
          dept_id: cellPopover.deptId,
          work_date: cellPopover.date,
          override_leave: overrideLeave,
          override_reason: overrideReason || undefined,
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey })
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      qc.invalidateQueries({ queryKey: ['shift-breakdown'] })
      setError(null)
      resetSegmentDraft()
    },
    onError: err => setError(err?.response?.data?.error || 'Vardiya parçası kaydedilemedi.'),
  })

  const deleteSegmentMutation = useMutation({
    mutationFn: id => api.delete(`/shifts/schedule/segments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey })
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      resetSegmentDraft()
    },
    onError: err => setError(err?.response?.data?.error || 'Vardiya parçası silinemedi.'),
  })

  const { data: candidateData, isFetching: candidatesLoading } = useQuery({
    queryKey: ['schedule-candidates', cellPopover.date, segmentDraft],
    queryFn: () => api.get('/shifts/schedule/candidates', { params: {
      date: cellPopover.date,
      dept_id: cellPopover.deptId || undefined,
      role_id: segmentDraft.role_id || undefined,
      work_location_id: segmentDraft.work_location_id || undefined,
      shift_def_id: segmentDraft.shift_def_id || undefined,
      start_time: segmentDraft.start_time || undefined,
      end_time: segmentDraft.end_time || undefined,
      exclude_staff_id: cellPopover.staffId,
    } }).then(r => r.data),
    enabled: showCandidates && !!segmentDraft.start_time && !!segmentDraft.end_time,
  })

  const assignmentOptions = {
    overrideLeave,
    overrideReason: overrideReason.trim(),
  }
  const clockValue = value => {
    if (value == null || value === '') return ''
    const raw = String(value)
    if (raw.includes(':')) {
      const [hour, minute = '00'] = raw.split(':')
      return `${hour.padStart(2, '0')}:${minute.padEnd(2, '0').slice(0, 2)}`
    }
    return `${raw.padStart(2, '0')}:00`
  }

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') setCellPopover(null) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [setCellPopover])

  return (
    <BottomSheet onClose={() => setCellPopover(null)}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>📅 VARDIYA ATA</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {cellPopover.personName} · {formatDate(cellPopover.date)} {shortDay(cellPopover.date)}
            </div>
          </div>
          <button onClick={() => setCellPopover(null)} className="btn btn-ghost btn-sm">✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, .9fr)', gap: '8px', marginBottom: '10px' }}>
          <div>
            <label className="form-label">Saat Araligi</label>
            <select className="form-select" value={draftShiftId} onChange={e => setDraftShiftId(e.target.value)}>
              <option value="">Vardiya sec...</option>
              {shiftDefs.map(s => (
                <option key={s.id} value={s.id}>{formatShiftHours(s.start_hour, s.end_hour)} - {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Calisma Noktasi</label>
            <select className="form-select" value={draftLocationId} onChange={e => setDraftLocationId(e.target.value)}>
              <option value="">Nokta yok</option>
              {workLocations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            style={{ gridColumn: '1 / -1', opacity: !draftShiftId ? 0.5 : 1 }}
            disabled={!draftShiftId || assignCell.isPending}
            onClick={() => {
              setError(null)
              assignCell.mutate({
                staffId: cellPopover.staffId,
                deptId: cellPopover.deptId,
                shiftDefId: parseInt(draftShiftId),
                workLocationId: draftLocationId ? parseInt(draftLocationId) : null,
                date: cellPopover.date,
                status: 'scheduled',
                ...assignmentOptions,
              }, { onError: err => setError(err?.response?.data?.error || 'Vardiya atanamadı. Tekrar deneyin.') })
            }}
          >
            Saat + Nokta Kaydet
          </button>
        </div>
        {canOverrideLeave && (
          <div style={{ padding: '8px 0 12px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--mono)', fontSize: '10px', color: overrideLeave ? 'var(--amber)' : 'var(--text3)' }}>
              <input type="checkbox" checked={overrideLeave} onChange={e => setOverrideLeave(e.target.checked)} />
              Onaylı izin varsa müdür istisnası kullan
            </label>
            {overrideLeave && (
              <input
                className="form-input"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Zorunlu görevlendirme gerekçesi"
                style={{ width: '100%', marginTop: '8px' }}
              />
            )}
          </div>
        )}

        <div style={{ padding: '10px 0 14px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>GÜN İÇİ GÖREV PARÇALARI</div>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: segments.length ? 'var(--blue)' : 'var(--text3)' }}>{segments.length} parça</span>
          </div>

          {segments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
              {segments.map((segment, index) => (
                <div key={segment.id} style={{ display: 'grid', gridTemplateColumns: '28px minmax(90px,.7fr) minmax(0,1fr) auto', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: index < segments.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSegmentId(segment.id)
                      setShowCandidates(false)
                      setSegmentDraft({
                        shift_def_id: segment.shift_def_id ? String(segment.shift_def_id) : '',
                        role_id: segment.role_id ? String(segment.role_id) : '',
                        work_location_id: segment.work_location_id ? String(segment.work_location_id) : '',
                        start_time: segment.start_time || '', end_time: segment.end_time || '',
                        break_minutes: String(segment.break_minutes || 0), note: segment.note || '',
                      })
                    }}
                    title="Parçayı düzenle"
                    style={{ border: 0, background: 'transparent', color: 'var(--text)', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700 }}
                  >{segment.start_time}-{segment.end_time}</button>
                  <div style={{ minWidth: 0, fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[segment.work_location_name, segment.role_name, segment.break_minutes ? `${segment.break_minutes} dk mola` : null].filter(Boolean).join(' · ') || 'Nokta/rol belirtilmedi'}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" title="Parçayı sil" onClick={() => deleteSegmentMutation.mutate(segment.id)} disabled={deleteSegmentMutation.isPending}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px' }}>
            <div>
              <label className="form-label">Başlangıç</label>
              <input type="time" className="form-input" value={segmentDraft.start_time} onChange={e => setSegmentDraft(p => ({ ...p, start_time: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="form-label">Bitiş</label>
              <input type="time" className="form-input" value={segmentDraft.end_time} onChange={e => setSegmentDraft(p => ({ ...p, end_time: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="form-label">Vardiya Tanımı</label>
              <select className="form-select" value={segmentDraft.shift_def_id} onChange={e => {
                const selected = shiftDefs.find(item => String(item.id) === e.target.value)
                setSegmentDraft(p => ({ ...p, shift_def_id: e.target.value, start_time: selected ? clockValue(selected.start_hour) : p.start_time, end_time: selected ? clockValue(selected.end_hour) : p.end_time }))
              }}>
                <option value="">Özel saat</option>
                {shiftDefs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Mola (dk)</label>
              <input type="number" min="0" max="480" className="form-input" value={segmentDraft.break_minutes} onChange={e => setSegmentDraft(p => ({ ...p, break_minutes: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="form-label">Çalışma Noktası</label>
              <select className="form-select" value={segmentDraft.work_location_id} onChange={e => setSegmentDraft(p => ({ ...p, work_location_id: e.target.value }))}>
                <option value="">Nokta yok</option>
                {workLocations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Rol</label>
              <select className="form-select" value={segmentDraft.role_id} onChange={e => setSegmentDraft(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Ana rol</option>
                {staffRoles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
          <input className="form-input" value={segmentDraft.note} onChange={e => setSegmentDraft(p => ({ ...p, note: e.target.value }))} placeholder="Görev notu (opsiyonel)" style={{ width: '100%', marginTop: '8px' }} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!segmentDraft.start_time || !segmentDraft.end_time || segmentMutation.isPending || (overrideLeave && overrideReason.trim().length < 5)}
              onClick={() => segmentMutation.mutate({
                shift_def_id: segmentDraft.shift_def_id ? parseInt(segmentDraft.shift_def_id) : null,
                role_id: segmentDraft.role_id ? parseInt(segmentDraft.role_id) : null,
                work_location_id: segmentDraft.work_location_id ? parseInt(segmentDraft.work_location_id) : null,
                start_time: segmentDraft.start_time,
                end_time: segmentDraft.end_time,
                break_minutes: parseInt(segmentDraft.break_minutes) || 0,
                note: segmentDraft.note || null,
              })}
            >{editingSegmentId ? 'Parçayı Güncelle' : 'Parça Ekle'}</button>
            {editingSegmentId && <button type="button" className="btn btn-ghost btn-sm" onClick={resetSegmentDraft}>Vazgeç</button>}
            <button type="button" className="btn btn-ghost btn-sm" disabled={!segmentDraft.start_time || !segmentDraft.end_time} onClick={() => setShowCandidates(value => !value)}>
              {showCandidates ? 'Adayları Gizle' : 'Uygun Personel'}
            </button>
          </div>

          {showCandidates && (
            <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '6px' }}>DİNLENME, ROL, NOKTA VE ÇAKIŞMA KONTROLÜ</div>
              {candidatesLoading && <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Adaylar hesaplanıyor...</div>}
              {(candidateData?.candidates || []).filter(item => item.eligible).slice(0, 5).map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--green)', fontSize: '10px' }}>✓</span>
                  <span style={{ fontSize: '11px', color: 'var(--text)', flex: 1 }}>{item.full_name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{item.role_name || 'Rolsüz'} · {item.workload} görev</span>
                </div>
              ))}
              {!candidatesLoading && !(candidateData?.candidates || []).some(item => item.eligible) && <div style={{ fontSize: '10px', color: 'var(--red)' }}>Uygun personel bulunamadı.</div>}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>VARDIYA SEÇ</div>
        {shiftDefs.map(s => {
          const isActive = cellPopover.existing?.shift_def_id === s.id && cellPopover.existing?.status !== 'on_leave'
          const sc = shiftColor(s.color_class)
          return (
            <button key={s.id}
              onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: s.id, workLocationId: draftLocationId ? parseInt(draftLocationId) : null, date: cellPopover.date, status: 'scheduled', ...assignmentOptions }, { onError: err => setError(err?.response?.data?.error || 'Vardiya atanamadı. Tekrar deneyin.') }) }}
              disabled={assignCell.isPending}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px', textAlign: 'left',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--sans)',
                border: `2px solid ${isActive ? sc.text : 'var(--border)'}`,
                background: isActive ? sc.bg : 'var(--surface2)',
                color: isActive ? sc.text : 'var(--text2)',
              }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .6 }}>
                {formatShiftHours(s.start_hour, s.end_hour)}
              </span>
              {isActive && <span style={{ float: 'right', fontSize: '10px' }}>✓ Aktif</span>}
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: null, date: cellPopover.date, status: 'off' }, { onError: () => setError('İşlem başarısız. Tekrar deneyin.') }) }}
            disabled={assignCell.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
              border: `2px solid ${cellPopover.existing?.status === 'off' ? 'var(--purple)' : 'var(--border)'}`,
              background: cellPopover.existing?.status === 'off' ? 'rgba(167,139,250,.12)' : 'var(--surface2)',
              color: cellPopover.existing?.status === 'off' ? 'var(--purple)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>
            🌙 OFF {cellPopover.existing?.status === 'off' && '✓'}
          </button>
          <button
            onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: null, date: cellPopover.date, status: 'on_leave' }, { onError: () => setError('İşlem başarısız. Tekrar deneyin.') }) }}
            disabled={assignCell.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
              border: `2px solid ${cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--border)'}`,
              background: cellPopover.existing?.status === 'on_leave' ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
              color: cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>
            {cellPopover.existing?.status === 'on_leave' ? leaveTypeLabel(cellPopover.existing?.leave_type) : 'İZİN'} {cellPopover.existing?.status === 'on_leave' && '✓'}
          </button>
          {cellPopover.existing && (
            <button
              onClick={() => { setError(null); deleteShift.mutate({ staffId: cellPopover.staffId, date: cellPopover.date }, { onError: () => setError('Silme başarısız. Tekrar deneyin.') }) }}
              disabled={deleteShift.isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
              }}>
              KALDIR
            </button>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '4px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}
