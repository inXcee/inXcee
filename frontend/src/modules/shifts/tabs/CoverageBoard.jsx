import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { shiftColor, formatShiftHours, shortDay } from '../shared.jsx'

// Kadro kapsama panosu (X4): hedefi olan vardiyalar için hafta × gün gerçekleşen vs hedef.
// Gerçekleşen < hedef → kırmızı.
export default function CoverageBoard({ from, to, weekDays = [] }) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['shift-coverage', from, to],
    queryFn: () => api.get('/shifts/coverage', { params: { from, to } }).then(r => r.data),
    enabled: open && !!from && !!to,
  })
  const { data: breakdown } = useQuery({
    queryKey: ['shift-breakdown', from, to],
    queryFn: () => api.get('/shifts/breakdown', { params: { from, to } }).then(r => r.data),
    enabled: open && !!from && !!to,
  })
  const shifts = (data?.shifts || []).filter(s => (s.min_staff || 0) > 0)
  const countMap = useMemo(() => {
    const m = {}
    ;(data?.counts || []).forEach(c => { m[`${c.work_date}:${c.shift_def_id}`] = c.assigned })
    return m
  }, [data])
  const locationRows = useMemo(() => {
    const byName = new Map()
    ;(breakdown?.location_counts || []).forEach(item => {
      const name = item.work_location_name || 'Noktasiz'
      if (!byName.has(name)) byName.set(name, { name, perDay: {} })
      byName.get(name).perDay[item.work_date] = item.assigned || 0
    })
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [breakdown])
  const roleRows = useMemo(() => {
    const byName = new Map()
    ;(breakdown?.role_counts || []).forEach(item => {
      const name = item.role_name || 'Rolsuz'
      if (!byName.has(name)) byName.set(name, { name, perDay: {} })
      byName.get(name).perDay[item.work_date] = item.assigned || 0
    })
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [breakdown])
  const shortfalls = useMemo(() => {
    let n = 0
    shifts.forEach(s => weekDays.forEach(d => { if ((countMap[`${d}:${s.id}`] || 0) < s.min_staff) n += 1 }))
    return n
  }, [shifts, weekDays, countMap])

  if (!from) return null

  return (
    <div className="panel" style={{ marginBottom: '12px', borderTop: `3px solid ${shortfalls ? 'var(--red)' : 'var(--teal)'}` }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">🎯 KADRO KAPSAMASI</div>
          <div className="panel-subtitle">
            {open
              ? (shortfalls ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{shortfalls} vardiya-gün hedefin altında</span> : 'tüm hedefler tamam')
              : 'hedefi olan vardiyalar için gerçekleşen vs hedef (haftalık)'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(o => !o)}>{open ? '▲ Gizle' : '▼ Aç'}</button>
      </div>
      {open && (
        shifts.length === 0
          ? <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '4px 2px' }}>Hedefli vardiya yok — Ayarlar → vardiya tanımına <b>Kadro Hedefi</b> girin.</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Vardiya</th>
                    <th style={{ textAlign: 'right' }}>Hedef</th>
                    {weekDays.map(d => <th key={d} style={{ textAlign: 'center' }}>{shortDay(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(s => {
                    const sc = shiftColor(s.color_class)
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: sc.text, marginRight: '6px' }} />
                          {s.name} <span style={{ color: 'var(--text3)', fontSize: '9px' }}>{formatShiftHours(s.start_hour, s.end_hour)}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.min_staff}</td>
                        {weekDays.map(d => {
                          const a = countMap[`${d}:${s.id}`] || 0
                          const under = a < s.min_staff
                          return (
                            <td key={d} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: under ? 700 : 400, color: under ? 'var(--red)' : 'var(--green)', background: under ? 'rgba(239,68,68,.08)' : undefined }}>{a}</td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      )}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <BreakdownTable title="CALISMA NOKTASI KIRILIMI" label="Nokta" rows={locationRows} weekDays={weekDays} />
          <BreakdownTable title="ROL KIRILIMI" label="Rol" rows={roleRows} weekDays={weekDays} />
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ title, label, rows, weekDays }) {
  if (!rows.length) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>{title}</div>
      <table className="data-table" style={{ fontSize: '11px', minWidth: '560px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>{label}</th>
            {weekDays.map(d => <th key={d} style={{ textAlign: 'center' }}>{shortDay(d)}</th>)}
            <th style={{ textAlign: 'right' }}>Toplam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const total = weekDays.reduce((sum, date) => sum + (row.perDay[date] || 0), 0)
            return (
              <tr key={row.name}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                {weekDays.map(date => (
                  <td key={date} style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: row.perDay[date] ? 'var(--text)' : 'var(--text3)' }}>
                    {row.perDay[date] || 0}
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
