// Çizelge alt-sheet'leri — ScheduleTab orkestratöründen birebir taşındı.
// DailyView: günlük departman görünümü; WeekFillSheet: kişinin haftasını doldur;
// CellAssignSheet: tek hücre vardiya ata/sil. Hepsi prop-tabanlı, davranış aynı.
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { addDays, todayStr, shiftColor, BottomSheet } from '../shared.jsx'

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
                            {sh.start}:00–{sh.end === 24 ? '00' : sh.end}:00
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'rgba(26,188,156,.12)', color: 'var(--teal)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                    }}>İZİNDE</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                      {g.leave.map(s => s.full_name).join(' · ')}
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
                    {s.start_hour}:00–{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
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

export function CellAssignSheet({ cellPopover, setCellPopover, shiftDefs, assignCell, deleteShift, formatDate, shortDay, shiftColor }) {
  const [error, setError] = useState(null)

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
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>VARDIYA SEÇ</div>
        {shiftDefs.map(s => {
          const isActive = cellPopover.existing?.shift_def_id === s.id && cellPopover.existing?.status !== 'on_leave'
          const sc = shiftColor(s.color_class)
          return (
            <button key={s.id}
              onClick={() => { setError(null); assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: s.id, date: cellPopover.date, status: 'scheduled' }, { onError: () => setError('Vardiya atanamadı. Tekrar deneyin.') }) }}
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
                {s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00
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
            İZİN {cellPopover.existing?.status === 'on_leave' && '✓'}
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
