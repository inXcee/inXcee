import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAVE_TYPES = {
  annual:      { label: 'Yillik',     badge: 'badge-blue' },
  sick:        { label: 'Hastalik',   badge: 'badge-red' },
  emergency:   { label: 'Acil',       badge: 'badge-amber' },
  maternity:   { label: 'Dogum',      badge: 'badge-red' },
  paternity:   { label: 'Babalik',    badge: 'badge-blue' },
  marriage:    { label: 'Evlilik',    badge: 'badge-amber' },
  bereavement: { label: 'Olum',       badge: 'badge-gray' },
}

const STATUS_MAP = {
  pending:  { label: 'Bekliyor',    badge: 'badge-amber' },
  approved: { label: 'Onayli',      badge: 'badge-green' },
  rejected: { label: 'Reddedildi',  badge: 'badge-red' },
}

const SWAP_STATUS = {
  pending:  { label: 'Bekliyor',  badge: 'badge-amber' },
  approved: { label: 'Onaylandi', badge: 'badge-green' },
  rejected: { label: 'Reddedildi', badge: 'badge-red' },
}

const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','0+','0-']

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function shortDay(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function calcAge(birthDate) {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

// ─── Side Panel (fixed right drawer — positioned near click, stays while scrolling) ──
function SidePanel({ title, subtitle, icon, onClose, children, width = 340, anchorRect }) {
  const panelRef = useRef(null)
  const [topPos, setTopPos] = useState(null) // null = measuring phase (invisible)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const panelHeight = panel.offsetHeight
    const vh = window.innerHeight

    // Start at anchor's top, or vertically centered if no anchor
    let top = anchorRect ? anchorRect.top : Math.max(10, (vh - panelHeight) / 2)

    // Bottom overflow → shift up
    if (top + panelHeight > vh - 10) top = vh - panelHeight - 10
    // Top overflow → shift down
    if (top < 10) top = 10

    setTopPos(top)
  }, [anchorRect])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 54,
        background: 'rgba(0,0,0,.3)',
      }} />
      <div ref={panelRef} style={{
        position: 'fixed',
        top: topPos ?? -9999,   // hide while measuring
        right: 0, zIndex: 55,
        width, maxWidth: '92vw',
        maxHeight: '90vh',
        opacity: topPos === null ? 0 : 1,
        background: 'var(--bg)', borderLeft: '2px solid var(--border)',
        borderRadius: '12px 0 0 12px',
        boxShadow: '-6px 0 40px rgba(0,0,0,.35)',
        display: 'flex', flexDirection: 'column',
        animation: topPos !== null ? 'slideInRight .18s ease-out' : 'none',
      }}>
        {/* Header */}
        <div style={{
          flexShrink: 0,
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px',
          borderRadius: '12px 0 0 0',
        }}>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>&#10005;</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--display)', letterSpacing: '2px', fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {icon && <span>{icon}</span>}
              {title}
            </div>
            {subtitle && <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>
        </div>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {children}
        </div>
      </div>
    </>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
function BottomSheet({ onClose, children }) {
  const [visible, setVisible] = useState(false)

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Animate in
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // NOT: Esc listener BURAYA eklenmez — StaffDetailPanel kendi yönetir
  // (çift listener → activeForm açıkken sheet de kapanır, spec ihlali)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 54,
          background: 'rgba(0,0,0,0.6)',
          animation: 'fadeIn .2s ease',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55,
        height: '82vh', maxHeight: '82vh',
        background: 'var(--bg)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,.4)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: visible ? '0.28s cubic-bezier(0.32,0.72,0,1)' : 'none',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        {children}
      </div>
    </>
  )
}

