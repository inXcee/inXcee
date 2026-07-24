import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { shortDay } from '../shared.jsx'
import { dayDetailSummary } from '../logic/dayDetail.js'
import { exportDayDetailExcel, openDayDetailPrint } from '../logic/dayDetailExport.js'

const toastErr = message => useToastStore.getState().addToast(message, 'error')

const GROUP_OPTIONS = [
  ['dept', 'Departman'],
  ['site', 'Site'],
  ['location', 'Nokta'],
]
const SUMMARY_COLOR = {
  working: 'var(--green)', on_leave: 'var(--teal)', sick: '#f97316',
  absent: 'var(--red)', off: 'var(--text3)',
}
const BUCKETS = [
  { key: 'on_leave', title: '⚪ İzinli', render: p => `${p.full_name} · ${p.leave_type_label}` },
  { key: 'sick', title: '🔴 Raporlu', render: p => p.full_name },
  { key: 'absent', title: '⛔ Devamsız', render: p => (p.reason ? `${p.full_name} · ${p.reason}` : p.full_name) },
  { key: 'off', title: '💤 İzin günü', render: p => p.full_name },
]

const todayIso = () => new Date().toLocaleDateString('sv-SE')

// Gün detayı: seçili gün için bölüm bölüm kadro + izin/rapor/devamsız + toplu özet.
export default function DayDetailBoard({ weekDays = [], onPersonClick }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => {
    const today = todayIso()
    return weekDays.includes(today) ? today : (weekDays[0] || today)
  })
  const [groupBy, setGroupBy] = useState('dept')
  const [openGroups, setOpenGroups] = useState(() => new Set())
  const [busy, setBusy] = useState('')

  const { data: detail, isPending, isError } = useQuery({
    queryKey: ['shift-day-detail', date, groupBy],
    queryFn: () => api.get('/shifts/day-detail', { params: { date, group_by: groupBy } }).then(r => r.data),
    enabled: open && !!date,
  })

  const summary = useMemo(() => dayDetailSummary(detail || {}), [detail])
  const groups = detail?.groups || []
  const hasData = groups.length > 0

  const toggleGroup = name => setOpenGroups(current => {
    const next = new Set(current)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  const download = async (kind) => {
    setBusy(kind)
    try {
      if (kind === 'excel') await exportDayDetailExcel(detail)
      else openDayDetailPrint(detail)
    } catch (error) { toastErr(error?.message || 'Çıktı oluşturulamadı') } finally { setBusy('') }
  }

  return (
    <div className="panel" style={{ marginBottom: '12px', borderTop: '3px solid var(--accent)' }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">📅 GÜN DETAYI</div>
          <div className="panel-subtitle">
            {open ? `${date} · bölüm bölüm kim çalışıyor, kim izinli/raporlu/devamsız` : 'seçili gün için bölüm bölüm kadro ve izin/rapor dökümü'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {open && hasData && (
            <>
              <button className="btn btn-ghost btn-sm" disabled={busy === 'excel'} onClick={() => download('excel')}>{busy === 'excel' ? '…' : '⬇ Excel'}</button>
              <button className="btn btn-ghost btn-sm" disabled={busy === 'print'} onClick={() => download('print')}>{busy === 'print' ? '…' : '⬇ PDF'}</button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
        </div>
      </div>

      {open && (
        <>
          {/* Gün + gruplama seçici */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            {weekDays.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {weekDays.map(day => (
                  <button
                    key={day}
                    className={`btn btn-sm ${day === date ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDate(day)}
                  >
                    {shortDay(day)}
                  </button>
                ))}
              </div>
            )}
            <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: '160px' }} />
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              {GROUP_OPTIONS.map(([key, label]) => (
                <button key={key} className={`btn btn-sm ${groupBy === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setGroupBy(key)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Toplu özet — her zaman görünür */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {summary.map(item => (
              <div key={item.key} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 12px', background: 'var(--surface)', minWidth: '92px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{item.label.toLocaleUpperCase('tr')}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '20px', color: SUMMARY_COLOR[item.key] }}>{item.value}</div>
              </div>
            ))}
          </div>

          {isPending && <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px 0' }}>Yükleniyor…</div>}
          {isError && <div style={{ fontSize: '11px', color: 'var(--red)', padding: '8px 0' }}>Gün detayı alınamadı.</div>}
          {!isPending && !isError && !hasData && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px 0' }}>Bu gün için çizelge kaydı yok.</div>
          )}

          {groupBy !== 'dept' && hasData && (
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
              Not: çalışma noktası atanmamış izinli/raporlu kişiler "Bölüm dışı / izinli" grubunda toplanır.
            </div>
          )}

          {/* Bölüm bölüm kartlar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groups.map(group => {
              const isOpen = openGroups.has(group.name)
              return (
                <div key={group.name} style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    aria-expanded={isOpen}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                      background: isOpen ? 'var(--surface)' : 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', width: '12px' }}>{isOpen ? '▾' : '▸'}</span>
                    <strong style={{ fontSize: '13px', flex: '1 1 auto', minWidth: 0 }}>{group.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      çalışan {group.totals.working}
                      {group.totals.on_leave ? ` · izin ${group.totals.on_leave}` : ''}
                      {group.totals.sick ? ` · rapor ${group.totals.sick}` : ''}
                      {group.totals.absent ? ` · devamsız ${group.totals.absent}` : ''}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '0 12px 10px' }}>
                      {group.shifts.map(shift => (
                        <div key={shift.shift_def_id ?? shift.shift_name} style={{ padding: '6px 0', borderTop: '1px dashed var(--border)' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>
                            {shift.shift_name}
                            {shift.start_hour != null && shift.start_hour !== '' && (
                              <span style={{ color: 'var(--text3)', fontSize: '10px', marginLeft: '6px' }}>
                                {shift.start_hour}{shift.end_hour ? `–${shift.end_hour}` : ''}
                              </span>
                            )}
                            <span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: '11px', marginLeft: '8px' }}>{shift.count} kişi</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {shift.people.map(person => (
                              <button
                                key={person.staff_id}
                                type="button"
                                onClick={() => onPersonClick?.(person.staff_id)}
                                title={[person.role_name, person.work_location_name].filter(Boolean).join(' · ')}
                                style={{
                                  border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 9px',
                                  background: 'var(--surface2, var(--surface))', cursor: 'pointer', fontSize: '11px', color: 'var(--text)',
                                }}
                              >
                                {person.full_name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {BUCKETS.map(bucket => {
                        const items = group[bucket.key] || []
                        if (!items.length) return null
                        return (
                          <div key={bucket.key} style={{ padding: '6px 0', borderTop: '1px dashed var(--border)', fontSize: '11px' }}>
                            <span style={{ fontWeight: 700, marginRight: '6px' }}>{bucket.title} ({items.length})</span>
                            {items.map((person, index) => (
                              <button
                                key={person.staff_id}
                                type="button"
                                onClick={() => onPersonClick?.(person.staff_id)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text2)', fontSize: '11px' }}
                              >
                                {bucket.render(person)}{index < items.length - 1 ? ' · ' : ''}
                              </button>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
