import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { shiftColor, formatShiftHours, shortDay, SidePanel } from '../shared.jsx'

function toClockInput(value) {
  if (value == null || value === '') return ''
  const raw = String(value)
  if (raw.includes(':')) {
    const [hour, minute = '00'] = raw.split(':')
    return `${hour.padStart(2, '0')}:${minute.padEnd(2, '0').slice(0, 2)}`
  }
  return `${raw.padStart(2, '0')}:00`
}

// Kadro kapsama panosu (X4): hedefi olan vardiyalar için hafta × gün gerçekleşen vs hedef.
// Gerçekleşen < hedef → kırmızı.
// Kırılım hücrelerine tıklayınca o gün+değer için atanan kişiler panelde açılır (tıklanabilir).
export default function CoverageBoard({
  from, to, weekDays = [], onPersonClick, canEdit = false,
  departments = [], shiftDefs = [], roles = [], locations = [],
}) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null) // { date, dimension, value, label, anchorRect }
  const [ruleFormOpen, setRuleFormOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState({ name: '', dept_id: '', role_id: '', work_location_id: '', shift_def_id: '', start_time: '08:00', end_time: '12:00', min_staff: '1', days_of_week: '1,2,3,4,5,6,7' })
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
  const rules = data?.rules || []
  const ruleCountMap = useMemo(() => {
    const map = {}
    ;(data?.rule_counts || []).forEach(item => { map[`${item.work_date}:${item.rule_id}`] = item })
    return map
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
  const siteRows = useMemo(() => {
    const byName = new Map()
    ;(breakdown?.site_counts || []).forEach(item => {
      const name = item.site || 'Sitesiz'
      if (!byName.has(name)) byName.set(name, { name, perDay: {} })
      byName.get(name).perDay[item.work_date] = item.assigned || 0
    })
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [breakdown])
  const shortfalls = useMemo(() => {
    let n = 0
    shifts.forEach(s => weekDays.forEach(d => { if ((countMap[`${d}:${s.id}`] || 0) < s.min_staff) n += 1 }))
    ;(data?.rule_counts || []).forEach(item => { if (item.missing > 0) n += 1 })
    return n
  }, [shifts, weekDays, countMap, data])

  const createRule = useMutation({
    mutationFn: payload => api.post('/shifts/coverage-rules', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-coverage'] })
      setRuleFormOpen(false)
      setRuleForm({ name: '', dept_id: '', role_id: '', work_location_id: '', shift_def_id: '', start_time: '08:00', end_time: '12:00', min_staff: '1', days_of_week: '1,2,3,4,5,6,7' })
    },
  })
  const deleteRule = useMutation({
    mutationFn: id => api.delete(`/shifts/coverage-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-coverage'] }),
  })

  const openCell = (dimension, value, date, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPicked({ dimension, value, date, label: value, anchorRect: { top: rect.top } })
  }

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
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text)', fontWeight: 700, letterSpacing: '1px' }}>SAAT BAZLI OPERASYON KURALLARI</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>Departman · rol · çalışma noktası · saat aralığı</div>
            </div>
            {canEdit && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setRuleFormOpen(value => !value)}>{ruleFormOpen ? 'Vazgeç' : '+ Kural'}</button>}
          </div>

          {ruleFormOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '8px', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>
              <input className="form-input" value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))} placeholder="Kural adı" />
              <select className="form-select" value={ruleForm.dept_id} onChange={e => setRuleForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Tüm departmanlar</option>
                {departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select className="form-select" value={ruleForm.role_id} onChange={e => setRuleForm(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Tüm roller</option>
                {roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select className="form-select" value={ruleForm.work_location_id} onChange={e => setRuleForm(p => ({ ...p, work_location_id: e.target.value }))}>
                <option value="">Tüm noktalar</option>
                {locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select className="form-select" value={ruleForm.shift_def_id} onChange={e => {
                const selected = shiftDefs.find(item => String(item.id) === e.target.value)
                setRuleForm(p => ({ ...p, shift_def_id: e.target.value, start_time: selected ? toClockInput(selected.start_hour) : p.start_time, end_time: selected ? toClockInput(selected.end_hour) : p.end_time }))
              }}>
                <option value="">Tüm vardiyalar</option>
                {shiftDefs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input type="time" className="form-input" value={ruleForm.start_time} onChange={e => setRuleForm(p => ({ ...p, start_time: e.target.value }))} />
              <input type="time" className="form-input" value={ruleForm.end_time} onChange={e => setRuleForm(p => ({ ...p, end_time: e.target.value }))} />
              <input type="number" min="0" className="form-input" value={ruleForm.min_staff} onChange={e => setRuleForm(p => ({ ...p, min_staff: e.target.value }))} placeholder="Minimum kişi" />
              <button
                className="btn btn-primary btn-sm"
                disabled={!ruleForm.name.trim() || !ruleForm.start_time || !ruleForm.end_time || createRule.isPending}
                onClick={() => createRule.mutate({
                  ...ruleForm,
                  dept_id: ruleForm.dept_id ? parseInt(ruleForm.dept_id) : null,
                  role_id: ruleForm.role_id ? parseInt(ruleForm.role_id) : null,
                  work_location_id: ruleForm.work_location_id ? parseInt(ruleForm.work_location_id) : null,
                  shift_def_id: ruleForm.shift_def_id ? parseInt(ruleForm.shift_def_id) : null,
                  min_staff: parseInt(ruleForm.min_staff) || 0,
                })}
              >Kuralı Kaydet</button>
            </div>
          )}

          {rules.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text3)', padding: '6px 0' }}>Saat bazlı kapsama kuralı tanımlanmadı.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '10px', minWidth: '700px' }}>
                <thead><tr><th style={{ textAlign: 'left' }}>Kural</th><th>Saat</th><th>Hedef</th>{weekDays.map(date => <th key={date}>{shortDay(date)}</th>)}{canEdit && <th />}</tr></thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 700 }}>{rule.name}</div>
                        <div style={{ color: 'var(--text3)', fontSize: '8px' }}>{[rule.dept_name, rule.role_name, rule.work_location_name].filter(Boolean).join(' · ') || 'Genel'}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{rule.start_time}-{rule.end_time}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{rule.min_staff}</td>
                      {weekDays.map(date => {
                        const item = ruleCountMap[`${date}:${rule.id}`]
                        const active = !!item
                        const under = active && item.missing > 0
                        return <td key={date} style={{ textAlign: 'center', fontFamily: 'var(--mono)', color: !active ? 'var(--text3)' : under ? 'var(--red)' : 'var(--green)', background: under ? 'rgba(239,68,68,.08)' : undefined }}>{active ? `${item.assigned}/${item.min_staff}` : '—'}</td>
                      })}
                      {canEdit && <td><button className="btn btn-ghost btn-sm" title="Kuralı sil" onClick={() => deleteRule.mutate(rule.id)} disabled={deleteRule.isPending}>×</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <BreakdownTable title="SITE KIRILIMI (OTC / LOKAL / KAMP)" label="Site" dimension="site" rows={siteRows} weekDays={weekDays} onCell={openCell} />
          <BreakdownTable title="CALISMA NOKTASI KIRILIMI" label="Nokta" dimension="location" rows={locationRows} weekDays={weekDays} onCell={openCell} />
          <BreakdownTable title="ROL KIRILIMI" label="Rol" dimension="role" rows={roleRows} weekDays={weekDays} onCell={openCell} />
        </div>
      )}
      {picked && (
        <AssigneePanel
          picked={picked}
          onClose={() => setPicked(null)}
          onPersonClick={(id) => { setPicked(null); onPersonClick?.(id) }}
        />
      )}
    </div>
  )
}

function BreakdownTable({ title, label, dimension, rows, weekDays, onCell }) {
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
                {weekDays.map(date => {
                  const v = row.perDay[date] || 0
                  return (
                    <td
                      key={date}
                      onClick={v ? (e) => onCell(dimension, row.name, date, e) : undefined}
                      title={v ? `${row.name} · ${shortDay(date)} — ${v} kişi (tıkla)` : undefined}
                      style={{
                        textAlign: 'center', fontFamily: 'var(--mono)',
                        color: v ? 'var(--text)' : 'var(--text3)',
                        cursor: v ? 'pointer' : 'default',
                        textDecoration: v ? 'underline dotted var(--border)' : undefined,
                      }}
                    >
                      {v}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AssigneePanel({ picked, onClose, onPersonClick }) {
  const { data, isLoading } = useQuery({
    queryKey: ['breakdown-assignees', picked.date, picked.dimension, picked.value],
    queryFn: () => api.get('/shifts/breakdown/assignees', {
      params: { date: picked.date, dimension: picked.dimension, value: picked.value },
    }).then(r => r.data),
  })
  const people = data?.assignees || []
  const dimLabel = { site: 'Site', location: 'Nokta', role: 'Rol' }[picked.dimension] || ''
  return (
    <SidePanel
      title={picked.label}
      subtitle={`${dimLabel} · ${picked.date} · ${people.length} kişi`}
      icon="👥"
      onClose={onClose}
      anchorRect={picked.anchorRect}
      width={360}
    >
      {isLoading && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Yükleniyor…</div>}
      {!isLoading && people.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Kayıt yok.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {people.map(p => {
          const sc = shiftColor(p.work_location_color)
          return (
            <button
              key={p.staff_id}
              onClick={() => onPersonClick(p.staff_id)}
              style={{
                textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', width: '100%',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{p.full_name}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span>{p.dept_name}</span>
                {p.role_name && <span>· {p.role_name}</span>}
                {p.shift_name && <span>· {formatShiftHours(p.start_hour, p.end_hour)}</span>}
                {p.work_location_name && (
                  <span style={{ color: sc.text }}>· {p.work_location_name}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </SidePanel>
  )
}