// ─── Shared modal overlay ─────────────────────────────────────────────────────
function ModalOverlay({ children, onClose, wide }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '24px',
          width: '100%',
          maxWidth: wide ? '680px' : '460px',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Inline popover (appears near click position) ────────────────────────────
function InlinePopover({ anchorRect, children, onClose, width = 280 }) {
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)

  // Use layoutEffect to position BEFORE paint — prevents flash at wrong position
  useLayoutEffect(() => {
    setPos(null) // Reset first — prevents flash at old position when anchor changes
    if (!anchorRect) { return }
    // Defer one frame so the popover DOM is measured correctly
    const raf = requestAnimationFrame(() => {
      const pop = popRef.current
      if (!pop) return
      const popH = pop.scrollHeight || pop.offsetHeight || 200
      const popW = pop.scrollWidth || pop.offsetWidth || width
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Try below the anchor first
      let top = anchorRect.bottom + 6
      let left = anchorRect.left + (anchorRect.width || 0) / 2 - popW / 2
      // Flip up if no room below
      if (top + popH > vh - 12) top = Math.max(12, anchorRect.top - popH - 6)
      // Keep inside viewport horizontally
      if (left + popW > vw - 12) left = vw - popW - 12
      if (left < 12) left = 12
      // Keep inside viewport vertically
      if (top < 12) top = 12
      if (top + popH > vh - 12) top = vh - popH - 12
      setPos({ top, left })
    })
    return () => cancelAnimationFrame(raf)
  }, [anchorRect, width])

  useEffect(() => {
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!anchorRect) return null

  return (
    <div ref={popRef} style={{
      position: 'fixed', zIndex: 60,
      top: pos ? pos.top : anchorRect.bottom + 6,
      left: pos ? pos.left : Math.max(12, anchorRect.left),
      width, maxHeight: '70vh', overflowY: 'auto',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '14px',
      boxShadow: '0 8px 32px rgba(0,0,0,.35)',
      animation: 'fadeIn .12s ease-out',
      opacity: pos ? 1 : 0,
    }}>
      {children}
    </div>
  )
}

// ─── StaffSearch component ───────────────────────────────────────────────────
function StaffSearch({ value, onChange, placeholder = 'Personel ara...', onPersonClick }) {
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)

  const { data: results = [] } = useQuery({
    queryKey: ['staff-search', query],
    queryFn: () => api.get('/shifts/staff/search', { params: { q: query } }).then(r => r.data),
    enabled: query.length >= 2,
  })

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (val) => {
    setInputValue(val)
    onChange('')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setQuery(val), 300)
    setOpen(true)
  }

  const select = (person) => {
    onChange(person.id)
    setInputValue(person.full_name)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={inputValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0 && !value) setOpen(true) }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: '0 0 7px 7px', maxHeight: '200px', overflowY: 'auto',
        }}>
          {results.map(p => (
            <div
              key={p.id}
              onClick={e => { select(p); if (onPersonClick) onPersonClick(p.id) }}
              style={{
                padding: '8px 13px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                fontSize: '12.5px', color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: p.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                {p.gender === 'female' ? '\u2640' : '\u2642'}
              </span>
              <span>{p.full_name}</span>
              {p.position && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {p.position}
                </span>
              )}
              {p.dept_name && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginLeft: 'auto' }}>
                  {p.dept_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Staff Detail Panel (Bottom Sheet) ────────────────────────────────────────
function StaffDetailPanel({ staffId, onClose }) {
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['schedule'] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const addLeaveMut = useMutation({
    mutationFn: d => api.post('/shifts/leave', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const addOvertimeMut = useMutation({
    mutationFn: d => api.post('/shifts/overtime', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const updateStaffMut = useMutation({
    mutationFn: d => api.put(`/shifts/staff/${staffId}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['staff-list'] }); setActiveForm(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
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

  const dept = deptColor(person?.dept_color)
  const deptBg = person ? dept.bg : 'var(--border)'
  const attendRate = stats.totalShifts > 0 ? Math.round((stats.workedShifts / stats.totalShifts) * 100) : 0

  const STAT_ITEMS = [
    { label: 'VARDİYA', value: stats.totalShifts,          color: 'var(--blue)' },
    { label: 'ÇALIŞTI', value: stats.workedShifts,         color: 'var(--green)', showBar: true },
    { label: 'MESAİ',   value: `${stats.totalOvertime}s`,  color: 'var(--accent)' },
    { label: 'İZİN',    value: `${stats.totalLeave}g`,     color: 'var(--purple)' },
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
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Yükleniyor...</div>
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

            {/* ActionForm overlay — Task 6'da implemente edilecek */}
            {activeForm && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                background: 'var(--bg)', padding: '20px 24px',
                animation: 'fadeIn .15s ease',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
                  FORM: {activeForm} — Task 6'da implemente edilecek
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveForm(null)}>İptal</button>
              </div>
            )}

            {/* ÖZET — Activity Timeline */}
            {!activeForm && detailTab === 'overview' && (() => {
              const events = [
                ...shiftHistory.map(s => ({
                  date: s.work_date,
                  type: 'shift',
                  color: 'var(--blue)',
                  icon: '📅',
                  label: s.shift_name ? `${s.shift_name} · ${s.start_hour}:00–${s.end_hour === 24 ? '00' : s.end_hour}:00` : 'Vardiya',
                  sub: s.status === 'worked' ? 'Çalıştı' : s.status === 'absent' ? 'Gelmedi' : s.status === 'on_leave' ? 'İzinli' : 'Planlandı',
                })),
                ...leaveHistory.map(l => ({
                  date: l.start_date,
                  type: 'leave',
                  color: 'var(--purple)',
                  icon: '🏖️',
                  label: `${LEAVE_TYPES[l.leave_type]?.label || l.leave_type} · ${l.total_days} gün`,
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

              return events.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Kayıt yok</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

          </div>
        </>
      )}
    </BottomSheet>
  )
}

// ─── Shift color helpers ──────────────────────────────────────────────────────
function shiftColor(colorClass) {
  const map = {
    'bg-blue-400':   { bg: 'rgba(59,140,240,.15)', text: 'var(--blue)' },
    'bg-orange-400': { bg: 'rgba(240,165,0,.15)',   text: 'var(--accent)' },
    'bg-indigo-600': { bg: 'rgba(155,89,182,.15)',  text: 'var(--purple)' },
  }
  return map[colorClass] || { bg: 'var(--surface3)', text: 'var(--text2)' }
}

function deptColor(colorClass) {
  const map = {
    'bg-red-600':    { bg: 'rgba(231,76,60,.12)',   text: 'var(--red)' },
    'bg-green-600':  { bg: 'rgba(39,201,106,.12)',  text: 'var(--green)' },
    'bg-orange-500': { bg: 'rgba(240,165,0,.12)',   text: 'var(--accent)' },
    'bg-blue-600':   { bg: 'rgba(59,140,240,.12)',  text: 'var(--blue)' },
    'bg-yellow-500': { bg: 'rgba(245,200,66,.12)',  text: 'var(--accent3)' },
    'bg-lime-500':   { bg: 'rgba(39,201,106,.12)',  text: 'var(--green)' },
    'bg-pink-500':   { bg: 'rgba(244,114,182,.12)', text: '#f472b6' },
    'bg-purple-600': { bg: 'rgba(155,89,182,.12)',  text: 'var(--purple)' },
  }
  return map[colorClass] || { bg: 'var(--surface3)', text: 'var(--text2)' }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 0 — PERSONEL YONETIMI (Staff Management) — YENİ
// ═══════════════════════════════════════════════════════════════════════════════
function StaffTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ dept_id: '', gender: '', search: '', is_active: '1' })
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [form, setForm] = useState({})

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-list', filters],
    queryFn: () => api.get('/shifts/staff', { params: { ...filters, is_active: filters.is_active || undefined } }).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/staff', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      setShowForm(false)
      setForm({})
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/staff/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      qc.invalidateQueries({ queryKey: ['staff-detail'] })
      setEditStaff(null)
      setForm({})
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/shifts/staff/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-list'] }),
  })

  const openNew = () => {
    setForm({
      full_name: '', tc_no: '', phone: '', email: '', position: '', department_id: '',
      hire_date: '', birth_date: '', address: '', emergency_contact: '', emergency_phone: '',
      blood_type: '', gender: 'male', salary: '', notes: '', is_active: 1,
    })
    setEditStaff(null)
    setShowForm(true)
  }

  const openEdit = (s) => {
    setForm({
      full_name: s.full_name || '', tc_no: s.tc_no || '', phone: s.phone || '', email: s.email || '',
      position: s.position || '', department_id: s.department_id?.toString() || '',
      hire_date: s.hire_date || '', birth_date: s.birth_date || '', address: s.address || '',
      emergency_contact: s.emergency_contact || '', emergency_phone: s.emergency_phone || '',
      blood_type: s.blood_type || '', gender: s.gender || 'male', salary: s.salary?.toString() || '',
      notes: s.notes || '', is_active: s.is_active,
    })
    setEditStaff(s)
    setShowForm(true)
  }

  const handleSubmit = () => {
    const payload = {
      ...form,
      department_id: form.department_id ? parseInt(form.department_id) : null,
      salary: form.salary ? parseFloat(form.salary) : null,
      is_active: form.is_active ? 1 : 0,
    }
    if (editStaff) {
      updateMut.mutate({ id: editStaff.id, ...payload })
    } else {
      createMut.mutate(payload)
    }
  }

  // Group by department for summary
  const deptCounts = useMemo(() => {
    const counts = {}
    staffList.forEach(s => {
      const name = s.dept_name || 'Atanmamis'
      counts[name] = (counts[name] || 0) + 1
    })
    return counts
  }, [staffList])

  const maleCount = staffList.filter(s => s.gender === 'male').length
  const femaleCount = staffList.filter(s => s.gender === 'female').length

  return (
    <div className="fade-up">
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--text)', lineHeight: 1 }}>{staffList.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>TOPLAM PERSONEL</div>
        </div>
        <div style={{ padding: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--blue)', lineHeight: 1 }}>{maleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>ERKEK</div>
        </div>
        <div style={{ padding: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: '#f472b6', lineHeight: 1 }}>{femaleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>KADIN</div>
        </div>
        <div style={{ padding: '14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--green)', lineHeight: 1 }}>{Object.keys(deptCounts).length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>DEPARTMAN</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input
          className="form-input"
          placeholder="Ad, TC, telefon veya pozisyon ara..."
          value={filters.search}
          onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
          style={{ flex: '1 1 200px', maxWidth: '320px', padding: '6px 12px', fontSize: '12px' }}
        />
        <select className="form-select" value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="form-select" value={filters.gender} onChange={e => setFilters(p => ({ ...p, gender: e.target.value }))}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Cinsiyet</option>
          <option value="male">Erkek</option>
          <option value="female">Kadin</option>
        </select>
        <select className="form-select" value={filters.is_active} onChange={e => setFilters(p => ({ ...p, is_active: e.target.value }))}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '11px' }}>
          <option value="1">Aktif</option>
          <option value="0">Pasif</option>
          <option value="">Tumunu</option>
        </select>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginLeft: 'auto' }}>
            + Yeni Personel
          </button>
        )}
      </div>

      {/* Staff card grid */}
      {isLoading ? (
        <div className="empty-state"><div className="empty-sub">Yükleniyor...</div></div>
      ) : staffList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-title">PERSONEL YOK</div>
          <div className="empty-sub">Filtrelerinize uygun personel bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {staffList.map(s => {
            const dc = deptColor(s.dept_color)
            const avatarBg = s.gender === 'female' ? 'rgba(244,114,182,.18)' : 'rgba(59,140,240,.18)'
            const avatarColor = s.gender === 'female' ? '#f472b6' : 'var(--blue)'
            return (
              <div key={s.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '12px', overflow: 'hidden',
                transition: 'box-shadow .2s, transform .15s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.2)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
              >
                {/* Card header — dept color stripe */}
                <div style={{ height: '4px', background: dc.text || 'var(--border)' }} />

                <div style={{ padding: '16px' }}>
                  {/* Avatar + name row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <div
                      onClick={() => onPersonClick && onPersonClick(s.id)}
                      style={{
                        width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0,
                        background: avatarBg, color: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--display)', fontSize: '20px', fontWeight: 700,
                      }}
                    >
                      {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => onPersonClick && onPersonClick(s.id)}
                        style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px', lineHeight: 1.2 }}
                      >
                        {s.full_name}
                      </div>
                      {s.position && (
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>{s.position}</div>
                      )}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {s.dept_name && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: dc.bg, color: dc.text }}>
                            {s.dept_name}
                          </span>
                        )}
                        <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: s.is_active ? 'rgba(39,201,106,.12)' : 'var(--surface2)', color: s.is_active ? 'var(--green)' : 'var(--text3)' }}>
                          {s.is_active ? 'AKTİF' : 'PASİF'}
                        </span>
                        {s.blood_type && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', background: 'rgba(231,76,60,.1)', color: 'var(--red)' }}>
                            {s.blood_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info row */}
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    {s.phone && <span>📞 {s.phone}</span>}
                    {s.hire_date && <span>📅 {new Date(s.hire_date).toLocaleDateString('tr-TR', { year: '2-digit', month: 'short' })}</span>}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(s) }}
                        style={{ flex: 1, padding: '6px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                      >✏️ Düzenle</button>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm(`${s.full_name} pasif yapılsın mı?`)) deleteMut.mutate(s.id) }}
                        style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', color: 'var(--red)' }}
                      >Pasif</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <ModalOverlay onClose={() => { setShowForm(false); setEditStaff(null) }} wide>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            {editStaff ? 'PERSONEL DUZENLE' : 'YENI PERSONEL EKLE'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Ad Soyad *</label>
              <input className="form-input" value={form.full_name || ''}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">TC Kimlik No</label>
              <input className="form-input" value={form.tc_no || ''} maxLength={11}
                onChange={e => setForm(p => ({ ...p, tc_no: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Cinsiyet</label>
              <select className="form-select" value={form.gender || 'male'}
                onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="male">Erkek</option>
                <option value="female">Kadin</option>
              </select>
            </div>
            <div>
              <label className="form-label">Telefon</label>
              <input className="form-input" value={form.phone || ''} placeholder="05XX XXX XXXX"
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">E-posta</label>
              <input className="form-input" type="email" value={form.email || ''}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Pozisyon</label>
              <input className="form-input" value={form.position || ''} placeholder="Ornegin: Guvenlik Gorevlisi"
                onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={form.department_id || ''}
                onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">Departman secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Ise Giris Tarihi</label>
              <input type="date" className="form-input" value={form.hire_date || ''}
                onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Dogum Tarihi</label>
              <input type="date" className="form-input" value={form.birth_date || ''}
                onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Kan Grubu</label>
              <select className="form-select" value={form.blood_type || ''}
                onChange={e => setForm(p => ({ ...p, blood_type: e.target.value }))}>
                <option value="">Secin...</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Maas (TL)</label>
              <input type="number" className="form-input" value={form.salary || ''}
                onChange={e => setForm(p => ({ ...p, salary: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Adres</label>
              <input className="form-input" value={form.address || ''}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Kisisi</label>
              <input className="form-input" value={form.emergency_contact || ''}
                onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Telefon</label>
              <input className="form-input" value={form.emergency_phone || ''}
                onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notlar</label>
              <textarea className="form-textarea" value={form.notes || ''} rows={2}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ minHeight: '50px' }} />
            </div>
            {editStaff && (
              <div>
                <label className="form-label">Durum</label>
                <select className="form-select" value={form.is_active ? '1' : '0'}
                  onChange={e => setForm(p => ({ ...p, is_active: parseInt(e.target.value) }))}>
                  <option value="1">Aktif</option>
                  <option value="0">Pasif</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !form.full_name ? 0.5 : 1 }}
              disabled={!form.full_name || createMut.isPending || updateMut.isPending}
              onClick={handleSubmit}>
              {(createMut.isPending || updateMut.isPending) ? 'Kaydediliyor...' : editStaff ? 'Guncelle' : 'Kaydet'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditStaff(null) }}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — Cizelge (Schedule) — HAFTA DOLDUR + PAZAR IZIN + PUANTAJ
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleTab({ departments, shiftDefs, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [deptFilter, setDeptFilter] = useState('')
  const [cellPopover, setCellPopover] = useState(null)
  const [weekFillPopover, setWeekFillPopover] = useState(null) // { person, rect }
  const [weekFillDef, setWeekFillDef] = useState('')
  const [weekFillOffDay, setWeekFillOffDay] = useState(6) // 0=Mon .. 6=Sun — default Sunday
  const [addPersonModal, setAddPersonModal] = useState(false)
  const [addPersonId, setAddPersonId] = useState('')
  const [bulkFillModal, setBulkFillModal] = useState(false)
  const [bulkDef, setBulkDef] = useState('')
  const [bulkDept, setBulkDept] = useState('')
  // All-staff fill
  const [allFillModal, setAllFillModal] = useState(false)
  const [allFillDef, setAllFillDef] = useState('')
  // Excel import
  const [excelModal, setExcelModal] = useState(false)
  const [excelPreview, setExcelPreview] = useState(null) // { matched, unmatched, entries }
  const [excelError, setExcelError] = useState('')

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = weekDays[6]
  const DAY_LABELS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['schedule', weekStart, deptFilter],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: weekStart, week_end: weekEnd, dept_id: deptFilter || undefined }
    }).then(r => r.data),
  })

  const { data: allStaff = [] } = useQuery({
    queryKey: ['staff-list-active'],
    queryFn: () => api.get('/shifts/staff', { params: { is_active: '1' } }).then(r => r.data),
  })

  // Build stable weekly grid: merge schedule data with all staff in dept
  const staffGrid = useMemo(() => {
    // First: index schedule rows by staff_id
    const schedMap = new Map()
    rows.forEach(r => {
      if (!schedMap.has(r.staff_id)) {
        schedMap.set(r.staff_id, {
          id: r.staff_id, full_name: r.full_name, gender: r.gender, position: r.position,
          dept_id: r.dept_id, dept_name: r.dept_name, dept_color: r.dept_color,
          days: {}
        })
      }
      schedMap.get(r.staff_id).days[r.work_date] = r
    })

    // Second: add all active staff (those NOT in schedule yet)
    const result = new Map(schedMap)
    allStaff.forEach(s => {
      if (deptFilter && s.department_id !== parseInt(deptFilter)) return
      if (!result.has(s.id)) {
        result.set(s.id, {
          id: s.id, full_name: s.full_name, gender: s.gender, position: s.position,
          dept_id: s.department_id, dept_name: s.dept_name, dept_color: s.dept_color,
          days: {}
        })
      }
    })

    // Sort by dept then name
    return Array.from(result.values()).sort((a, b) => {
      if (a.dept_name && b.dept_name && a.dept_name !== b.dept_name) return a.dept_name.localeCompare(b.dept_name, 'tr')
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, allStaff, deptFilter])

  const assignCell = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, date, status }) =>
      api.post('/shifts/schedule', {
        entries: [{ staff_id: staffId, dept_id: deptId, shift_def_id: shiftDefId || null, work_date: date, status: status || 'scheduled' }]
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) }
  })

  const deleteShift = useMutation({
    mutationFn: ({ staffId, date }) => api.delete(`/shifts/schedule/${staffId}/${date}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) }
  })

  const copyWeek = useMutation({
    mutationFn: () => api.post('/shifts/schedule/copy-week', { source_week: weekStart, target_week: addDays(weekStart, 7) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }) }
  })

  // Fill ALL active staff same shift, Sunday off
  const allFill = useMutation({
    mutationFn: ({ shiftDefId }) => {
      const entries = []
      allStaff.forEach(s => {
        weekDays.forEach((d, i) => {
          entries.push({
            staff_id: s.id,
            dept_id: s.department_id || null,
            work_date: d,
            shift_def_id: i === 6 ? null : parseInt(shiftDefId),
            status: i === 6 ? 'on_leave' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setAllFillModal(false); setAllFillDef('') }
  })

  // Excel import submit
  const excelImport = useMutation({
    mutationFn: (entries) => api.post('/shifts/schedule', { entries }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setExcelModal(false); setExcelPreview(null) }
  })

  // Excel file parse
  const handleExcelFile = async (file) => {
    setExcelError('')
    setExcelPreview(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (!rows.length) { setExcelError('Bos dosya'); return }

      // Detect header row (first row with at least 3 cells)
      const headerIdx = rows.findIndex(r => r.filter(Boolean).length >= 3)
      if (headerIdx === -1) { setExcelError('Baslik satiri bulunamadi'); return }
      const headers = rows[headerIdx].map(h => String(h || '').toLowerCase().trim())

      // Name column: first column or one containing "ad" / "isim" / "soyad"
      const nameCol = headers.findIndex(h => h.includes('ad') || h.includes('isim') || h === '') || 0

      // Day column map
      const DAY_KEYS = [
        ['pzt', 'pazartesi', 'mon', 'monday'],
        ['sal', 'salı', 'tue', 'tuesday'],
        ['çar', 'çarşamba', 'wed', 'wednesday'],
        ['per', 'perşembe', 'thu', 'thursday'],
        ['cum', 'cuma', 'fri', 'friday'],
        ['cmt', 'cumartesi', 'sat', 'saturday'],
        ['paz', 'pazar', 'sun', 'sunday'],
      ]
      // Also match date headers like "23.03.2026" → use weekDays order
      const dayColMap = {} // dayIdx (0-6) → colIdx
      headers.forEach((h, ci) => {
        DAY_KEYS.forEach((keys, di) => {
          if (keys.some(k => h.startsWith(k))) dayColMap[di] = ci
        })
      })
      // If no named columns found, try to map by position (cols after name col)
      if (Object.keys(dayColMap).length === 0) {
        const startCol = nameCol + 1
        for (let di = 0; di < 7; di++) {
          if (startCol + di < headers.length) dayColMap[di] = startCol + di
        }
      }

      // Shift value → { shiftDefId, status }
      const parseCell = (val) => {
        if (!val && val !== 0) return null
        const v = String(val).toLowerCase().trim()
        if (!v || v === '-' || v === '') return null
        if (v === 'i' || v === 'İ' || v === 'izin' || v === 'tatil' || v === 'off') return { shiftDefId: null, status: 'on_leave' }
        if (v === '1' || v.startsWith('g') && !v.startsWith('ge')) return { shiftDefId: shiftDefs[0]?.id || null, status: 'scheduled' }
        if (v === '2' || v.startsWith('a')) return { shiftDefId: shiftDefs[1]?.id || null, status: 'scheduled' }
        if (v === '3' || v.startsWith('ge')) return { shiftDefId: shiftDefs[2]?.id || null, status: 'scheduled' }
        // Numeric: 1/2/3
        const n = parseInt(v)
        if (n >= 1 && n <= shiftDefs.length) return { shiftDefId: shiftDefs[n - 1]?.id || null, status: 'scheduled' }
        return null
      }

      // Build name → staff map (normalize: lowercase, trim, remove extra spaces)
      const normalize = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
      const staffByName = new Map(allStaff.map(s => [normalize(s.full_name), s]))

      const matched = [], unmatched = []
      const entries = []

      rows.slice(headerIdx + 1).forEach((row, ri) => {
        if (!row[nameCol]) return // skip empty rows
        const rawName = String(row[nameCol]).trim()
        if (!rawName) return
        const staff = staffByName.get(normalize(rawName))

        const dayEntries = []
        for (let di = 0; di < 7; di++) {
          const colIdx = dayColMap[di]
          if (colIdx === undefined) continue
          const parsed = parseCell(row[colIdx])
          if (!parsed) continue
          dayEntries.push({ dayIdx: di, date: weekDays[di], ...parsed })
        }

        if (!staff) {
          unmatched.push({ name: rawName, dayEntries })
        } else {
          matched.push({ staff, dayEntries })
          dayEntries.forEach(e => {
            entries.push({
              staff_id: staff.id,
              dept_id: staff.department_id || null,
              work_date: e.date,
              shift_def_id: e.shiftDefId,
              status: e.status,
            })
          })
        }
      })

      setExcelPreview({ matched, unmatched, entries })
    } catch (err) {
      setExcelError('Dosya okunamadi: ' + err.message)
    }
  }

  // Fill one person's week (with off-day as on_leave)
  const fillWeek = useMutation({
    mutationFn: ({ staffId, deptId, shiftDefId, offDayIdx }) => {
      const entries = weekDays.map((d, i) => ({
        staff_id: staffId, dept_id: deptId, work_date: d,
        shift_def_id: i === offDayIdx ? null : shiftDefId,
        status: i === offDayIdx ? 'on_leave' : 'scheduled',
      }))
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setWeekFillPopover(null) }
  })

  // Bulk fill: all staff in a dept
  const bulkFill = useMutation({
    mutationFn: ({ deptId, shiftDefId }) => {
      const staff = allStaff.filter(s => s.department_id === parseInt(deptId))
      const entries = []
      staff.forEach(s => {
        weekDays.forEach((d, i) => {
          entries.push({
            staff_id: s.id, dept_id: parseInt(deptId), work_date: d,
            shift_def_id: i === 6 ? null : parseInt(shiftDefId), // Sunday off
            status: i === 6 ? 'on_leave' : 'scheduled',
          })
        })
      })
      return api.post('/shifts/schedule', { entries })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setBulkFillModal(false) }
  })

  const openCellPopover = (e, person, date) => {
    if (!canEdit) return
    const rect = e.currentTarget.getBoundingClientRect()
    const existing = person.days[date]
    setCellPopover({ staffId: person.id, deptId: person.dept_id, date, personName: person.full_name, rect, existing })
  }

  const openWeekFill = (e, person) => {
    if (!canEdit) return
    const rect = e.currentTarget.getBoundingClientRect()
    setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
    setWeekFillOffDay(6) // default Sunday
    setWeekFillPopover({ person, rect })
  }

  const isSunday = (dateStr) => new Date(dateStr).getDay() === 0

  // Stats for this week
  const weekStats = useMemo(() => {
    let working = 0, onLeave = 0, empty = 0
    // Per-day breakdown
    const perDay = weekDays.map(d => {
      const dayWorking = []
      const dayLeave = []
      const dayEmpty = []
      staffGrid.forEach(p => {
        const cell = p.days[d]
        if (!cell) dayEmpty.push(p)
        else if (cell.status === 'on_leave') dayLeave.push(p)
        else dayWorking.push(p)
      })
      working += dayWorking.length
      onLeave += dayLeave.length
      empty += dayEmpty.length
      return { date: d, working: dayWorking, leave: dayLeave, empty: dayEmpty }
    })
    return { working, onLeave, empty, total: staffGrid.length, perDay }
  }, [staffGrid, weekDays])

  return (
    <div className="fade-up">

      {/* ── Top control bar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
        marginBottom: '20px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 16px',
      }}>
        {/* Week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <div style={{ textAlign: 'center', minWidth: '160px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '15px', letterSpacing: '1px', color: 'var(--text)' }}>
              {formatDate(weekStart)} — {formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
          <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text2)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        </div>

        {/* Dept filter */}
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}>
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Stats chips */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontFamily: 'var(--mono)', background: 'rgba(39,201,106,.12)', color: 'var(--green)', fontWeight: 600 }}>
            {weekStats.total} Personel
          </span>
          {shiftDefs.map(s => {
            const c = shiftColor(s.color_class)
            return (
              <span key={s.id} style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontFamily: 'var(--mono)', background: c.bg, color: c.text, fontWeight: 600 }}>
                {s.name}
              </span>
            )
          })}
        </div>

        {/* Action buttons */}
        {canEdit && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => setAddPersonModal(true)} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
            }}>+ Personel</button>
            <button onClick={() => setBulkFillModal(true)} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
            }}>Bölüm Doldur</button>
            <button onClick={() => { setAllFillDef(shiftDefs[0]?.id?.toString() || ''); setAllFillModal(true) }} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              background: 'rgba(26,188,156,.12)', border: '1px solid rgba(26,188,156,.4)', color: 'var(--teal)',
            }}>⚡ Tümünü Doldur</button>
            <button onClick={() => { setExcelModal(true); setExcelPreview(null); setExcelError('') }} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              background: 'rgba(52,152,219,.12)', border: '1px solid rgba(52,152,219,.4)', color: 'var(--blue)',
            }}>📊 Excel</button>
            <button onClick={() => { if (confirm('Bu haftayı sonraki haftaya kopyalayalım mı?')) copyWeek.mutate() }}
              disabled={copyWeek.isPending} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
              background: 'var(--accent)', border: 'none', color: '#000', fontWeight: 600,
            }}>
              {copyWeek.isPending ? '...' : '↗ Kopyala'}
            </button>
          </div>
        )}
      </div>

      {/* ── Schedule grid ── */}
      {isLoading ? (
        <div className="empty-state"><div className="empty-sub">Yükleniyor...</div></div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            {/* Header row */}
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  background: 'var(--surface2)', borderRight: '2px solid var(--border)',
                  padding: '12px 16px', minWidth: '180px', textAlign: 'left',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '2px', color: 'var(--text3)' }}>
                    PERSONEL · {weekStats.total}
                  </div>
                </th>
                {weekDays.map((d, i) => {
                  const sun = isSunday(d)
                  const isToday = d === todayStr()
                  return (
                    <th key={d} style={{
                      padding: '10px 8px', textAlign: 'center', minWidth: '110px',
                      borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                      background: isToday ? 'rgba(59,140,240,.1)' : sun ? 'rgba(240,165,0,.07)' : undefined,
                    }}>
                      <div style={{
                        fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px',
                        color: isToday ? 'var(--blue)' : sun ? 'var(--accent)' : 'var(--text)',
                      }}>{DAY_LABELS[i]}</div>
                      <div style={{
                        fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px',
                        color: isToday ? 'var(--blue)' : sun ? 'var(--accent)' : 'var(--text3)',
                      }}>{formatDate(d)}</div>
                      {/* Day stats mini */}
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>
                          {weekStats.perDay[i]?.working.length || 0}✓
                        </span>
                        {weekStats.perDay[i]?.leave.length > 0 && (
                          <span style={{ fontSize: '9px', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>
                            {weekStats.perDay[i].leave.length}İ
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
                {canEdit && <th style={{ width: '60px', background: 'var(--surface2)' }} />}
              </tr>
            </thead>
            <tbody>
              {staffGrid.map((person, rowIdx) => {
                const dc = deptColor(person.dept_color)
                const avatarColor = person.gender === 'female' ? { bg: 'rgba(244,114,182,.2)', text: '#f472b6' } : { bg: 'rgba(59,140,240,.2)', text: 'var(--blue)' }
                return (
                  <tr key={person.id} style={{ borderTop: '1px solid var(--border)', background: rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
                    {/* Person cell */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--surface)',
                      borderRight: '2px solid var(--border)',
                      padding: '8px 12px',
                    }}>
                      <div
                        onClick={() => onPersonClick?.(person.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                          background: avatarColor.bg, color: avatarColor.text,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--display)', fontSize: '14px', fontWeight: 700,
                        }}>
                          {person.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '13px', fontWeight: 600, color: 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px',
                          }}>{person.full_name}</div>
                          {person.dept_name && (
                            <span style={{
                              fontSize: '9px', fontFamily: 'var(--mono)', letterSpacing: '.5px',
                              padding: '1px 5px', borderRadius: '4px', marginTop: '2px', display: 'inline-block',
                              background: dc.bg, color: dc.text,
                            }}>{person.dept_name}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {weekDays.map((d, i) => {
                      const cell = person.days[d]
                      const sc = cell?.shift_color ? shiftColor(cell.shift_color) : null
                      const sun = isSunday(d)
                      const isToday = d === todayStr()
                      const isLeave = cell?.status === 'on_leave'
                      const isAbsent = cell?.status === 'absent'

                      let pillBg = 'transparent', pillColor = 'var(--text3)', pillLabel = null, pillSub = null

                      if (cell) {
                        if (isLeave) {
                          pillBg = 'rgba(26,188,156,.15)'; pillColor = 'var(--teal)'; pillLabel = '🏖 İZİN'
                        } else if (isAbsent) {
                          pillBg = 'rgba(231,76,60,.12)'; pillColor = 'var(--red)'; pillLabel = '✗ YOK'
                        } else if (sc) {
                          pillBg = sc.bg; pillColor = sc.text
                          pillLabel = cell.shift_name
                          pillSub = `${cell.shift_start || ''}–${cell.shift_end === 24 ? '00' : cell.shift_end || ''}${cell.shift_start ? ':00' : ''}`
                        }
                      }

                      return (
                        <td key={d} style={{
                          padding: '6px 4px', textAlign: 'center',
                          borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                          background: isToday ? 'rgba(59,140,240,.04)' : sun ? 'rgba(240,165,0,.03)' : 'transparent',
                        }}>
                          <button
                            onClick={e => openCellPopover(e, person, d)}
                            disabled={!canEdit}
                            style={{
                              width: '100%', minHeight: '48px', padding: '6px 4px',
                              borderRadius: '8px', border: pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,
                              cursor: canEdit ? 'pointer' : 'default',
                              background: pillBg,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                              transition: 'filter .15s, transform .1s',
                            }}
                            onMouseEnter={e => { if (canEdit) e.currentTarget.style.filter = 'brightness(1.15)' }}
                            onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
                          >
                            {pillLabel ? (
                              <>
                                <span style={{ fontFamily: 'var(--display)', fontSize: '11px', letterSpacing: '1px', color: pillColor, fontWeight: 700 }}>
                                  {pillLabel}
                                </span>
                                {pillSub && (
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pillColor, opacity: .7 }}>
                                    {pillSub}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '16px', color: 'var(--border)', opacity: canEdit ? 1 : 0 }}>+</span>
                            )}
                          </button>
                        </td>
                      )
                    })}

                    {/* Week fill button */}
                    {canEdit && (
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          onClick={e => openWeekFill(e, person)}
                          title="Haftayı doldur"
                          style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            cursor: 'pointer', fontSize: '14px', color: 'var(--text3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >↓</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {staffGrid.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text2)' }}>PERSONEL YOK</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>Departman seçin veya personel ekleyin</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cell panel — vardiya/izin atama */}
      {cellPopover && (
        <SidePanel
          title="VARDIYA ATA"
          subtitle={`${cellPopover.personName} · ${formatDate(cellPopover.date)} ${shortDay(cellPopover.date)}`}
          icon="&#128197;"
          onClose={() => setCellPopover(null)}
          width={300}
          anchorRect={cellPopover.rect}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>VARDIYA SEC</div>
            {shiftDefs.map(s => {
              const isActive = cellPopover.existing?.shift_def_id === s.id && cellPopover.existing?.status !== 'on_leave'
              const sc = shiftColor(s.color_class)
              return (
                <button key={s.id}
                  onClick={() => assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: s.id, date: cellPopover.date, status: 'scheduled' })}
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
                    {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00' : s.end_hour}:00
                  </span>
                  {isActive && <span style={{ float: 'right', fontSize: '10px' }}>✓ Aktif</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => assignCell.mutate({ staffId: cellPopover.staffId, deptId: cellPopover.deptId, shiftDefId: null, date: cellPopover.date, status: 'on_leave' })}
              disabled={assignCell.isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                border: `2px solid ${cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--border)'}`,
                background: cellPopover.existing?.status === 'on_leave' ? 'rgba(26,188,156,.12)' : 'var(--surface2)',
                color: cellPopover.existing?.status === 'on_leave' ? 'var(--teal)' : 'var(--text2)',
                fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
              }}>
              IZIN {cellPopover.existing?.status === 'on_leave' && '✓'}
            </button>
            <button
              onClick={() => deleteShift.mutate({ staffId: cellPopover.staffId, date: cellPopover.date })}
              disabled={deleteShift.isPending}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                border: '2px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
              }}>
              KALDIR
            </button>
          </div>
        </SidePanel>
      )}

      {/* Week fill panel */}
      {weekFillPopover && (
        <SidePanel
          title="HAFTA DOLDUR"
          subtitle={`${weekFillPopover.person.full_name} · ${formatDate(weekStart)}–${formatDate(weekEnd)}`}
          icon="&#128198;"
          onClose={() => setWeekFillPopover(null)}
          width={320}
          anchorRect={weekFillPopover.rect}
        >
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>VARDIYA SEC</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {shiftDefs.map(s => {
                const active = weekFillDef === s.id.toString()
                const sc = shiftColor(s.color_class)
                return (
                  <button key={s.id} onClick={() => setWeekFillDef(s.id.toString())}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '8px',
                      textAlign: 'left', fontSize: '13px', cursor: 'pointer',
                      border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                      background: active ? sc.bg : 'var(--surface2)',
                      color: active ? sc.text : 'var(--text2)',
                    }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                      {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                    </span>
                    {active && <span style={{ float: 'right', fontSize: '10px' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>IZIN GUNU</div>
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
            onClick={() => fillWeek.mutate({
              staffId: weekFillPopover.person.id,
              deptId: weekFillPopover.person.dept_id,
              shiftDefId: parseInt(weekFillDef),
              offDayIdx: weekFillOffDay,
            })}>
            {fillWeek.isPending ? 'Dolduruluyor...' : '6 Gun Doldur + 1 Izin'}
          </button>
        </SidePanel>
      )}

      {/* Bulk fill modal — entire dept */}
      {bulkFillModal && (
        <ModalOverlay onClose={() => setBulkFillModal(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '12px' }}>TOPLU DOLDUR</h3>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '14px' }}>
            Secilen departmandaki tum personeli ayni vardiyayla doldurur. Pazar izinli.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={bulkDept} onChange={e => setBulkDept(e.target.value)}>
                <option value="">Sec...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Vardiya</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {shiftDefs.map(s => {
                  const active = bulkDef === s.id.toString()
                  const sc = shiftColor(s.color_class)
                  return (
                    <button key={s.id} onClick={() => setBulkDef(s.id.toString())}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px',
                        textAlign: 'left', fontSize: '12px', cursor: 'pointer',
                        border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                        background: active ? sc.bg : 'var(--surface2)',
                        color: active ? sc.text : 'var(--text2)',
                      }}>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                        {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!bulkDept || !bulkDef) ? 0.5 : 1 }}
              disabled={!bulkDept || !bulkDef || bulkFill.isPending}
              onClick={() => bulkFill.mutate({ deptId: bulkDept, shiftDefId: bulkDef })}>
              {bulkFill.isPending ? 'Dolduruluyor...' : 'Tum Departmani Doldur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setBulkFillModal(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* All-staff fill modal */}
      {allFillModal && (
        <ModalOverlay onClose={() => { setAllFillModal(false); setAllFillDef('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            TUM PERSONELI DOLDUR
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
            Bu haftanın tüm günlerini seçili vardiyayla doldurur. Pazar günü otomatik izin olarak işaretlenir.
          </p>
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Vardiya Seç</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {shiftDefs.map(s => {
                const active = allFillDef === s.id.toString()
                const sc = SHIFT_COLORS[s.color_class] || SHIFT_COLORS.blue
                return (
                  <button key={s.id} onClick={() => setAllFillDef(s.id.toString())}
                    style={{
                      padding: '10px 18px', borderRadius: '8px', fontFamily: 'var(--display)',
                      fontSize: '13px', letterSpacing: '1px', cursor: 'pointer',
                      border: `2px solid ${active ? sc.text : 'var(--border)'}`,
                      background: active ? sc.bg : 'var(--surface2)',
                      color: active ? sc.text : 'var(--text2)',
                    }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginLeft: '8px', opacity: .7 }}>
                      {s.start_hour}:00&ndash;{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !allFillDef ? 0.5 : 1 }}
              disabled={!allFillDef || allFill.isPending}
              onClick={() => allFill.mutate({ shiftDefId: allFillDef })}>
              {allFill.isPending ? 'Dolduruluyor...' : `Tum Personeli Doldur (${allStaff.length} kişi)`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setAllFillModal(false); setAllFillDef('') }}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* Excel import modal */}
      {excelModal && (
        <ModalOverlay onClose={() => { setExcelModal(false); setExcelPreview(null); setExcelError('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            EXCEL AKTAR
          </h3>
          {!excelPreview ? (
            <>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Excel dosyasını seçin. İlk sütun isim, sonraki sütunlar günler (Pt, Sa, Ca, Pe, Cu, Ct, Pz veya Mon–Sun).
                Hücre değerleri: <strong>1/G</strong>=1.Vardiya, <strong>2/A</strong>=2.Vardiya, <strong>3/Ge</strong>=3.Vardiya, <strong>İ/izin</strong>=İzin, boş=atla.
              </p>
              {excelError && (
                <div style={{ padding: '10px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '6px', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
                  {excelError}
                </div>
              )}
              <input type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'block', width: '100%', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer', marginBottom: '16px' }}
                onChange={e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]) }}
              />
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setExcelModal(false); setExcelError('') }}>Iptal</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{excelPreview.matched}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: excelPreview.unmatched.length ? 'rgba(239,68,68,.1)' : 'var(--surface2)', border: `1px solid ${excelPreview.unmatched.length ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: excelPreview.unmatched.length ? '#ef4444' : 'var(--text2)' }}>{excelPreview.unmatched.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşmeyen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#6366f1' }}>{excelPreview.entries.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Kayıt</div>
                </div>
              </div>
              {excelPreview.unmatched.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '4px', fontWeight: 600 }}>Eşleşmeyen isimler:</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{excelPreview.unmatched.join(', ')}</div>
                </div>
              )}
              <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text2)' }}>İsim</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pt</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Sa</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ca</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pe</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Cu</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ct</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      excelPreview.entries.reduce((acc, e) => {
                        const s = allStaff.find(x => x.id === e.staff_id)
                        const name = s?.full_name || `#${e.staff_id}`
                        if (!acc[name]) acc[name] = {}
                        const dayIdx = weekDays.indexOf(e.work_date)
                        if (dayIdx >= 0) acc[name][dayIdx] = e
                        return acc
                      }, {})
                    ).map(([name, days]) => (
                      <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500 }}>{name}</td>
                        {[0,1,2,3,4,5,6].map(i => {
                          const e = days[i]
                          if (!e) return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text3)' }}>—</td>
                          if (e.status === 'on_leave') return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>İ</td>
                          const def = shiftDefs.find(d => d.id === e.shift_def_id)
                          const sc = SHIFT_COLORS[def?.color_class] || SHIFT_COLORS.blue
                          return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: sc.text, fontWeight: 600 }}>{def?.name || e.shift_def_id}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  disabled={excelImport.isPending || excelPreview.entries.length === 0}
                  onClick={() => excelImport.mutate(excelPreview.entries)}>
                  {excelImport.isPending ? 'Aktarılıyor...' : `İce Aktar (${excelPreview.entries.length} kayıt)`}
                </button>
                <button className="btn btn-ghost" onClick={() => { setExcelPreview(null); setExcelError('') }}>Geri</button>
                <button className="btn btn-ghost" onClick={() => { setExcelModal(false); setExcelPreview(null); setExcelError('') }}>Kapat</button>
              </div>
            </>
          )}
        </ModalOverlay>
      )}

      {/* Add person to schedule */}
      {addPersonModal && (
        <ModalOverlay onClose={() => { setAddPersonModal(false); setAddPersonId('') }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            CIZELGEYE PERSONEL EKLE
          </h3>
          <div style={{ marginBottom: '14px' }}>
            <label className="form-label">Personel Ara</label>
            <StaffSearch value={addPersonId} onChange={v => setAddPersonId(v)} placeholder="Ad, TC veya telefon ile ara..." />
          </div>
          {addPersonId && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)', marginBottom: '10px' }}>
              Personel secildi (ID: {addPersonId})
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !addPersonId ? 0.5 : 1 }}
              disabled={!addPersonId}
              onClick={() => {
                const s = allStaff.find(x => x.id === parseInt(addPersonId))
                if (s) {
                  setAddPersonModal(false); setAddPersonId('')
                  // directly fill their week
                  const fakeRect = { top: window.innerHeight / 2 - 100, bottom: window.innerHeight / 2, left: window.innerWidth / 2 - 130, width: 260 }
                  setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
                  setWeekFillOffDay(6)
                  setWeekFillPopover({ person: { id: s.id, full_name: s.full_name, dept_id: s.department_id, dept_name: s.dept_name }, rect: fakeRect })
                }
              }}>
              Hafta Doldur
            </button>
            <button className="btn btn-ghost" onClick={() => { setAddPersonModal(false); setAddPersonId('') }}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 2 — Izinler (Leave)
// ═══════════════════════════════════════════════════════════════════════════════
function LeaveTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ status: '', dept_id: '', leave_type: '' })
  const [newLeave, setNewLeave] = useState(false)
  const [form, setForm] = useState({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', filters],
    queryFn: () => api.get('/shifts/leave', { params: filters }).then(r => r.data),
  })

  const approveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/shifts/leave/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const cancelMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/leave/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/leave', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] })
      setNewLeave(false)
      setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const countByType = Object.fromEntries(
    Object.keys(LEAVE_TYPES).map(k => [k, leaves.filter(l => l.leave_type === k).length])
  )

  return (
    <div className="fade-up">
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={`filter-chip ${filters.status === s ? 'active' : ''}`}
            onClick={() => setFilters(p => ({ ...p, status: s }))}>
            {s === '' ? 'Tumunu' : STATUS_MAP[s]?.label}
          </button>
        ))}
        <select className="form-select" value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setNewLeave(true)} style={{ marginLeft: 'auto' }}>
          + Yeni Izin
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        {Object.entries(LEAVE_TYPES).map(([k, v]) => (
          <div key={k} style={{
            padding: '10px 12px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--text)', lineHeight: 1 }}>
              {countByType[k]}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
              {v.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Leave table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">IZIN TALEPLERI</div>
            <div className="panel-subtitle">{leaves.length} KAYIT</div>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {leaves.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#127796;</div>
              <div className="empty-title">IZIN YOK</div>
              <div className="empty-sub">Izin talebi bulunamadi</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Bolum</th>
                  <th>Tur</th>
                  <th>Tarih</th>
                  <th>Gun</th>
                  <th>Durum</th>
                  {canApprove && <th>Islem</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => {
                  const dc = deptColor(l.dept_color)
                  return (
                    <tr key={l.id}>
                      <td>
                        <div
                          onClick={() => l.staff_id && onPersonClick && onPersonClick(l.staff_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderBottom: '1px dashed var(--text3)' }}>
                          <span style={{ color: l.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>
                            {l.gender === 'female' ? '\u2640' : '\u2642'}
                          </span>
                          <div>
                            <span>{l.full_name}</span>
                            {l.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{l.position}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: dc.bg, color: dc.text,
                          fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                        }}>{l.dept_name}</span>
                      </td>
                      <td><span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`}>{LEAVE_TYPES[l.leave_type]?.label}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {formatDate(l.start_date)} &ndash; {formatDate(l.end_date)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{l.total_days}</td>
                      <td><span className={`badge ${STATUS_MAP[l.status]?.badge}`}>{STATUS_MAP[l.status]?.label}</span></td>
                      {canApprove && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {l.status === 'pending' && (
                              <>
                                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }}
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'approved' })}>Onayla</button>
                                <button className="btn btn-danger btn-sm"
                                  onClick={() => approveMut.mutate({ id: l.id, status: 'rejected' })}>Reddet</button>
                              </>
                            )}
                            {l.status === 'approved' && (
                              <button className="btn btn-danger btn-sm"
                                onClick={() => cancelMut.mutate(l.id)} disabled={cancelMut.isPending}>Iptal Et</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* New Leave Modal */}
      {newLeave && (
        <ModalOverlay onClose={() => setNewLeave(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            YENI IZIN TALEBI
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <StaffSearch value={form.staff_id} onChange={v => setForm(p => ({ ...p, staff_id: v }))} />
            </div>
            <div>
              <label className="form-label">Izin Turu</label>
              <select className="form-select" value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}>
                {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Baslangic</label>
                <input type="date" className="form-input" value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Bitis</label>
                <input type="date" className="form-input" value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Aciklama (istege bagli)</label>
              <textarea className="form-textarea" value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.staff_id || !form.start_date || !form.end_date) ? 0.5 : 1 }}
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending || !form.staff_id || !form.start_date || !form.end_date}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setNewLeave(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 3 — Mesai (Overtime)
// ═══════════════════════════════════════════════════════════════════════════════
function OvertimeTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState(null) // { ...record, rect }
  const [form, setForm] = useState({ staff_id: '', work_date: '', hours: '', reason: '' })

  const { data: records = [] } = useQuery({
    queryKey: ['overtime', month, deptFilter],
    queryFn: () => api.get('/shifts/overtime', { params: { month, dept_id: deptFilter || undefined } }).then(r => r.data),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['overtime-summary', month],
    queryFn: () => api.get('/shifts/overtime/summary', { params: { month } }).then(r => r.data),
  })

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['overtime'] })
    qc.invalidateQueries({ queryKey: ['overtime-summary'] })
  }

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/overtime', data),
    onSuccess: () => { invalidateAll(); setShowForm(false); setForm({ staff_id: '', work_date: '', hours: '', reason: '' }) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/overtime/${id}`, data),
    onSuccess: () => { invalidateAll(); setEditRecord(null) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/shifts/overtime/${id}`),
    onSuccess: () => { invalidateAll(); setEditRecord(null) },
  })

  const openEdit = (e, r) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setEditRecord({ ...r, rect })
    setForm({ staff_id: r.staff_id, work_date: r.work_date, hours: r.hours?.toString() || '', reason: r.reason || '' })
  }

  const openNew = () => {
    setEditRecord(null)
    setForm({ staff_id: '', work_date: '', hours: '', reason: '' })
    setShowForm(true)
  }

  const totalHours = records.reduce((s, r) => s + r.hours, 0)
  const uniqueStaff = new Set(records.map(r => r.staff_id)).size

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '12px' }} />
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginLeft: 'auto' }}>
            + Mesai Ekle
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'TOPLAM MESAI', value: `${totalHours.toFixed(1)}s`, color: 'var(--purple)' },
          { label: 'MESAI KAYDI', value: records.length, color: 'var(--text)' },
          { label: 'KISI SAYISI', value: uniqueStaff, color: 'var(--blue)' },
          { label: 'ORT./KISI', value: uniqueStaff ? `${(totalHours / uniqueStaff).toFixed(1)}s` : '\u2014', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {summary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {summary.map(s => {
            const dc = deptColor(s.color_class)
            return (
              <div key={s.dept_id} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600 }}>{s.dept_name}</span>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: 'var(--text)', lineHeight: 1, marginTop: '8px' }}>{s.total_hours?.toFixed(1)}s</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{s.staff_count} kisi</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">MESAI KAYITLARI</div><div className="panel-subtitle">{records.length} KAYIT</div></div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {records.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#9201;</div>
              <div className="empty-title">MESAI YOK</div>
              <div className="empty-sub">Bu ay mesai kaydi yok</div>
            </div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Personel</th><th>Bolum</th><th>Tarih</th><th>Saat</th><th>Sebep</th>{canEdit && <th>Islem</th>}</tr></thead>
              <tbody>
                {records.map(r => {
                  const dc = deptColor(r.dept_color)
                  return (
                    <tr key={r.id}>
                      <td>
                        <div
                          onClick={() => r.staff_id && onPersonClick && onPersonClick(r.staff_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderBottom: '1px dashed var(--text3)' }}>
                          <span style={{ color: r.gender === 'female' ? '#f472b6' : 'var(--blue)', fontSize: '11px' }}>{r.gender === 'female' ? '\u2640' : '\u2642'}</span>
                          <span>{r.full_name}</span>
                        </div>
                      </td>
                      <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600 }}>{r.dept_name}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{formatDate(r.work_date)}</td>
                      <td style={{ fontFamily: 'var(--display)', fontSize: '18px', color: 'var(--purple)' }}>{r.hours}s</td>
                      <td style={{ color: 'var(--text2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '\u2014'}</td>
                      {canEdit && (
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={(e) => openEdit(e, r)}>Duzenle</button>
                            <button className="btn btn-danger btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={() => { if (confirm('Bu mesai kaydini silmek istediginizden emin misiniz?')) deleteMut.mutate(r.id) }}>
                              Sil
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>MESAI KAYDI EKLE</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label">Personel</label>
              <StaffSearch value={form.staff_id} onChange={v => setForm(p => ({ ...p, staff_id: v }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Tarih</label>
                <input type="date" className="form-input" value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Saat</label>
                <input type="number" step="0.5" min="0.5" max="12" className="form-input" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <input className="form-input" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (createMut.isPending || !form.staff_id || !form.work_date || !form.hours) ? 0.5 : 1 }}
              onClick={() => createMut.mutate({ ...form, staff_id: parseInt(form.staff_id), hours: parseFloat(form.hours) })}
              disabled={createMut.isPending || !form.staff_id || !form.work_date || !form.hours}>
              {createMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {/* Edit — side panel */}
      {editRecord && (
        <SidePanel
          title="MESAI DUZENLE"
          subtitle={editRecord.full_name}
          icon="&#9201;"
          onClose={() => setEditRecord(null)}
          width={320}
          anchorRect={editRecord.rect}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Tarih</label>
                <input type="date" className="form-input"
                  value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))} />
              </div>
              <div style={{ width: '100px' }}>
                <label className="form-label">Saat</label>
                <input type="number" step="0.5" min="0.5" max="12" className="form-input"
                  value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label">Sebep</label>
              <input className="form-input"
                value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }}
                disabled={updateMut.isPending || !form.hours}
                onClick={() => updateMut.mutate({ id: editRecord.id, work_date: form.work_date, hours: parseFloat(form.hours), reason: form.reason })}>
                {updateMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button className="btn btn-danger"
                onClick={() => { if (confirm('Sil?')) deleteMut.mutate(editRecord.id) }}>
                Sil
              </button>
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 5 — Departmanlar (Departments)
// ═══════════════════════════════════════════════════════════════════════════════
function DepartmentsTab() {
  const qc = useQueryClient()
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/shifts/departments').then(r => r.data) })
  const [editDept, setEditDept] = useState(null)
  const [deptForm, setDeptForm] = useState({ name: '', color_class: 'bg-blue-600', description: '' })
  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ staff_id: '', dept_id: '' })

  const { data: deptSummary = [] } = useQuery({ queryKey: ['departments-summary'], queryFn: () => api.get('/shifts/departments/summary').then(r => r.data) })

  const createDept = useMutation({ mutationFn: data => api.post('/shifts/departments', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }); setEditDept(null) }, onError: e => alert(e.response?.data?.error || 'Hata') })
  const updateDept = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/departments/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }); setEditDept(null) }, onError: e => alert(e.response?.data?.error || 'Hata') })
  const deleteDept = useMutation({ mutationFn: (id) => api.delete(`/shifts/departments/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }) } })
  const assignMut = useMutation({ mutationFn: data => api.post('/shifts/departments/assign', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments-summary'] }); qc.invalidateQueries({ queryKey: ['staff-list'] }); setAssignModal(false); setAssignForm({ staff_id: '', dept_id: '' }) }, onError: e => alert(e.response?.data?.error || 'Hata') })

  const COLOR_OPTIONS = ['bg-red-600', 'bg-green-600', 'bg-orange-500', 'bg-blue-600', 'bg-yellow-500', 'bg-lime-500', 'bg-pink-500', 'bg-purple-600']
  const maxCount = Math.max(...deptSummary.map(d => d.staff_count || 0), 1)

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setAssignModal(true)}>Personel Ata</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setDeptForm({ name: '', color_class: 'bg-blue-600', description: '' }); setEditDept({}) }}>+ Yeni Bolum</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><div><div className="panel-title">BOLUMLER</div><div className="panel-subtitle">{deptSummary.length} BOLUM</div></div></div>
        <div className="panel-body">
          {deptSummary.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#127970;</div><div className="empty-title">BOLUM YOK</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {deptSummary.map(d => {
                const dc = deptColor(d.color_class)
                const pct = ((d.staff_count || 0) / maxCount) * 100
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <div style={{ width: '100px', flexShrink: 0 }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', background: dc.bg, color: dc.text, fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600 }}>{d.name}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{d.staff_count || 0} personel</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                          <span style={{ color: 'var(--blue)' }}>{'\u2642'}{d.male_count || 0}</span>{' '}<span style={{ color: '#f472b6' }}>{'\u2640'}{d.female_count || 0}</span>
                        </span>
                      </div>
                      <div className="prog-bar"><div className="prog-fill prog-blue" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setDeptForm({ name: d.name, color_class: d.color_class || 'bg-blue-600', description: d.description || '' }); setEditDept(d) }}>Duzenle</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`${d.name} bolumunu silmek istediginizden emin misiniz?`)) deleteDept.mutate(d.id) }}>Sil</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editDept !== null && (
        <ModalOverlay onClose={() => setEditDept(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{editDept.id ? 'BOLUM DUZENLE' : 'YENI BOLUM'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Bolum Adi</label><input className="form-input" value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="form-label">Aciklama</label><input className="form-input" value={deptForm.description} onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div>
              <label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map(c => { const dc = deptColor(c); return (<button key={c} onClick={() => setDeptForm(p => ({ ...p, color_class: c }))} style={{ width: '32px', height: '32px', borderRadius: '6px', background: dc.bg, border: `2px solid ${deptForm.color_class === c ? dc.text : 'transparent'}`, cursor: 'pointer' }} />) })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !deptForm.name ? 0.5 : 1 }} disabled={!deptForm.name}
              onClick={() => { if (editDept.id) updateDept.mutate({ id: editDept.id, ...deptForm }); else createDept.mutate(deptForm) }}>
              {editDept.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditDept(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {assignModal && (
        <ModalOverlay onClose={() => setAssignModal(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>PERSONEL BOLUM ATAMASI</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Personel</label><StaffSearch value={assignForm.staff_id} onChange={v => setAssignForm(p => ({ ...p, staff_id: v }))} /></div>
            <div><label className="form-label">Bolum</label>
              <select className="form-select" value={assignForm.dept_id} onChange={e => setAssignForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolum secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!assignForm.staff_id || !assignForm.dept_id) ? 0.5 : 1 }}
              disabled={!assignForm.staff_id || !assignForm.dept_id || assignMut.isPending}
              onClick={() => assignMut.mutate({ staff_id: parseInt(assignForm.staff_id), dept_id: parseInt(assignForm.dept_id) })}>
              {assignMut.isPending ? 'Ataniyor...' : 'Ata'}
            </button>
            <button className="btn btn-ghost" onClick={() => setAssignModal(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 6 — Takas (Swap)
// ═══════════════════════════════════════════════════════════════════════════════
function SwapTab() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ requester_id: '', target_id: '', swap_date: '', reason: '' })

  const { data: swaps = [] } = useQuery({ queryKey: ['swaps'], queryFn: () => api.get('/shifts/swaps').then(r => r.data) })
  const createSwap = useMutation({ mutationFn: data => api.post('/shifts/swaps', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['swaps'] }); setShowForm(false); setForm({ requester_id: '', target_id: '', swap_date: '', reason: '' }) }, onError: e => alert(e.response?.data?.error || 'Hata') })
  const approveMut = useMutation({ mutationFn: (id) => api.patch(`/shifts/swaps/${id}/approve`), onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }) })
  const rejectMut = useMutation({ mutationFn: (id) => api.patch(`/shifts/swaps/${id}/reject`), onSuccess: () => qc.invalidateQueries({ queryKey: ['swaps'] }) })

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Takas Talebi</button>
      </div>

      <div className="panel">
        <div className="panel-header"><div><div className="panel-title">VARDIYA TAKAS TALEPLERI</div><div className="panel-subtitle">{swaps.length} TALEP</div></div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {swaps.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#128260;</div><div className="empty-title">TAKAS YOK</div><div className="empty-sub">Henuz takas talebi yok</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Talep Eden</th><th>Hedef Kisi</th><th>Tarih</th><th>Sebep</th><th>Durum</th>{canApprove && <th>Islem</th>}</tr></thead>
              <tbody>
                {swaps.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: '12.5px' }}>{s.requester_name || `#${s.requester_id}`}</td>
                    <td style={{ fontSize: '12.5px' }}>{s.target_name || `#${s.target_id}`}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{s.swap_date ? formatDate(s.swap_date) : '\u2014'}</td>
                    <td style={{ color: 'var(--text2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.reason || '\u2014'}</td>
                    <td><span className={`badge ${SWAP_STATUS[s.status]?.badge || 'badge-gray'}`}>{SWAP_STATUS[s.status]?.label || s.status}</span></td>
                    {canApprove && (
                      <td>
                        {s.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={() => approveMut.mutate(s.id)} disabled={approveMut.isPending}>Onayla</button>
                            <button className="btn btn-danger btn-sm" onClick={() => rejectMut.mutate(s.id)} disabled={rejectMut.isPending}>Reddet</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>YENI TAKAS TALEBI</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Talep Eden Personel</label><StaffSearch value={form.requester_id} onChange={v => setForm(p => ({ ...p, requester_id: v }))} placeholder="Talep eden personeli ara..." /></div>
            <div><label className="form-label">Hedef Personel</label><StaffSearch value={form.target_id} onChange={v => setForm(p => ({ ...p, target_id: v }))} placeholder="Hedef personeli ara..." /></div>
            <div><label className="form-label">Takas Tarihi</label><input type="date" className="form-input" value={form.swap_date} onChange={e => setForm(p => ({ ...p, swap_date: e.target.value }))} /></div>
            <div><label className="form-label">Sebep</label><textarea className="form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} style={{ minHeight: '60px' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!form.requester_id || !form.target_id || !form.swap_date) ? 0.5 : 1 }}
              disabled={!form.requester_id || !form.target_id || !form.swap_date || createSwap.isPending}
              onClick={() => createSwap.mutate({ requester_id: parseInt(form.requester_id), target_id: parseInt(form.target_id), swap_date: form.swap_date, reason: form.reason })}>
              {createSwap.isPending ? 'Gonderiliyor...' : 'Gonder'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 7 — Ayarlar (Settings)
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsTab({ departments, shiftDefs }) {
  const qc = useQueryClient()
  const [defModal, setDefModal] = useState(null)
  const [defForm, setDefForm] = useState({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' })
  const [rotForm, setRotForm] = useState({ dept_id: '', staff_ids: '', shift_def_ids: '', start_date: '', weeks: '4' })

  const createDef = useMutation({ mutationFn: data => api.post('/shifts/definitions', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: e => alert(e.response?.data?.error || 'Hata') })
  const updateDef = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/definitions/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: e => alert(e.response?.data?.error || 'Hata') })
  const deleteDef = useMutation({ mutationFn: (id) => api.delete(`/shifts/definitions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-defs'] }) })
  const applyRotation = useMutation({ mutationFn: data => api.post('/shifts/schedule/rotation', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); alert('Rotasyon basariyla uygulandi.') }, onError: e => alert(e.response?.data?.error || 'Hata') })

  const DEF_COLORS = ['bg-blue-400', 'bg-orange-400', 'bg-indigo-600']

  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">VARDIYA TANIMLARI</div><div className="sect-line" /></div>

      <div className="panel" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div><div className="panel-title">VARDIYA TANIMLARI</div><div className="panel-subtitle">{shiftDefs.length} TANIM</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setDefForm({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' }); setDefModal({}) }}>+ Yeni Tanim</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {shiftDefs.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#9881;</div><div className="empty-title">TANIM YOK</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Renk</th><th>Ad</th><th>Baslangic</th><th>Bitis</th><th>Islem</th></tr></thead>
              <tbody>
                {shiftDefs.map(s => {
                  const sc = shiftColor(s.color_class)
                  return (
                    <tr key={s.id}>
                      <td><span style={{ width: '16px', height: '16px', borderRadius: '4px', background: sc.text, display: 'inline-block' }} /></td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{s.start_hour}:00</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setDefForm({ name: s.name, start_hour: s.start_hour?.toString() || '', end_hour: s.end_hour?.toString() || '', color_class: s.color_class || 'bg-blue-400' }); setDefModal(s) }}>Duzenle</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`${s.name} tanimini silmek istediginizden emin misiniz?`)) deleteDef.mutate(s.id) }}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="sect"><div className="sect-title">ROTASYON SABLONU</div><div className="sect-line" /></div>

      <div className="panel">
        <div className="panel-header"><div><div className="panel-title">ROTASYON UYGULA</div><div className="panel-subtitle">OTOMATIK VARDIYA CIZELGESI</div></div></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div><label className="form-label">Bolum</label>
              <select className="form-select" value={rotForm.dept_id} onChange={e => setRotForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolum secin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Baslangic Tarihi</label><input type="date" className="form-input" value={rotForm.start_date} onChange={e => setRotForm(p => ({ ...p, start_date: e.target.value }))} /></div>
            <div><label className="form-label">Personel ID'leri (virgul ile)</label><input className="form-input" value={rotForm.staff_ids} placeholder="1,2,3,4..." onChange={e => setRotForm(p => ({ ...p, staff_ids: e.target.value }))} /></div>
            <div><label className="form-label">Vardiya Tanimlari (virgul ile ID)</label><input className="form-input" value={rotForm.shift_def_ids} placeholder="1,2,3..." onChange={e => setRotForm(p => ({ ...p, shift_def_ids: e.target.value }))} /></div>
            <div><label className="form-label">Hafta Sayisi</label><input type="number" min="1" max="52" className="form-input" value={rotForm.weeks} onChange={e => setRotForm(p => ({ ...p, weeks: e.target.value }))} /></div>
          </div>

          {shiftDefs.length > 0 && (
            <div style={{ marginTop: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '7px', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>MEVCUT VARDIYA TANIMLARI</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {shiftDefs.map(s => {
                  const sc = shiftColor(s.color_class)
                  return (<span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '20px', background: sc.bg, color: sc.text, fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 600 }}>ID:{s.id} &mdash; {s.name}</span>)
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-primary"
              disabled={!rotForm.dept_id || !rotForm.start_date || !rotForm.staff_ids || !rotForm.shift_def_ids || applyRotation.isPending}
              style={{ opacity: (!rotForm.dept_id || !rotForm.start_date || !rotForm.staff_ids || !rotForm.shift_def_ids) ? 0.5 : 1 }}
              onClick={() => applyRotation.mutate({
                dept_id: parseInt(rotForm.dept_id), start_date: rotForm.start_date, weeks: parseInt(rotForm.weeks) || 4,
                staff_ids: rotForm.staff_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
                shift_def_ids: rotForm.shift_def_ids.split(',').map(s => parseInt(s.trim())).filter(Boolean),
              })}>
              {applyRotation.isPending ? 'Uygulaniyor...' : 'Rotasyonu Uygula'}
            </button>
          </div>
        </div>
      </div>

      {defModal !== null && (
        <ModalOverlay onClose={() => setDefModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{defModal.id ? 'VARDIYA TANIMINI DUZENLE' : 'YENI VARDIYA TANIMI'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Vardiya Adi</label><input className="form-input" value={defForm.name} onChange={e => setDefForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div><label className="form-label">Baslangic Saati</label><input type="number" min="0" max="23" className="form-input" value={defForm.start_hour} onChange={e => setDefForm(p => ({ ...p, start_hour: e.target.value }))} /></div>
              <div><label className="form-label">Bitis Saati</label><input type="number" min="0" max="24" className="form-input" value={defForm.end_hour} onChange={e => setDefForm(p => ({ ...p, end_hour: e.target.value }))} /></div>
            </div>
            <div><label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {DEF_COLORS.map(c => { const sc = shiftColor(c); return (<button key={c} onClick={() => setDefForm(p => ({ ...p, color_class: c }))} style={{ width: '32px', height: '32px', borderRadius: '6px', background: sc.bg, border: `2px solid ${defForm.color_class === c ? sc.text : 'transparent'}`, cursor: 'pointer' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: sc.text, display: 'inline-block' }} /></button>) })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!defForm.name || !defForm.start_hour || !defForm.end_hour) ? 0.5 : 1 }}
              disabled={!defForm.name || !defForm.start_hour || !defForm.end_hour}
              onClick={() => {
                const payload = { name: defForm.name, start_hour: parseInt(defForm.start_hour), end_hour: parseInt(defForm.end_hour), color_class: defForm.color_class }
                if (defModal.id) updateDef.mutate({ id: defModal.id, ...payload }); else createDef.mutate(payload)
              }}>
              {defModal.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setDefModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PuantajTab — Monthly Timesheet / Payroll
// ═══════════════════════════════════════════════════════════════════════════════
function PuantajTab({ departments, onPersonClick }) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [detailPopover, setDetailPopover] = useState(null) // { row, rect }
  const [sortBy, setSortBy] = useState('name') // name, worked, absent, salary, net

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  // Workdays in month (exclude Sundays)
  const workDays = useMemo(() => {
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(y, m - 1, d).getDay() !== 0) count++
    }
    return count
  }, [y, m, daysInMonth])

  const formatMoney = (val) => {
    if (!val) return '-'
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(val)
  }

  const calcDetails = useCallback((row) => {
    const dailyRate = row.salary ? row.salary / 30 : 0
    const basePay = dailyRate * (row.worked_days || 0)
    const overtimeRate = dailyRate * 1.5 / 8
    const overtimePay = overtimeRate * (row.overtime_hours || 0)
    const leavePay = dailyRate * (row.leave_days || 0) // paid leave
    const gross = basePay + overtimePay + leavePay
    const ssiDeduction = Math.round(gross * 0.14) // %14 SSI worker share
    const taxDeduction = Math.round(gross * 0.15) // %15 income tax (simplified)
    const net = Math.round(gross - ssiDeduction - taxDeduction)
    const attendRate = row.total_days > 0 ? Math.round(((row.worked_days || 0) / workDays) * 100) : 0
    return { dailyRate: Math.round(dailyRate), basePay: Math.round(basePay), overtimePay: Math.round(overtimePay), leavePay: Math.round(leavePay), gross: Math.round(gross), ssiDeduction, taxDeduction, net, attendRate }
  }, [workDays])

  const filtered = useMemo(() => {
    let list = rows
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.full_name?.toLowerCase().includes(q) || r.position?.toLowerCase().includes(q))
    }
    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'worked') return (b.worked_days || 0) - (a.worked_days || 0)
      if (sortBy === 'absent') return (b.absent_days || 0) - (a.absent_days || 0)
      if (sortBy === 'salary') return (b.salary || 0) - (a.salary || 0)
      if (sortBy === 'net') return calcDetails(b).net - calcDetails(a).net
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, search, sortBy, calcDetails])

  const totals = useMemo(() => {
    const t = filtered.reduce((acc, r) => {
      const d = calcDetails(r)
      return {
        worked: acc.worked + (r.worked_days || 0),
        scheduled: acc.scheduled + (r.scheduled_days || 0),
        leave: acc.leave + (r.leave_days || 0),
        absent: acc.absent + (r.absent_days || 0),
        overtime_hours: acc.overtime_hours + (r.overtime_hours || 0),
        gross: acc.gross + d.gross,
        net: acc.net + d.net,
        salary: acc.salary + (r.salary || 0),
      }
    }, { worked: 0, scheduled: 0, leave: 0, absent: 0, overtime_hours: 0, gross: 0, net: 0, salary: 0 })
    return t
  }, [filtered, calcDetails])

  const monthLabel = (() => {
    const d = new Date(y, m - 1, 1)
    return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase()
  })()

  const prevMonth = () => {
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Mini bar for attendance
  const AttendBar = ({ worked, total }) => {
    const pct = total > 0 ? Math.min(100, Math.round((worked / workDays) * 100)) : 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: 'var(--surface3)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--red)', transition: 'width .3s' }} />
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>%{pct}</span>
      </div>
    )
  }

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <button className="btn btn-ghost btn-sm" onClick={prevMonth}>&larr;</button>
        <div style={{ fontFamily: 'var(--display)', fontSize: '15px', color: 'var(--text)', letterSpacing: '1px' }}>
          {monthLabel}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={nextMonth}>&rarr;</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)}>Bu Ay</button>

        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input className="form-input" placeholder="Ara..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ width: '160px', padding: '5px 11px', fontSize: '11px' }} />

        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>
          {daysInMonth} GUN &middot; {workDays} IS GUNU
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'PERSONEL', value: filtered.length, color: 'var(--blue)' },
          { label: 'CALISAN GUN', value: totals.worked, color: 'var(--green)' },
          { label: 'PLANLI GUN', value: totals.scheduled, color: 'var(--blue)' },
          { label: 'IZIN GUN', value: totals.leave, color: 'var(--teal)' },
          { label: 'DEVAMSIZ', value: totals.absent, color: 'var(--red)' },
          { label: 'MESAI SAAT', value: totals.overtime_hours, color: 'var(--purple)' },
          { label: 'BRUT TOPLAM', value: formatMoney(totals.gross), color: 'var(--text)' },
          { label: 'NET TOPLAM', value: formatMoney(totals.net), color: 'var(--green)' },
        ].map((c, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '10px 12px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '3px' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '17px', color: c.color, letterSpacing: '1px' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">PUANTAJ TABLOSU</div>
            <div className="panel-subtitle">{filtered.length} PERSONEL &middot; {monthLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'name', label: 'AD' },
              { id: 'worked', label: 'CALISAN' },
              { id: 'absent', label: 'DEVAMSIZ' },
              { id: 'net', label: 'UCRET' },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                className={`filter-chip ${sortBy === s.id ? 'active' : ''}`}
                style={{ fontSize: '9px', padding: '3px 8px' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Yukleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#128203;</div>
              <div className="empty-title">KAYIT YOK</div>
              <div className="empty-desc">Bu ay icin puantaj verisi bulunamadi.</div>
            </div>
          ) : (
            <table className="data-table" style={{ fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 2, minWidth: '140px' }}>AD SOYAD</th>
                  <th>DEPT</th>
                  <th style={{ textAlign: 'center' }}>DEVAM</th>
                  <th style={{ textAlign: 'center', color: 'var(--green)' }}>IS</th>
                  <th style={{ textAlign: 'center', color: 'var(--teal)' }}>IZIN</th>
                  <th style={{ textAlign: 'center', color: 'var(--red)' }}>YOK</th>
                  <th style={{ textAlign: 'center', color: 'var(--purple)' }}>MESAI</th>
                  <th style={{ textAlign: 'right' }}>BRUT</th>
                  <th style={{ textAlign: 'right' }}>NET</th>
                  <th style={{ textAlign: 'center', width: '40px' }}>+</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const d = calcDetails(r)
                  const dc = deptColor(r.dept_color)
                  return (
                    <tr key={r.id}>
                      <td style={{
                        position: 'sticky', left: 0, background: 'var(--surface)',
                        zIndex: 1, cursor: 'pointer',
                      }}
                        onClick={() => onPersonClick?.(r.id)}
                      >
                        <div style={{ fontWeight: 600, fontSize: '11px' }}>{r.full_name}</div>
                        {r.position && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{r.position}</div>}
                      </td>
                      <td>
                        {r.dept_name ? (
                          <span style={{
                            padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: 600,
                            background: dc.bg, color: dc.text, whiteSpace: 'nowrap',
                          }}>{r.dept_name}</span>
                        ) : <span style={{ color: 'var(--text3)' }}>-</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}><AttendBar worked={r.worked_days || 0} total={r.total_days || 0} /></td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{r.worked_days || 0}</td>
                      <td style={{ textAlign: 'center', color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{r.leave_days || 0}</td>
                      <td style={{ textAlign: 'center', color: r.absent_days > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: r.absent_days > 0 ? 700 : 400, fontFamily: 'var(--mono)' }}>{r.absent_days || 0}</td>
                      <td style={{ textAlign: 'center', color: r.overtime_hours > 0 ? 'var(--purple)' : 'var(--text3)', fontFamily: 'var(--mono)', fontWeight: r.overtime_hours > 0 ? 700 : 400 }}>{r.overtime_hours || 0}s</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>{formatMoney(d.gross)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: d.net > 0 ? 'var(--green)' : 'var(--text3)' }}>{formatMoney(d.net)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '9px', padding: '2px 5px' }}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setDetailPopover({ row: r, details: d, rect })
                          }}>
                          Detay
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface2)', zIndex: 1 }}>TOPLAM ({filtered.length})</td>
                  <td />
                  <td />
                  <td style={{ textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{totals.worked}</td>
                  <td style={{ textAlign: 'center', color: 'var(--teal)', fontFamily: 'var(--mono)' }}>{totals.leave}</td>
                  <td style={{ textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{totals.absent}</td>
                  <td style={{ textAlign: 'center', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>{totals.overtime_hours}s</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '10px' }}>{formatMoney(totals.gross)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)' }}>{formatMoney(totals.net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Detail — side panel */}
      {detailPopover && (
        <SidePanel
          title="MAAS DETAYI"
          subtitle={`${detailPopover.row.full_name} · ${monthLabel}`}
          icon="&#128176;"
          onClose={() => setDetailPopover(null)}
          width={340}
          anchorRect={detailPopover.rect}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {[
              { label: 'Brut Maas', value: formatMoney(detailPopover.row.salary), color: 'var(--text)' },
              { label: `Gunluk Ucret (maas/30)`, value: formatMoney(detailPopover.details.dailyRate), color: 'var(--text2)' },
              { label: `Calisilan Gun (${detailPopover.row.worked_days || 0})`, value: formatMoney(detailPopover.details.basePay), color: 'var(--green)' },
              { label: `Izin Gunu (${detailPopover.row.leave_days || 0})`, value: formatMoney(detailPopover.details.leavePay), color: 'var(--teal)' },
              { label: `Mesai (${detailPopover.row.overtime_hours || 0}s x1.5)`, value: formatMoney(detailPopover.details.overtimePay), color: 'var(--purple)' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text2)' }}>{item.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: item.color }}>{item.value}</span>
              </div>
            ))}

            <div style={{ paddingTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text)' }}>Brut Toplam</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '15px' }}>{formatMoney(detailPopover.details.gross)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--red)', fontSize: '12px' }}>SGK (%14)</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontSize: '12px' }}>-{formatMoney(detailPopover.details.ssiDeduction)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--red)', fontSize: '12px' }}>Gelir Vergisi (%15)</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontSize: '12px' }}>-{formatMoney(detailPopover.details.taxDeduction)}</span>
              </div>
            </div>

            <div style={{ background: 'rgba(39,201,106,.08)', border: '1px solid rgba(39,201,106,.25)', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--display)', letterSpacing: '1px', fontSize: '13px', color: 'var(--text)' }}>NET UCRET</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '18px', color: 'var(--green)' }}>{formatMoney(detailPopover.details.net)}</span>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <div style={{ flex: 1, padding: '10px', background: 'var(--surface2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700, color: 'var(--blue)' }}>%{detailPopover.details.attendRate}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Devam</div>
              </div>
              <div style={{ flex: 1, padding: '10px', background: 'var(--surface2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700, color: 'var(--red)' }}>{detailPopover.row.absent_days || 0}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Devamsiz Gun</div>
              </div>
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
  { id: 'swap',        icon: '🔄', label: 'Takas' },
  { id: 'departments', icon: '🏢', label: 'Bölümler' },
  { id: 'settings',    icon: '⚙️', label: 'Ayarlar' },
]

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState('schedule')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [navExpanded, setNavExpanded] = useState(false)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })

  const handlePersonClick = useCallback((id) => {
    setSelectedStaff(id)
  }, [])

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)

  return (
    <div className="fade-up" style={{ display: 'flex', height: '100%', margin: '-32px -40px', minHeight: 'calc(100vh - 60px)', position: 'relative' }}>

      {/* ── Left navigation sidebar ── */}
      <nav style={{
        width: navExpanded ? '180px' : '64px',
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .2s ease',
        overflow: 'hidden',
        zIndex: 20,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
      }}>
        {/* Logo / toggle */}
        <button
          onClick={() => setNavExpanded(p => !p)}
          style={{
            padding: '18px 0', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: navExpanded ? 'flex-start' : 'center',
            paddingLeft: navExpanded ? '20px' : 0,
            borderBottom: '1px solid var(--border)',
            gap: '10px',
          }}
          title="Menüyü genişlet"
        >
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
          {navExpanded && (
            <span style={{ fontFamily: 'var(--display)', fontSize: '11px', letterSpacing: '2px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              VARDİYA
            </span>
          )}
        </button>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  width: '100%', padding: '12px 0',
                  paddingLeft: navExpanded ? '16px' : 0,
                  background: active ? 'rgba(240,165,0,.12)' : 'none',
                  border: 'none',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: navExpanded ? 'flex-start' : 'center',
                  gap: '10px',
                  transition: 'all .15s',
                }}
                title={item.label}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
                {navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap',
                  }}>
                    {item.label.toUpperCase()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
          padding: '0 28px',
          display: 'flex', alignItems: 'center', gap: '12px',
          minHeight: '56px',
          boxShadow: '0 2px 8px rgba(0,0,0,.2)',
        }}>
          <span style={{ fontSize: '22px' }}>{activeNav?.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '3px', color: 'var(--text)' }}>
              {activeNav?.label?.toUpperCase() || 'VARDİYA'}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '1px' }}>
              VARDİYA YÖNETİM SİSTEMİ
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {activeTab === 'schedule'    && <ScheduleTab departments={departments} shiftDefs={shiftDefs} onPersonClick={handlePersonClick} />}
          {activeTab === 'staff'       && <StaffTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'leave'       && <LeaveTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'overtime'    && <OvertimeTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'puantaj'     && <PuantajTab departments={departments} onPersonClick={handlePersonClick} />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'swap'        && <SwapTab />}
          {activeTab === 'settings'    && <SettingsTab departments={departments} shiftDefs={shiftDefs} />}
        </div>
      </div>

      {/* Staff detail side panel */}
      {selectedStaff && (
        <StaffDetailPanel staffId={selectedStaff} onClose={() => setSelectedStaff(null)} />
      )}
    </div>
  )
}
