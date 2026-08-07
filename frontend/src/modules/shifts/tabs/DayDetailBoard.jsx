import { useMemo, useState } from 'react'
import { weekShiftMatrix, dayHeadcounts } from '../logic/departmentDigest.js'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { formatDate, shortDay } from '../shared.jsx'
import {
  buildShiftMatrix,
  buildShiftOverview,
  dayDetailSummary,
  groupMatchesSearch,
} from '../logic/dayDetail.js'
import { exportDayDetailExcel, openDayDetailPrint } from '../logic/dayDetailExport.js'

const toastErr = message => useToastStore.getState().addToast(message, 'error')

const GROUP_OPTIONS = [
  ['dept', 'Departman'],
  ['site', 'Site'],
  ['location', 'Nokta'],
]
const SUMMARY_COLOR = {
  roster: 'var(--accent)',
  working: 'var(--green)', on_leave: 'var(--teal)', sick: '#f97316',
  absent: 'var(--red)', off: 'var(--text3)',
}
const BUCKETS = [
  { key: 'on_leave', title: 'İzinli', icon: '○', color: 'var(--teal)', detail: p => p.leave_type_label },
  { key: 'sick', title: 'Raporlu', icon: '●', color: '#f97316', detail: () => 'Sağlık raporu' },
  { key: 'absent', title: 'Devamsız', icon: '!', color: 'var(--red)', detail: p => p.reason || 'Sebep belirtilmemiş' },
  { key: 'off', title: 'İzin günü', icon: '—', color: 'var(--text3)', detail: () => 'Planlı izin günü' },
]

const todayIso = () => new Date().toLocaleDateString('sv-SE')
const groupKey = group => group.key || group.name
const personMeta = person => [person.role_name, person.work_location_name || person.site].filter(Boolean).join(' · ')

