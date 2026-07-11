import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import {
  ModalOverlay, formatDate, toastErr, toastOk,
} from '../shared.jsx'
import { buildPayrollClosingCheck, buildStaffGrid, daysInMonth } from '../logic/schedule.js'

function patternLabel(pattern, shiftDefs) {
  return pattern.map(item => {
    if (item.shift_def_id == null) return 'OFF'
    return shiftDefs.find(s => s.id === item.shift_def_id)?.name || `#${item.shift_def_id}`
  }).join(' / ')
}

function monthEnd(month) {
  return daysInMonth(month).at(-1) || `${month}-01`
}

export function ScheduleTemplateModal({ onClose, departments, shiftDefs, allStaff, weekStart, deptFilter }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    template_id: '',
    dept_id: deptFilter || '',
    staff_ids: [],
    start_date: weekStart,
    weeks: '4',
    stagger: true,
  })
  const [preview, setPreview] = useState(null)

  const { data: templates = [] } = useQuery({
    queryKey: ['rotation-templates'],
    queryFn: () => api.get('/shifts/rotation-templates').then(r => r.data),
  })

  const filteredStaff = useMemo(
    () => allStaff.filter(s => !form.dept_id || String(s.department_id) === String(form.dept_id)),
    [allStaff, form.dept_id]
  )

  const presets = useMemo(() => {
    const first = shiftDefs[0]?.id
    const second = shiftDefs[1]?.id || first
    const night = shiftDefs[2]?.id || second
    if (!first) return []
    return [
      {
        name: '6 gun gunduz + pazar OFF',
        pattern: [...Array.from({ length: 6 }, () => ({ shift_def_id: first })), { shift_def_id: null }],
      },
      {
        name: '2 gunduz 2 gece 2 OFF',
        pattern: [{ shift_def_id: first }, { shift_def_id: first }, { shift_def_id: night }, { shift_def_id: night }, { shift_def_id: null }, { shift_def_id: null }],
      },
      {
        name: 'Departman sabit vardiya + OFF',
        pattern: [...Array.from({ length: 6 }, () => ({ shift_def_id: first })), { shift_def_id: null }],
      },
    ]
  }, [shiftDefs])

  const createTpl = useMutation({
    mutationFn: preset => api.post('/shifts/rotation-templates', preset),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['rotation-templates'] })
      if (res?.data?.id) setForm(prev => ({ ...prev, template_id: String(res.data.id) }))
      toastOk('Sablon kaydedildi')
    },
    onError: toastErr,
  })

  const previewMut = useMutation({
    mutationFn: payload => api.post('/shifts/rotation-templates/preview', payload).then(r => r.data),
    onSuccess: setPreview,
    onError: toastErr,
  })

  const applyMut = useMutation({
    mutationFn: payload => api.post('/shifts/rotation-templates/apply', payload).then(r => r.data),
    onSuccess: res => {
      toastOk(`${res.count} vardiya girisi yazildi`)
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['puantaj'] })
      qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
      onClose()
    },
    onError: toastErr,
  })

  const updateForm = patch => {
    setForm(prev => ({ ...prev, ...patch }))
    setPreview(null)
  }

  const payload = () => ({
    template_id: parseInt(form.template_id),
    staff_ids: form.staff_ids,
    start_date: form.start_date,
    weeks: parseInt(form.weeks) || 1,
    stagger: form.stagger,
  })

  const canPreview = form.template_id && form.staff_ids.length > 0 && form.start_date
  const selectedTemplate = templates.find(t => String(t.id) === String(form.template_id))

  const applyPreview = async () => {
    const warnCount = preview?.warnings?.length || 0
    if (warnCount > 0) {
      const ok = await confirmDialog({
        title: 'Uyarilara Ragmen Uygula',
        body: `${warnCount} kural uyarisi var. Yine de uygulanacak mi?`,
        danger: true,
      })
      if (!ok) return
    }
    applyMut.mutate(payload())
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: 6 }}>VARDIYA SABLONU UYGULA</h3>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 14 }}>
        Hazir sablonu kaydet, personeli sec, once onizle sonra tek tikla cizelgeye uygula.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        {presets.map(preset => (
          <button
            key={preset.name}
            className="btn btn-ghost"
            disabled={createTpl.isPending}
            onClick={() => createTpl.mutate(preset)}
            style={{ textAlign: 'left', borderRadius: 10, padding: 10 }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', fontWeight: 700 }}>{preset.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{patternLabel(preset.pattern, shiftDefs)}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div>
          <label className="form-label">Sablon</label>
          <select className="form-select" value={form.template_id} onChange={e => updateForm({ template_id: e.target.value })}>
            <option value="">Sec...</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Bolum</label>
          <select className="form-select" value={form.dept_id} onChange={e => updateForm({ dept_id: e.target.value, staff_ids: [] })}>
            <option value="">Tum bolumler</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Baslangic</label>
          <input type="date" className="form-input" value={form.start_date} onChange={e => updateForm({ start_date: e.target.value })} />
        </div>
        <div>
          <label className="form-label">Hafta</label>
          <input type="number" min="1" max="8" className="form-input" value={form.weeks} onChange={e => updateForm({ weeks: e.target.value })} />
        </div>
      </div>

      {selectedTemplate && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)' }}>
          {patternLabel(selectedTemplate.pattern || [], shiftDefs)}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label className="form-label" style={{ margin: 0 }}>Personel ({form.staff_ids.length})</label>
          <button className="btn btn-ghost btn-sm" onClick={() => updateForm({ staff_ids: form.staff_ids.length === filteredStaff.length ? [] : filteredStaff.map(s => s.id) })}>
            {form.staff_ids.length === filteredStaff.length && filteredStaff.length > 0 ? 'Secimi temizle' : 'Tumunu sec'}
          </button>
        </div>
        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 4 }}>
          {filteredStaff.map(staff => (
            <label key={staff.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.staff_ids.includes(staff.id)}
                onChange={e => updateForm({ staff_ids: e.target.checked ? [...form.staff_ids, staff.id] : form.staff_ids.filter(id => id !== staff.id) })}
              />
              {staff.full_name}
            </label>
          ))}
          {filteredStaff.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Personel yok</span>}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.stagger} onChange={e => updateForm({ stagger: e.target.checked })} />
        Kaydirmali baslat
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" disabled={!canPreview || previewMut.isPending} onClick={() => previewMut.mutate(payload())}>
          {previewMut.isPending ? 'Hesaplaniyor...' : 'Onizle'}
        </button>
        <button className="btn btn-primary" disabled={!preview || applyMut.isPending} onClick={applyPreview}>
          {applyMut.isPending ? 'Uygulaniyor...' : preview ? `Uygula (${preview.total_entries})` : 'Uygula'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Kapat</button>
      </div>

      {preview && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
              {preview.days} gun · {preview.end_date} bitis · {preview.total_entries} giris
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {preview.per_staff?.map(staff => (
                <span key={staff.staff_id} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 7px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {staff.name}: {staff.scheduled} is / {staff.off} OFF
                </span>
              ))}
            </div>
          </div>
          {preview.warnings?.length > 0 && (
            <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(231,76,60,.35)', background: 'rgba(231,76,60,.08)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginBottom: 5 }}>{preview.warnings.length} kural uyarisi</div>
              {preview.warnings.slice(0, 6).map((warning, idx) => <div key={idx} style={{ fontSize: 11, color: 'var(--text2)' }}>{warning.message}</div>)}
            </div>
          )}
        </div>
      )}
    </ModalOverlay>
  )
}

