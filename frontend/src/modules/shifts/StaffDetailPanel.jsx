import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import {
  toastErr, BLOOD_TYPES, LEAVE_TYPES, STATUS_MAP,
  calcAge, shiftColor, deptColor, BottomSheet, formatShiftHours, leaveTypeLabel,
} from './shared.jsx'
import { buildStaffRecentSummary } from './logic/schedule.js'

// ─── Staff Detail Panel (Bottom Sheet) ────────────────────────────────────────
export default function StaffDetailPanel({ staffId, onClose }) {
  const qc = useQueryClient()
  const [activeForm, setActiveForm] = useState(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [shiftPage, setShiftPage] = useState(30)
  const [shiftFilter, setShiftFilter] = useState('')
  const [formData, setFormData] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['staff-detail', staffId],
    queryFn: () => api.get(`/shifts/staff/${staffId}/detail`).then(r => r.data),
    enabled: !!staffId,
    staleTime: 60000,
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })

  const assignShiftMut = useMutation({
    mutationFn: d => api.post('/shifts/schedule', { entries: [{ staff_id: staffId, dept_id: d.dept_id, shift_def_id: d.shift_def_id || null, work_date: d.work_date, status: 'scheduled' }] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['schedule'] }); setActiveForm(null); setFormData({}) },
    onError: toastErr,
  })

  const addLeaveMut = useMutation({
    mutationFn: d => api.post('/shifts/leave', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-detail', staffId] })
      qc.invalidateQueries({ queryKey: ['leave-balance', staffId] })
      setActiveForm(null); setFormData({})
    },
    onError: toastErr,
  })

  // E1 — izin bakiyesi (yıllık hak / kullanılan / kalan)
  const { data: leaveBalance } = useQuery({
    queryKey: ['leave-balance', staffId],
    queryFn: () => api.get(`/shifts/leave/balance/${staffId}`).then(r => r.data),
    enabled: !!staffId && (activeForm === 'leave' || detailTab === 'leave'),
  })

  const addOvertimeMut = useMutation({
    mutationFn: d => api.post('/shifts/overtime', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null); setFormData({}) },
    onError: toastErr,
  })

  const updateStaffMut = useMutation({
    mutationFn: d => api.put(`/shifts/staff/${staffId}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['staff-list'] }); setActiveForm(null); setFormData({}) },
    onError: toastErr,
  })

  // Esc: önce formu kapat, yoksa sheet'i
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        if (activeForm) setActiveForm(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [activeForm, onClose])

  // Reset tabs when staffId changes
  useEffect(() => {
    setDetailTab('overview')
    setActiveForm(null)
  }, [staffId])

  const person = data?.person
  const stats = data?.stats || { totalShifts: 0, workedShifts: 0, totalOvertime: 0, totalLeave: 0, absentCount: 0 }
  const shiftHistory = data?.shiftHistory || []
  const leaveHistory = data?.leaveHistory || []
  const overtimeRecords = data?.overtimeRecords || []
  const recentSummary = buildStaffRecentSummary(shiftHistory, overtimeRecords, { days: 30 })

  const dept = deptColor(person?.dept_color)
  const deptBg = person ? dept.bg : 'var(--border)'
  const attendRate = stats.totalShifts > 0 ? Math.round((stats.workedShifts / stats.totalShifts) * 100) : 0

  const STAT_ITEMS = [
    { label: 'VARDİYA', value: stats.totalShifts,          color: 'var(--blue)' },
    { label: 'ÇALIŞTI', value: stats.workedShifts,         color: 'var(--green)', showBar: true },
    { label: 'MESAİ',   value: `${stats.totalOvertime}s`,  color: 'var(--accent)' },
    { label: 'İZİN',    value: `${stats.totalLeave}g`,     color: 'var(--purple)' },
    { label: 'OFF',     value: `${stats.offCount ?? 0}g`,  color: 'var(--teal)' },
    { label: 'YOK',     value: stats.absentCount,          color: 'var(--red)' },
  ]

  const openForm = (key) => {
    if (key === 'edit' && person) {
      setFormData({
        full_name: person.full_name || '', tc_no: person.tc_no || '',
        phone: person.phone || '', email: person.email || '',
        position: person.position || '', department_id: person.department_id?.toString() || '',
        hire_date: person.hire_date || '', birth_date: person.birth_date || '',
        address: person.address || '', emergency_contact: person.emergency_contact || '',
        emergency_phone: person.emergency_phone || '', blood_type: person.blood_type || '',
        gender: person.gender || 'male', salary: person.salary?.toString() || '',
        notes: person.notes || '',
      })
    } else {
      setFormData({})
    }
    setActiveForm(key)
  }

  return (
    <BottomSheet onClose={onClose}>
      {/* Dept color band */}
      <div style={{ height: 4, background: deptBg, flexShrink: 0, marginTop: -2 }} />

      {/* Header */}
      <div style={{ padding: '14px 24px 0', background: 'var(--surface)', flexShrink: 0 }}>
        {isLoading ? (
          <SkeletonTable rows={3} cols={3} />
        ) : !person ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Veri bulunamadı</div>
        ) : (
          <>
            {/* Avatar + identity + actions */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              {/* Left: avatar + identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 200 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: person.gender === 'female' ? 'rgba(244,114,182,0.15)' : 'rgba(59,130,246,0.15)',
                  border: `2px solid ${dept.text}`,
                  color: person.gender === 'female' ? '#f472b6' : 'var(--blue)',
                  fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700,
                }}>
                  {person.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '1px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {person.full_name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {person.position || 'Pozisyon yok'} · #{person.id}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                    {person.dept_name && <span className="badge badge-blue" style={{ fontSize: 8, padding: '1px 6px' }}>{person.dept_name}</span>}
                    {person.blood_type && <span className="badge badge-red" style={{ fontSize: 8, padding: '1px 6px' }}>{person.blood_type}</span>}
                    <span className={`badge ${person.is_active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 8, padding: '1px 6px' }}>
                      {person.is_active ? 'AKTİF' : 'PASİF'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: action buttons */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <a href={`/personnel/${staffId}`} target="_blank" rel="noopener"
                  className="btn btn-primary btn-xs"
                  style={{ borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.5px', textDecoration: 'none' }}>
                  🔍 360°
                </a>
                {[
                  { key: 'edit',     label: '✎ Düzenle' },
                  { key: 'shift',    label: '+ Vardiya' },
                  { key: 'leave',    label: '+ İzin' },
                  { key: 'overtime', label: '+ Mesai' },
                ].map(a => (
                  <button key={a.key} onClick={() => openForm(a.key)}
                    className="btn btn-ghost btn-xs"
                    style={{ borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.5px' }}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 14 }}>
              {STAT_ITEMS.map(s => (
                <div key={s.label} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 4px', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px', marginTop: 3 }}>{s.label}</div>
                  {s.showBar && stats.totalShifts > 0 && (
                    <div style={{ margin: '5px 6px 0', height: 3, borderRadius: 2, background: 'var(--border)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'var(--green)', width: `${attendRate}%`, transition: 'width .4s ease' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Tab bar ── */}
      {!isLoading && person && (
        <>
          <div style={{
            display: 'flex', overflowX: 'auto', flexShrink: 0,
            borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
            marginTop: 14, background: 'var(--surface)',
          }}>
            {[
              { id: 'overview', icon: '◈', label: 'ÖZET' },
              { id: 'info',     icon: '👤', label: 'BİLGİ' },
              { id: 'shifts',   icon: '📅', label: 'VARDİYA' },
              { id: 'leave',    icon: '🏖️', label: 'İZİN' },
              { id: 'overtime', icon: '⏰', label: 'MESAİ' },
            ].map(t => (
              <button key={t.id} onClick={() => setDetailTab(t.id)} style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: detailTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: detailTab === t.id ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '1px',
                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}>
                <span style={{ fontSize: 13 }}>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* ── Scrollable content area ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', position: 'relative' }}>

            {/* ActionForm overlay */}
            {activeForm && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                background: 'var(--bg)', padding: '20px 24px',
                overflowY: 'auto',
                animation: 'fadeIn .15s ease',
              }}>
                {/* Form header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: '2px' }}>
                    {activeForm === 'edit' ? '✎ DÜZENLE' : activeForm === 'shift' ? '+ VARDİYA' : activeForm === 'leave' ? '+ İZİN' : '+ MESAİ'}
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setActiveForm(null); setFormData({}) }} style={{ borderRadius: 8 }}>✕ İptal</button>
                </div>

                {/* Düzenle formu */}
                {activeForm === 'edit' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { key: 'full_name', label: 'Ad Soyad', type: 'text' },
                      { key: 'tc_no', label: 'TC No', type: 'text' },
                      { key: 'phone', label: 'Telefon', type: 'text' },
                      { key: 'email', label: 'E-posta', type: 'email' },
                      { key: 'position', label: 'Pozisyon', type: 'text' },
                      { key: 'hire_date', label: 'İşe Giriş', type: 'date' },
                      { key: 'birth_date', label: 'Doğum Tarihi', type: 'date' },
                      { key: 'salary', label: 'Maaş (₺)', type: 'number' },
                      { key: 'emergency_contact', label: 'Acil Kişi', type: 'text' },
                      { key: 'emergency_phone', label: 'Acil Tel', type: 'text' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>{f.label}</label>
                        <input className="form-input" type={f.type} value={formData[f.key] || ''}
                          onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: '100%', borderRadius: 8 }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>CİNSİYET</label>
                      <select className="form-input" value={formData.gender || ''} onChange={e => setFormData(p => ({ ...p, gender: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
                        <option value="male">Erkek</option>
                        <option value="female">Kadın</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>KAN GRUBU</label>
                      <select className="form-input" value={formData.blood_type || ''} onChange={e => setFormData(p => ({ ...p, blood_type: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
                        <option value="">—</option>
                        {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>ADRES</label>
                      <textarea className="form-input" value={formData.address || ''} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
                    </div>
                    <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button className="btn btn-primary" onClick={() => updateStaffMut.mutate({ ...formData, department_id: formData.department_id ? parseInt(formData.department_id) : null, salary: formData.salary ? parseFloat(formData.salary) : null })} disabled={!formData.full_name || updateStaffMut.isPending} style={{ borderRadius: 10 }}>
                        {updateStaffMut.isPending ? '...' : 'Kaydet'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Vardiya formu */}
                {activeForm === 'shift' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>TARİH</label>
                      <input className="form-input" type="date" value={formData.work_date || ''} onChange={e => setFormData(p => ({ ...p, work_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>VARDİYA</label>
                      <select className="form-input" value={formData.shift_def_id || ''} onChange={e => setFormData(p => ({ ...p, shift_def_id: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
                        <option value="">Vardiyasız (İzin/Yok)</option>
                        {shiftDefs.map(d => <option key={d.id} value={d.id}>{d.name} ({formatShiftHours(d.start_hour, d.end_hour)})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>DEPARTMAN</label>
                      <select className="form-input" value={formData.dept_id || ''} onChange={e => setFormData(p => ({ ...p, dept_id: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
                        <option value="">Varsayılan</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary" onClick={() => assignShiftMut.mutate({ ...formData, dept_id: formData.dept_id ? parseInt(formData.dept_id) : (person?.department_id || null), shift_def_id: formData.shift_def_id ? parseInt(formData.shift_def_id) : null })} disabled={!formData.work_date || assignShiftMut.isPending} style={{ borderRadius: 10 }}>
                      {assignShiftMut.isPending ? '...' : 'Vardiya Ata'}
                    </button>
                  </div>
                )}

                {/* İzin formu */}
                {activeForm === 'leave' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {leaveBalance && (
                      <div style={{
                        display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 8,
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        fontFamily: 'var(--mono)', fontSize: 10,
                      }}>
                        <span style={{ color: 'var(--text3)' }}>🌴 {leaveBalance.year} yıllık:</span>
                        <span style={{ color: 'var(--blue)' }}>{leaveBalance.annual_total}g hak</span>
                        <span style={{ color: 'var(--amber)' }}>{leaveBalance.annual_used}g kullanıldı</span>
                        <span style={{ color: (leaveBalance.annual_total - leaveBalance.annual_used) > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                          {leaveBalance.annual_total - leaveBalance.annual_used}g kaldı
                        </span>
                      </div>
                    )}
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>İZİN TİPİ</label>
                      <select className="form-input" value={formData.leave_type || ''} onChange={e => setFormData(p => ({ ...p, leave_type: e.target.value }))} style={{ width: '100%', borderRadius: 8 }}>
                        <option value="">Seçin</option>
                        {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>BAŞLANGIÇ</label>
                        <input className="form-input" type="date" value={formData.start_date || ''} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
                      </div>
                      <div>
                        <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>BİTİŞ</label>
                        <input className="form-input" type="date" value={formData.end_date || ''} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>AÇIKLAMA</label>
                      <textarea className="form-input" value={formData.reason || ''} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
                    </div>
                    <button className="btn btn-primary" onClick={() => addLeaveMut.mutate({ staff_id: staffId, leave_type: formData.leave_type, start_date: formData.start_date, end_date: formData.end_date, reason: formData.reason || null })} disabled={!formData.leave_type || !formData.start_date || !formData.end_date || addLeaveMut.isPending} style={{ borderRadius: 10 }}>
                      {addLeaveMut.isPending ? '...' : 'İzin Ekle'}
                    </button>
                  </div>
                )}

                {/* Mesai formu */}
                {activeForm === 'overtime' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>TARİH</label>
                      <input className="form-input" type="date" value={formData.work_date || ''} onChange={e => setFormData(p => ({ ...p, work_date: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>SAAT MİKTARI</label>
                      <input className="form-input" type="number" min="0.5" max="12" step="0.5" value={formData.hours || ''} onChange={e => setFormData(p => ({ ...p, hours: e.target.value }))} style={{ width: '100%', borderRadius: 8 }} />
                    </div>
                    <div>
                      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: 4 }}>NEDEN</label>
                      <textarea className="form-input" value={formData.reason || ''} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ width: '100%', borderRadius: 8, resize: 'vertical' }} />
                    </div>
                    <button className="btn btn-primary" onClick={() => addOvertimeMut.mutate({ staff_id: staffId, work_date: formData.work_date, hours: parseFloat(formData.hours), reason: formData.reason || null })} disabled={!formData.work_date || !formData.hours || addOvertimeMut.isPending} style={{ borderRadius: 10 }}>
                      {addOvertimeMut.isPending ? '...' : 'Mesai Ekle'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ÖZET — Activity Timeline */}
            {!activeForm && detailTab === 'overview' && (() => {
              const events = [
                ...shiftHistory.map(s => ({
                  date: s.work_date,
                  type: 'shift',
                  color: s.status === 'off' ? 'var(--purple)' : s.status === 'on_leave' ? 'var(--teal)' : 'var(--blue)',
                  icon: s.status === 'off' ? '🌙' : s.status === 'on_leave' ? '🏖️' : '📅',
                  label: s.shift_name
                    ? `${s.shift_name} · ${formatShiftHours(s.start_hour, s.end_hour)}`
                    : s.status === 'off' ? 'Haftalık izin (OFF)'
                    : s.status === 'on_leave' ? `İzin · ${leaveTypeLabel(s.leave_type)}`
                    : 'Vardiya',
                  sub: s.status === 'worked' ? 'Çalıştı' : s.status === 'absent' ? 'Gelmedi'
                    : s.status === 'on_leave' ? `İzinli · ${leaveTypeLabel(s.leave_type)}`
                    : s.status === 'off' ? 'Haftalık izin' : 'Planlandı',
                })),
                ...leaveHistory.map(l => ({
                  date: l.start_date,
                  type: 'leave',
                  color: 'var(--purple)',
                  icon: '🏖️',
                  label: `${leaveTypeLabel(l.leave_type)} · ${l.total_days} gün`,
                  sub: STATUS_MAP[l.status]?.label || l.status,
                })),
                ...overtimeRecords.map(o => ({
                  date: o.work_date,
                  type: 'overtime',
                  color: 'var(--accent)',
                  icon: '⏰',
                  label: `${o.hours} saat mesai`,
                  sub: o.reason || '',
                })),
              ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20)

              const summaryCards = [
                ['Calisma', recentSummary.workDays, 'var(--green)'],
                ['OFF', recentSummary.offDays, 'var(--teal)'],
                ['Izin', recentSummary.leaveDays, 'var(--purple)'],
                ['YOK', recentSummary.absentDays, 'var(--red)'],
                ['Mesai', `${recentSummary.overtimeHours}s`, 'var(--accent)'],
                ['Ardisik', recentSummary.currentConsecutive, 'var(--blue)'],
              ]
              const dayColor = { work: 'var(--green)', off: 'var(--teal)', leave: 'var(--purple)', absent: 'var(--red)', empty: 'var(--border)' }

              return events.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Kayıt yok</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)', padding: 12, marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: '1.5px', color: 'var(--text)' }}>SON 30 GUN</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                          {recentSummary.startDate} - {recentSummary.endDate} · max ardisik {recentSummary.maxConsecutive}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
                      {summaryCards.map(([label, value, color]) => (
                        <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '8px 4px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1, color }}>{value}</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 4 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${recentSummary.timeline.length || 1}, minmax(4px, 1fr))`, gap: 2 }}>
                      {recentSummary.timeline.map(day => (
                        <span key={day.date} title={`${day.date} ${day.kind}`} style={{
                          height: 16,
                          borderRadius: 4,
                          background: dayColor[day.kind],
                          opacity: day.kind === 'empty' ? .35 : .9,
                        }} />
                      ))}
                    </div>
                  </div>
                  {events.map((e, i) => (
                    <div key={`${e.type}-${e.date}-${e.label}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--surface2)' : 'transparent' }}>
                      <div style={{ width: 4, height: 32, borderRadius: 2, background: e.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 70 }}>
                        {new Date(e.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                      </span>
                      <span style={{ fontSize: 14 }}>{e.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</div>
                        {e.sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{e.sub}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* BİLGİ — Info Grid */}
            {!activeForm && detailTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: '🪪', label: 'TC NO',      value: person.tc_no },
                  { icon: '📞', label: 'TELEFON',     value: person.phone },
                  { icon: '✉️', label: 'E-POSTA',     value: person.email },
                  { icon: '🩸', label: 'KAN GRUBU',   value: person.blood_type },
                  { icon: '🎂', label: 'DOĞUM',       value: person.birth_date ? `${new Date(person.birth_date).toLocaleDateString('tr-TR')} (${calcAge(person.birth_date)} yaş)` : null },
                  { icon: '📋', label: 'İŞE GİRİŞ',  value: person.hire_date ? new Date(person.hire_date).toLocaleDateString('tr-TR') : null },
                  { icon: '🚨', label: 'ACİL KİŞİ',  value: person.emergency_contact },
                  { icon: '📱', label: 'ACİL TEL',    value: person.emergency_phone },
                  { icon: '💰', label: 'MAAŞ',        value: person.salary ? `${Number(person.salary).toLocaleString('tr-TR')} ₺` : null },
                  { icon: '👤', label: 'CİNSİYET',    value: person.gender === 'male' ? 'Erkek' : person.gender === 'female' ? 'Kadın' : null },
                  { icon: '📍', label: 'ADRES',       value: person.address, full: true },
                ].map(f => (
                  <div key={f.label} style={f.full ? { gridColumn: '1/-1' } : undefined}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>{f.icon}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px' }}>{f.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: f.value ? 'var(--text)' : 'var(--text4)', paddingLeft: 18 }}>{f.value || '—'}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>📝</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: '1px' }}>NOTLAR</span>
                  </div>
                  <div style={{ fontSize: 12, color: person.notes ? 'var(--text)' : 'var(--text4)', paddingLeft: 18 }}>{person.notes || '—'}</div>
                </div>
              </div>
            )}

            {/* VARDİYA */}
            {!activeForm && detailTab === 'shifts' && (() => {
              const filtered = shiftFilter ? shiftHistory.filter(s => s.status === shiftFilter) : shiftHistory
              const visible = filtered.slice(0, shiftPage)
              const STATUS_C = { worked: 'var(--green)', scheduled: 'var(--blue)', on_leave: 'var(--purple)', off: 'var(--teal)', absent: 'var(--red)', overtime: 'var(--accent)' }
              const STATUS_L = { worked: 'Çalıştı', scheduled: 'Planlandı', on_leave: 'İzinli', off: 'Haftalık izin', absent: 'Gelmedi', overtime: 'Mesai' }
              return (
                <div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[['', 'TÜM'], ['worked','ÇALIŞTI'], ['scheduled','PLANLI'], ['on_leave','İZİNLİ'], ['off','OFF'], ['absent','YOK']].map(([k, l]) => (
                      <button key={k} onClick={() => { setShiftFilter(k); setShiftPage(30) }}
                        className={`btn btn-xs ${shiftFilter === k ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 9 }}>{l}</button>
                    ))}
                  </div>
                  {visible.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Kayıt yok</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {visible.map((s, i) => {
                        const sc = shiftColor(s.shift_color)
                        return (
                          <div key={s.id || `${s.work_date}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: i % 2 === 0 ? 'var(--surface2)' : 'transparent' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 80 }}>
                              {new Date(s.work_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}
                            </span>
                            {s.shift_name && (
                              <span style={{ padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.text, fontSize: 9, fontWeight: 600 }}>{s.shift_name}</span>
                            )}
                            {s.start_hour != null && (
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{formatShiftHours(s.start_hour, s.end_hour)}</span>
                            )}
                            {s.status === 'on_leave' && (
                              <span style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(26,188,156,.15)', color: 'var(--teal)', fontSize: 9, fontWeight: 600 }}>
                                🏖 {leaveTypeLabel(s.leave_type)}
                              </span>
                            )}
                            {s.status === 'off' && (
                              <span style={{ padding: '2px 8px', borderRadius: 8, background: 'rgba(167,139,250,.15)', color: 'var(--purple)', fontSize: 9, fontWeight: 600 }}>
                                🌙 Haftalık izin
                              </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 600, color: STATUS_C[s.status] || 'var(--text3)' }}>{STATUS_L[s.status] || s.status}</span>
                          </div>
                        )
                      })}
                      {filtered.length > shiftPage && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setShiftPage(p => p + 30)}
                          style={{ marginTop: 8, borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 9 }}>
                          Daha fazla göster ({filtered.length - shiftPage} kaldı)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* İZİN */}
            {!activeForm && detailTab === 'leave' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaveBalance && (
                  <div style={{
                    display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 8,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    fontFamily: 'var(--mono)', fontSize: 10,
                  }}>
                    <span style={{ color: 'var(--text3)' }}>🌴 {leaveBalance.year} yıllık:</span>
                    <span style={{ color: 'var(--blue)' }}>{leaveBalance.annual_total}g hak</span>
                    <span style={{ color: 'var(--amber)' }}>{leaveBalance.annual_used}g kullanıldı</span>
                    <span style={{ color: (leaveBalance.annual_total - leaveBalance.annual_used) > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {leaveBalance.annual_total - leaveBalance.annual_used}g kaldı
                    </span>
                  </div>
                )}
                {leaveHistory.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>İzin kaydı yok</div>
                ) : leaveHistory.map((l, i) => {
                  const bandColor = l.status === 'approved' ? 'var(--green)' : l.status === 'rejected' ? 'var(--red)' : 'var(--accent)'
                  return (
                    <div key={`leave-${l.id || i}`} style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      <div style={{ width: 4, background: bandColor, flexShrink: 0 }} />
                      <div style={{ padding: '10px 14px', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`} style={{ fontSize: 8 }}>{leaveTypeLabel(l.leave_type)}</span>
                          <span className={`badge ${STATUS_MAP[l.status]?.badge || 'badge-gray'}`} style={{ fontSize: 8 }}>{STATUS_MAP[l.status]?.label || l.status}</span>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                          {new Date(l.start_date).toLocaleDateString('tr-TR')} → {new Date(l.end_date).toLocaleDateString('tr-TR')}
                          <span style={{ marginLeft: 10, color: 'var(--accent)', fontWeight: 700 }}>{l.total_days} gün</span>
                        </div>
                        {l.reason && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{l.reason}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* MESAİ */}
            {!activeForm && detailTab === 'overtime' && (
              <div>
                {overtimeRecords.length > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(155,89,182,.12)', border: '1px solid rgba(155,89,182,.2)', marginBottom: 12 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TOPLAM</span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--purple)', fontWeight: 700 }}>
                      {overtimeRecords.reduce((sum, o) => sum + (o.hours || 0), 0)}s
                    </span>
                  </div>
                )}
                {overtimeRecords.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Mesai kaydı yok</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {overtimeRecords.map((o, i) => (
                      <div key={`ot-${o.id || i}`} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                        background: i % 2 === 0 ? 'var(--surface2)' : 'transparent',
                        transition: 'background .15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface2)' : 'transparent'}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 70 }}>
                          {new Date(o.work_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </span>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--purple)', minWidth: 40 }}>{o.hours}s</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.reason || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </>
      )}
    </BottomSheet>
  )
}