// Gün detayı: seçili gün için bölüm bölüm kadro + izin/rapor/devamsız + toplu özet.
export default function DayDetailBoard({ weekDays = [], staffGrid = [], onPersonClick }) {
  const [open, setOpen] = useState(true)
  const [date, setDate] = useState(() => {
    const today = todayIso()
    return weekDays.includes(today) ? today : (weekDays[0] || today)
  })
  const [groupBy, setGroupBy] = useState('dept')
  const [openGroups, setOpenGroups] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')

  const { data: detail, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['shift-day-detail', date, groupBy],
    queryFn: () => api.get('/shifts/day-detail', { params: { date, group_by: groupBy } }).then(r => r.data),
    enabled: open && !!date,
  })

  // Hafta özeti ekrandaki çizelgeden hesaplanır — 7 gün için 7 istek atmaya
  // gerek yok, veri zaten yüklü.
  const haftaGruplari = useMemo(() => {
    const map = new Map()
    ;(staffGrid || []).forEach(p => {
      const ad = p.dept_name || 'Departmansız'
      if (!map.has(ad)) map.set(ad, { name: ad, people: [] })
      map.get(ad).people.push(p)
    })
    return [...map.values()]
  }, [staffGrid])
  const haftaMatrisi = useMemo(() => weekShiftMatrix(haftaGruplari, weekDays), [haftaGruplari, weekDays])
  const gunToplamlari = useMemo(() => dayHeadcounts(haftaGruplari, weekDays), [haftaGruplari, weekDays])

  const summary = useMemo(() => dayDetailSummary(detail || {}), [detail])
  const matrix = useMemo(() => buildShiftMatrix(detail || {}), [detail])
  const shiftOverview = useMemo(() => buildShiftOverview(detail || {}), [detail])
  const groups = detail?.groups || []
  const visibleGroups = useMemo(
    () => groups.filter(group => groupMatchesSearch(group, search)),
    [groups, search],
  )
  const dataQuality = useMemo(() => {
    let unassigned = 0
    let missingLocation = 0
    for (const group of groups) {
      for (const shift of group.shifts || []) {
        if (shift.shift_def_id == null) unassigned += shift.count || 0
        missingLocation += (shift.people || []).filter(person => (
          !person.work_location_name && !person.work_locations?.length
        )).length
      }
    }
    return { unassigned, missingLocation }
  }, [groups])
  const hasData = groups.length > 0
  const groupLabel = GROUP_OPTIONS.find(([key]) => key === groupBy)?.[1] || 'Departman'

  const selectDate = nextDate => {
    setDate(nextDate)
    setOpenGroups(new Set())
    setSearch('')
  }

  const selectGroup = nextGroup => {
    setGroupBy(nextGroup)
    setOpenGroups(new Set())
    setSearch('')
  }

  const toggleGroup = key => setOpenGroups(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const revealGroup = key => {
    setOpenGroups(current => new Set(current).add(key))
  }

  const allVisibleOpen = visibleGroups.length > 0 && visibleGroups.every(group => openGroups.has(groupKey(group)))
  const toggleAllGroups = () => {
    if (allVisibleOpen) {
      setOpenGroups(current => {
        const next = new Set(current)
        visibleGroups.forEach(group => next.delete(groupKey(group)))
        return next
      })
    } else {
      setOpenGroups(current => {
        const next = new Set(current)
        visibleGroups.forEach(group => next.add(groupKey(group)))
        return next
      })
    }
  }

  const download = async (kind) => {
    setBusy(kind)
    try {
      if (kind === 'excel') await exportDayDetailExcel(detail)
      else openDayDetailPrint(detail)
    } catch (error) { toastErr(error?.message || 'Çıktı oluşturulamadı') } finally { setBusy('') }
  }

  return (
    /* overflow:visible — .panel varsayılanı hidden ve yapışkan gün şeridini hem
       kırpıyor hem kapsayıcıyı daraltıp yapışmasını engelliyor. */
    <div className="panel" style={{ marginBottom: '12px', borderTop: '3px solid var(--accent)', overflow: 'visible' }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">📅 GÜN DETAYI</div>
          <div className="panel-subtitle">
            {open ? `${formatDate(date)} · tüm departmanların vardiya, konum ve devam durumu` : 'seçili gün için bölüm bölüm kadro ve izin/rapor dökümü'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {open && isFetching && !isPending && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Güncelleniyor…</span>}
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
          {/* Gün + gruplama seçici — YAPIŞKAN.
              Gün dökümü uzun bir liste; seçici yukarıda sabit kalmayınca başka
              bir güne bakmak için sayfanın en başına dönmek gerekiyordu.
              top=0: kaydırma kabı zaten sayfanın yapışkan başlık çubuğunun
              altında başlıyor, ayrıca boşluk bırakmak gerekmiyor. */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 5,
            display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
            margin: '0 -14px 10px', padding: '8px 14px',
            background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid var(--border)',
          }}>
            {weekDays.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {weekDays.map(day => (
                  <button
                    key={day}
                    className={`btn btn-sm ${day === date ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => selectDate(day)}
                    aria-label={`${formatDate(day)} ${shortDay(day)}`}
                  >
                    <span>{shortDay(day)}</span>
                    <strong style={{ marginLeft: '4px' }}>{day.slice(8, 10)}</strong>
                    <span style={{
                      marginLeft: 5, fontFamily: 'var(--mono)', fontSize: 9,
                      opacity: day === date ? 0.85 : 0.6,
                      color: gunToplamlari[day] ? undefined : 'var(--red)',
                    }}>{gunToplamlari[day] ?? 0}</span>
                  </button>
                ))}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text3)' }}>
              Tarih
              <input type="date" className="form-input" value={date} onChange={e => selectDate(e.target.value)} style={{ maxWidth: '160px' }} />
            </label>
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }} aria-label="Görünümü grupla">
              {GROUP_OPTIONS.map(([key, label]) => (
                <button key={key} className={`btn btn-sm ${groupBy === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => selectGroup(key)}>{label}</button>
              ))}
            </div>
          </div>

          {/* Hafta özeti — her günü tek tek açmadan tek bakışta */}
          {haftaMatrisi.rows.length > 0 && (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 9, padding: '8px 10px',
              marginBottom: 12, background: 'var(--surface2)', overflowX: 'auto',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)', marginBottom: 6 }}>
                HAFTA ÖZETİ · vardiya × gün · toplam {haftaMatrisi.weekTotal} kişi-gün
              </div>
              <table className="data-table" style={{ fontSize: 11, minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>VARDİYA</th>
                    {weekDays.map(d => (
                      <th key={d} style={{ textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => selectDate(d)} title={`${formatDate(d)} detayına git`}>
                        {shortDay(d)}<div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{d.slice(8, 10)}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: 'center' }}>TOP</th>
                  </tr>
                </thead>
                <tbody>
                  {haftaMatrisi.rows.map(satir => (
                    <tr key={satir.shift}>
                      <td style={{ fontWeight: 600 }}>{satir.shift}</td>
                      {satir.days.map((n, i) => (
                        <td key={weekDays[i]} style={{
                          textAlign: 'center', fontFamily: 'var(--mono)', cursor: 'pointer',
                          // Sıfır sessiz kalmasın: o vardiyada o gün kimse yok demek.
                          color: n === 0 ? 'var(--red)' : 'var(--text)',
                          background: weekDays[i] === date ? 'rgba(240,165,0,.10)' : undefined,
                        }} onClick={() => selectDate(weekDays[i])}>{n}</td>
                      ))}
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>{satir.total}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700, color: 'var(--text3)' }}>TOPLAM</td>
                    {haftaMatrisi.dayTotals.map((n, i) => (
                      <td key={weekDays[i]} style={{
                        textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700,
                        color: n === 0 ? 'var(--red)' : 'var(--text)',
                      }}>{n}</td>
                    ))}
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>{haftaMatrisi.weekTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Toplu özet — her zaman görünür */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            {summary.map(item => (
              <div key={item.key} style={{
                border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px',
                background: item.key === 'roster' ? 'rgba(245,158,11,.10)' : 'var(--surface)',
                minWidth: '92px',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>{item.label.toLocaleUpperCase('tr')}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '24px', lineHeight: 1.2, color: SUMMARY_COLOR[item.key] }}>{item.value}</div>
              </div>
            ))}
          </div>

          {hasData && (dataQuality.unassigned > 0 || dataQuality.missingLocation > 0) && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap',
              border: '1px solid rgba(245,158,11,.35)', borderRadius: '10px', padding: '8px 10px',
              background: 'rgba(245,158,11,.08)', color: 'var(--text2)', fontSize: '10px', marginBottom: '12px',
            }}>
              <strong style={{ color: 'var(--accent)' }}>⚠ Veri tamamlama</strong>
              <span>
                {[
                  dataQuality.unassigned ? `${dataQuality.unassigned} vardiya kaydında vardiya tanımı yok` : '',
                  dataQuality.missingLocation ? `${dataQuality.missingLocation} vardiya kaydında çalışma noktası yok` : '',
                ].filter(Boolean).join(' · ')}.
                {' '}Doğru vardiya ve “nerede” dağılımı için ilgili çizelge hücrelerini tamamlayın.
              </span>
            </div>
          )}

          {/* Vardiya toplamları — tüm departmanların aynı vardiyadaki toplu görünümü */}
          {hasData && shiftOverview.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>
                VARDİYA TOPLAMLARI
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                {shiftOverview.map(shift => (
                  <div key={shift.key} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: '13px' }}>{shift.shift_name}</strong>
                        {shift.start_hour != null && shift.start_hour !== '' && (
                          <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '1px' }}>
                            {shift.start_hour}{shift.end_hour ? `–${shift.end_hour}` : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '25px', color: 'var(--green)', lineHeight: 1 }}>{shift.count}</div>
                        <div style={{ fontSize: '9px', color: 'var(--text3)' }}>KİŞİ</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {shift.groups.map(group => (
                        <button
                          key={group.key}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => revealGroup(group.key)}
                          aria-label={`${group.name} detayını aç`}
                          style={{ padding: '2px 7px', fontSize: '10px' }}
                        >
                          {group.name} <strong>{group.count}</strong>
                        </button>
                      ))}
                    </div>
                    {shift.locations.length > 0 && (
                      <div style={{ marginTop: '7px', paddingTop: '6px', borderTop: '1px dashed var(--border)', fontSize: '10px', color: 'var(--text3)' }}>
                        <span style={{ fontWeight: 700 }}>Nerede:</span>{' '}
                        {shift.locations.map(location => `${location.name} ${location.count}`).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vardiya × Bölüm matrisi — hangi bölümde hangi vardiyada kaç kişi */}
          {hasData && matrix.columns.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>
                VARDİYA × {groupLabel.toLocaleUpperCase('tr')} — KİŞİ SAYILARI
              </div>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '620px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{groupLabel}</th>
                    {matrix.columns.map(column => (
                      <th key={column.key} style={{ textAlign: 'center' }}>
                        {column.shift_name}
                        {column.start_hour != null && column.start_hour !== '' && (
                          <div style={{ fontWeight: 400, fontSize: '9px', color: 'var(--text3)' }}>
                            {column.start_hour}{column.end_hour ? `–${column.end_hour}` : ''}
                          </div>
                        )}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', color: 'var(--teal)' }}>İzin</th>
                    <th style={{ textAlign: 'center', color: '#f97316' }}>Rapor</th>
                    <th style={{ textAlign: 'center', color: 'var(--red)' }}>Devamsız</th>
                    <th style={{ textAlign: 'center', color: 'var(--text3)' }}>İzin günü</th>
                    <th style={{ textAlign: 'center' }}>Çalışan</th>
                    <th style={{ textAlign: 'right' }}>Gün kadrosu</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map(row => (
                    <tr key={row.key}>
                      <td>
                        <button
                          type="button"
                          onClick={() => revealGroup(row.key)}
                          aria-label={`${row.name} detayını aç`}
                          style={{ border: 0, background: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0, fontWeight: 700, textAlign: 'left' }}
                        >
                          {row.name}
                        </button>
                      </td>
                      {row.cells.map((value, index) => (
                        <td key={index} style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: value ? 'var(--green)' : 'var(--text3)', fontWeight: value ? 700 : 400 }}>
                          {value || '·'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: row.on_leave ? 'var(--teal)' : 'var(--text3)' }}>{row.on_leave || '·'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: row.sick ? '#f97316' : 'var(--text3)' }}>{row.sick || '·'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: row.absent ? 'var(--red)' : 'var(--text3)' }}>{row.absent || '·'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{row.off || '·'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{row.working}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{row.total}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(245,158,11,.10)', fontWeight: 700 }}>
                    <td>TOPLAM</td>
                    {matrix.columnTotals.map((value, index) => (
                      <td key={index} style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{value}</td>
                    ))}
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{matrix.totals.on_leave}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{matrix.totals.sick}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{matrix.totals.absent}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{matrix.totals.off}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{matrix.totals.working}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{matrix.totals.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {isPending && <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px 0' }}>Yükleniyor…</div>}
          {isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--red)', padding: '8px 0' }}>
              Gün detayı alınamadı.
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}
          {!isPending && !isError && !hasData && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px 0' }}>Bu gün için çizelge kaydı yok.</div>
          )}

          {groupBy !== 'dept' && hasData && (
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
              Not: çalışma noktası atanmamış izinli/raporlu kişiler "Bölüm dışı / izinli" grubunda toplanır.
            </div>
          )}

          {/* Bölüm bölüm kartlar */}
          {hasData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '12px 0 8px' }}>
              <div style={{ flex: '1 1 260px', position: 'relative' }}>
                <input
                  className="form-input"
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Kişi, departman, rol veya konum ara…"
                  aria-label="Gün detayında ara"
                  style={{ width: '100%' }}
                />
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                {visibleGroups.length}/{groups.length} {groupLabel.toLocaleLowerCase('tr')}
              </span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={toggleAllGroups}>
                {allVisibleOpen ? 'Tümünü kapat' : 'Tümünü aç'}
              </button>
            </div>
          )}

          {hasData && visibleGroups.length === 0 && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: '10px', padding: '14px', color: 'var(--text3)', fontSize: '11px', textAlign: 'center' }}>
              “{search}” aramasıyla eşleşen kişi, rol, konum veya {groupLabel.toLocaleLowerCase('tr')} yok.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {visibleGroups.map(group => {
              const key = groupKey(group)
              const isOpen = openGroups.has(key) || !!search.trim()
              return (
                <div key={key} style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={isOpen}
                    aria-label={`${group.name} detayları`}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                      background: isOpen ? 'var(--surface)' : 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', width: '12px' }}>{isOpen ? '▾' : '▸'}</span>
                    <strong style={{ fontSize: '13px', flex: '1 1 auto', minWidth: 0 }}>{group.name}</strong>
                    <span style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                      <span style={{ color: 'var(--green)' }}>çalışan {group.totals.working}</span>
                      {!!group.totals.on_leave && <span style={{ color: 'var(--teal)' }}>izin {group.totals.on_leave}</span>}
                      {!!group.totals.sick && <span style={{ color: '#f97316' }}>rapor {group.totals.sick}</span>}
                      {!!group.totals.absent && <span style={{ color: 'var(--red)' }}>devamsız {group.totals.absent}</span>}
                      {!!group.totals.off && <span style={{ color: 'var(--text3)' }}>izin günü {group.totals.off}</span>}
                      <span style={{ color: 'var(--accent)' }}>kadro {group.totals.roster ?? (
                        group.totals.working + group.totals.on_leave + group.totals.sick + group.totals.absent + group.totals.off
                      )}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '0 12px 10px' }}>
                      {group.shifts.map(shift => (
                        <div key={shift.shift_key || `${shift.shift_def_id ?? shift.shift_name}|${shift.start_hour || ''}|${shift.end_hour || ''}`} style={{ padding: '8px 0', borderTop: '1px dashed var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '12px' }}>{shift.shift_name}</strong>
                            {shift.start_hour != null && shift.start_hour !== '' && (
                              <span style={{ color: 'var(--text3)', fontSize: '10px' }}>
                                {shift.start_hour}{shift.end_hour ? `–${shift.end_hour}` : ''}
                              </span>
                            )}
                            <span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: '11px' }}>{shift.count} kişi</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginLeft: 'auto' }}>
                              {[...new Set(shift.people.flatMap(person => (
                                person.work_locations?.length ? person.work_locations : [person.work_location_name]
                              )).filter(Boolean))].map(location => (
                                <span key={location} style={{ borderRadius: '999px', padding: '2px 6px', background: 'var(--surface)', color: 'var(--text3)', fontSize: '9px' }}>
                                  {location}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '5px', marginTop: '6px' }}>
                            {shift.people.map(person => (
                              <button
                                key={person.staff_id}
                                type="button"
                                onClick={() => onPersonClick?.(person.staff_id)}
                                aria-label={person.full_name}
                                title="Personel detayını aç"
                                style={{
                                  border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 8px',
                                  background: 'var(--surface2, var(--surface))', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                                }}
                              >
                                <span style={{ display: 'block', fontSize: '11px', fontWeight: 650 }}>{person.full_name}</span>
                                {personMeta(person) && <span style={{ display: 'block', marginTop: '1px', fontSize: '9px', color: 'var(--text3)' }}>{personMeta(person)}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {BUCKETS.map(bucket => {
                        const items = group[bucket.key] || []
                        if (!items.length) return null
                        return (
                          <div key={bucket.key} style={{ padding: '8px 0', borderTop: '1px dashed var(--border)' }}>
                            <div style={{ fontWeight: 700, marginBottom: '5px', fontSize: '11px', color: bucket.color }}>
                              <span aria-hidden="true">{bucket.icon}</span> {bucket.title} ({items.length})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '5px' }}>
                              {items.map(person => (
                              <button
                                key={person.staff_id}
                                type="button"
                                onClick={() => onPersonClick?.(person.staff_id)}
                                aria-label={person.full_name}
                                title="Personel detayını aç"
                                style={{
                                  background: 'var(--surface)', border: `1px solid ${bucket.color}`,
                                  borderRadius: '8px', padding: '5px 8px', cursor: 'pointer',
                                  color: 'var(--text2)', textAlign: 'left',
                                }}
                              >
                                <span style={{ display: 'block', fontSize: '11px', fontWeight: 650 }}>{person.full_name}</span>
                                <span style={{ display: 'block', marginTop: '1px', fontSize: '9px', color: bucket.color }}>{bucket.detail(person)}</span>
                                {personMeta(person) && <span style={{ display: 'block', marginTop: '1px', fontSize: '9px', color: 'var(--text3)' }}>{personMeta(person)}</span>}
                              </button>
                              ))}
                            </div>
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