function issueItemText(issue, item) {
  if (issue.type === 'coverage') return `${item.date} · ${item.dept}: ${item.count}/${item.required}`
  if (issue.type === 'pending_leave') return `${item.full_name || item.staff_id}: ${formatDate(item.start_date)}-${formatDate(item.end_date)}`
  if (issue.type === 'absent') return `${item.name}: ${formatDate(item.date)}`
  if (issue.type === 'off_missing') return `${item.name}: ${item.count} hafta`
  if (issue.type === 'empty') return `${item.name}: ${item.count} bos gun`
  if (issue.type === 'overtime') return `${item.full_name || item.staff_id}: ${formatDate(item.work_date)} · ${item.hours}s`
  return item.name || item.full_name || String(item.id || '')
}

export function PayrollClosingModal({ onClose, allStaff, deptFilter, coverageMin, defaultMonth }) {
  const [month, setMonth] = useState(defaultMonth)
  const periodDays = useMemo(() => daysInMonth(month), [month])
  const periodEnd = periodDays.at(-1) || monthEnd(month)

  const { data: rows = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['schedule-closing', month, deptFilter],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: `${month}-01`, week_end: periodEnd, dept_id: deptFilter || undefined },
    }).then(r => r.data),
    enabled: !!month,
  })
  const { data: overtimeRecords = [] } = useQuery({
    queryKey: ['overtime-closing', month, deptFilter],
    queryFn: () => api.get('/shifts/overtime', { params: { month, dept_id: deptFilter || undefined } }).then(r => r.data),
    enabled: !!month,
  })
  const { data: pendingLeaves = [] } = useQuery({
    queryKey: ['leave-closing', month, deptFilter],
    queryFn: () => api.get('/shifts/leave', { params: { status: 'pending', dept_id: deptFilter || undefined } }).then(r => r.data),
    enabled: !!month,
  })
  const { data: periodLocks = [] } = useQuery({
    queryKey: ['period-locks'],
    queryFn: () => api.get('/shifts/period-locks').then(r => r.data),
  })

  const grid = useMemo(() => buildStaffGrid(rows, allStaff, deptFilter), [rows, allStaff, deptFilter])
  const check = useMemo(
    () => buildPayrollClosingCheck(grid, periodDays, { overtimeRecords, pendingLeaves, coverageMin }),
    [grid, periodDays, overtimeRecords, pendingLeaves, coverageMin]
  )
  const locked = periodLocks.find(lock => lock.period === month)
  const summaryCards = [
    ['Personel', check.totals.staff, 'var(--blue)'],
    ['Bos', check.totals.empty, check.totals.empty ? 'var(--red)' : 'var(--green)'],
    ['OFF eksik', check.totals.offMissing, check.totals.offMissing ? 'var(--accent)' : 'var(--green)'],
    ['YOK', check.totals.absent, check.totals.absent ? 'var(--red)' : 'var(--green)'],
    ['Onaysiz izin', check.totals.pendingLeave, check.totals.pendingLeave ? 'var(--red)' : 'var(--green)'],
    ['Mesai', `${check.totals.overtimeHours}s`, 'var(--purple)'],
  ]

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: 6 }}>PUANTAJ KAPANIS KONTROLU</h3>
      <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
        Ay kapanmadan once bos gun, OFF eksigi, devamsizlik, onaysiz izin ve mesai kayitlarini kontrol eder.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 150 }} />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, padding: '6px 10px', borderRadius: 999,
          background: check.ok ? 'rgba(46,204,113,.12)' : 'rgba(231,76,60,.10)',
          color: check.ok ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${check.ok ? 'rgba(46,204,113,.35)' : 'rgba(231,76,60,.35)'}`,
        }}>
          {check.ok ? 'Kapanisa hazir' : 'Kontrol gerekiyor'}
        </span>
        {locked && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>Kilitli: {locked.locked_by_name || 'mudur'}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
        {summaryCards.map(([label, value, color]) => (
          <div key={label} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 5 }}>{label}</div>
          </div>
        ))}
      </div>

      {scheduleLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Kontrol hazirlaniyor...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {check.issues.map(issue => {
            const sc = issue.severity === 'high'
              ? { bg: 'rgba(231,76,60,.08)', border: 'rgba(231,76,60,.35)', text: 'var(--red)' }
              : issue.severity === 'medium'
              ? { bg: 'rgba(240,165,0,.10)', border: 'rgba(240,165,0,.35)', text: 'var(--accent)' }
              : { bg: 'var(--surface2)', border: 'var(--border)', text: 'var(--text3)' }
            return (
              <div key={issue.type} style={{ border: `1px solid ${sc.border}`, background: sc.bg, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: sc.text, fontWeight: 700 }}>{issue.title}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: sc.text }}>{issue.count}</span>
                </div>
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text2)' }}>{issue.message}</div>
                {issue.items?.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4, padding: '0 10px 10px' }}>
                    {issue.items.slice(0, 8).map((item, idx) => (
                      <span key={idx} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px' }}>
                        {issueItemText(issue, item)}
                      </span>
                    ))}
                    {issue.items.length > 8 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', padding: '4px 6px' }}>+{issue.items.length - 8} kayit</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose}>Kapat</button>
      </div>
    </ModalOverlay>
  )
}
