import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

// Tek noktadan toast ile hata gosterimi — onError callback'lerinde alert yerine bunu cagir.
// Module-level fonksiyon: closure'a bagimli degil, callback'lerde stale ref riski yok.
const toastErr = (e) => {
  useToastStore.getState().addToast(e?.response?.data?.error || 'Hata', 'error')
}
const toastOk = (msg) => useToastStore.getState().addToast(msg, 'success')

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

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1054,
          background: 'rgba(0,0,0,0.6)',
          animation: 'fadeIn .2s ease',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1055,
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
    </>,
    document.body
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); qc.invalidateQueries({ queryKey: ['schedule'] }); setActiveForm(null); setFormData({}) },
    onError: toastErr,
  })

  const addLeaveMut = useMutation({
    mutationFn: d => api.post('/shifts/leave', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff-detail', staffId] }); setActiveForm(null); setFormData({}) },
    onError: toastErr,
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
                        {shiftDefs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.start_hour}:00–{d.end_hour === 24 ? '00' : d.end_hour}:00)</option>)}
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

            {/* VARDİYA */}
            {!activeForm && detailTab === 'shifts' && (() => {
              const filtered = shiftFilter ? shiftHistory.filter(s => s.status === shiftFilter) : shiftHistory
              const visible = filtered.slice(0, shiftPage)
              const STATUS_C = { worked: 'var(--green)', scheduled: 'var(--blue)', on_leave: 'var(--purple)', absent: 'var(--red)', overtime: 'var(--accent)' }
              const STATUS_L = { worked: 'Çalıştı', scheduled: 'Planlandı', on_leave: 'İzinli', absent: 'Gelmedi', overtime: 'Mesai' }
              return (
                <div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[['', 'TÜM'], ['worked','ÇALIŞTI'], ['scheduled','PLANLI'], ['on_leave','İZİNLİ'], ['absent','YOK']].map(([k, l]) => (
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
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00</span>
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
                {leaveHistory.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>İzin kaydı yok</div>
                ) : leaveHistory.map((l, i) => {
                  const bandColor = l.status === 'approved' ? 'var(--green)' : l.status === 'rejected' ? 'var(--red)' : 'var(--accent)'
                  return (
                    <div key={`leave-${l.id || i}`} style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      <div style={{ width: 4, background: bandColor, flexShrink: 0 }} />
                      <div style={{ padding: '10px 14px', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span className={`badge ${LEAVE_TYPES[l.leave_type]?.badge || 'badge-gray'}`} style={{ fontSize: 8 }}>{LEAVE_TYPES[l.leave_type]?.label || l.leave_type}</span>
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

function StaffFormSheet({ editStaff, form, setForm, handleSubmit, createMut, updateMut, departments, onClose }) {
  const [tab, setTab] = useState('temel')
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const isPending = createMut.isPending || updateMut.isPending
  const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-']

  return (
    <BottomSheet onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '0 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>
            {editStaff ? '✏️ PERSONEL DÜZENLE' : '➕ YENİ PERSONEL'}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['temel', 'Temel Bilgiler'], ['detay', 'Detaylar']].map(([id, label]) => (
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {tab === 'temel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
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
              <label className="form-label">Telefon</label>
              <input className="form-input" type="tel" value={form.phone || ''} placeholder="05XX XXX XXXX"
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">E-posta</label>
              <input className="form-input" type="email" value={form.email || ''}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Pozisyon</label>
              <input className="form-input" value={form.position || ''} placeholder="Örneğin: Güvenlik Görevlisi"
                onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={form.department_id || ''}
                onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">Departman seçin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">İşe Giriş Tarihi</label>
              <input type="date" className="form-input" value={form.hire_date || ''}
                onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))} />
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
        )}

        {tab === 'detay' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label">Doğum Tarihi</label>
              <input type="date" className="form-input" value={form.birth_date || ''}
                onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Adres</label>
              <input className="form-input" value={form.address || ''}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Kişisi</label>
              <input className="form-input" value={form.emergency_contact || ''}
                onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Telefonu</label>
              <input className="form-input" type="tel" value={form.emergency_phone || ''}
                onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Kan Grubu</label>
              <select className="form-select" value={form.blood_type || ''}
                onChange={e => setForm(p => ({ ...p, blood_type: e.target.value }))}>
                <option value="">Seçin...</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Cinsiyet</label>
              <select className="form-select" value={form.gender || 'male'}
                onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
              </select>
            </div>
            <div>
              <label className="form-label">Maaş (TL)</label>
              <input type="number" className="form-input" value={form.salary || ''}
                onChange={e => setForm(p => ({ ...p, salary: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Notlar</label>
              <textarea className="form-textarea" value={form.notes || ''} rows={3}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px' }}>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '8px' }}>{error}</div>}
        <button className="btn btn-primary" style={{ flex: 1, opacity: !form.full_name ? 0.5 : 1 }}
          disabled={!form.full_name || isPending}
          onClick={() => { setError(null); handleSubmit() }}>
          {isPending ? 'Kaydediliyor...' : editStaff ? 'Güncelle' : 'Kaydet'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>İptal</button>
      </div>
    </BottomSheet>
  )
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
    onError: toastErr,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/staff/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      qc.invalidateQueries({ queryKey: ['staff-detail'] })
      setEditStaff(null)
      setForm({})
    },
    onError: toastErr,
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
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--text2)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--text)', lineHeight: 1 }}>{staffList.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>TOPLAM PERSONEL</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--blue)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--blue)', lineHeight: 1 }}>{maleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>ERKEK</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid #f472b6' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: '#f472b6', lineHeight: 1 }}>{femaleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>KADIN</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--green)' }}>
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
                borderRadius: '14px', overflow: 'hidden',
                transition: 'box-shadow .2s, transform .15s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,.25)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
              >
                {/* Card header — dept color stripe */}
                <div style={{ height: 4, background: dc.bg || 'var(--border)' }} />

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
                        onClick={async e => { e.stopPropagation(); if (await confirmDialog({ title: 'Personeli Pasifleştir', body: `${s.full_name} pasif yapılsın mı?`, confirmLabel: 'Pasifleştir', danger: true })) deleteMut.mutate(s.id) }}
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

      {/* Create/Edit Sheet */}
      {showForm && (
        <StaffFormSheet
          editStaff={editStaff}
          form={form}
          setForm={setForm}
          handleSubmit={handleSubmit}
          createMut={createMut}
          updateMut={updateMut}
          departments={departments}
          onClose={() => { setShowForm(false); setEditStaff(null) }}
        />
      )}
    </div>
  )
}

// ─── Daily View ───────────────────────────────────────────────────────────────
function DailyView({ departments, date, onDateChange }) {
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
      } else if (row.shift_status === 'on_leave') {
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

function WeekFillSheet({ weekFillPopover, setWeekFillPopover, shiftDefs, weekFillDef, setWeekFillDef, weekFillOffDay, setWeekFillOffDay, fillWeek, weekStart, weekEnd, formatDate, shiftColor }) {
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
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>İZİN GÜNÜ</div>
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
          {fillWeek.isPending ? 'Dolduruluyor...' : '6 Gün Doldur + 1 İzin'}
        </button>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '8px' }}>{error}</div>}
      </div>
    </BottomSheet>
  )
}

function CellAssignSheet({ cellPopover, setCellPopover, shiftDefs, assignCell, deleteShift, formatDate, shortDay, shiftColor }) {
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

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — Cizelge (Schedule) — HAFTA DOLDUR + PAZAR IZIN + PUANTAJ
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleTab({ departments, shiftDefs, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [deptFilter, setDeptFilter] = useState('')
  const [scheduleView, setScheduleView] = useState('weekly') // 'weekly' | 'daily'
  const [dailyDate, setDailyDate] = useState(todayStr())
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsRect, setToolsRect] = useState(null)
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
  const [dragShiftId, setDragShiftId] = useState(null)    // drag'deki shiftDefId
  const [dragOverCell, setDragOverCell] = useState(null)  // 'staffId-date' format

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setCellPopover(null) },
    onError: (err) => {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Vardiya atanamadı', 'error')
    },
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
      const ExcelJS = (await import('exceljs')).default
      const buf = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      if (!ws) { setExcelError('Boş dosya'); return }
      const rows = []
      ws.eachRow(row => {
        rows.push(row.values.slice(1).map(v => {
          if (v == null) return ''
          if (typeof v === 'object' && v.text != null) return v.text
          if (typeof v === 'object' && v.result != null) return v.result
          return v
        }))
      })
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
    const existing = person.days[date]
    setCellPopover({ staffId: person.id, deptId: person.dept_id, date, personName: person.full_name, existing })
  }

  const openWeekFill = (e, person) => {
    if (!canEdit) return
    setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
    setWeekFillOffDay(6) // default Sunday
    setWeekFillPopover({ person })
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

  useEffect(() => {
    if (!toolsOpen) return
    const handler = (e) => {
      setToolsOpen(false)
      setToolsRect(null)
    }
    // setTimeout to skip the same click event that opened the dropdown
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [toolsOpen])

  return (
    <div className="fade-up">

      {/* ── Top control bar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px',
        marginBottom: '20px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '12px 16px',
      }}>
        {/* Hafta navigasyonu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <div style={{ textAlign: 'center', minWidth: '160px', background: 'var(--surface2)', borderRadius: '10px', padding: '4px 16px' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '15px', letterSpacing: '1px', color: 'var(--text)' }}>
              {formatDate(weekStart)} — {formatDate(weekEnd)}
            </div>
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            cursor: 'pointer', fontSize: '14px', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
          <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
            background: 'rgba(240,165,0,.15)', border: '1px solid rgba(240,165,0,.4)',
            cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--mono)',
          }}>Bugün</button>
        </div>

        {/* View toggle: HAFTALIK / GÜNLÜK */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className={`filter-chip${scheduleView === 'weekly' ? ' active' : ''}`}
            onClick={() => setScheduleView('weekly')}
          >HAFTALIK</button>
          <button
            className={`filter-chip${scheduleView === 'daily' ? ' active' : ''}`}
            onClick={() => { setScheduleView('daily'); setDailyDate(typeof todayStr === 'function' ? todayStr() : todayStr) }}
          >GÜNLÜK</button>
        </div>

        {/* Dept filter */}
        <select className="form-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}>
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Araçlar dropdown */}
        {canEdit && (
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={e => {
                if (toolsOpen) {
                  setToolsOpen(false); setToolsRect(null)
                } else {
                  setToolsRect(e.currentTarget.getBoundingClientRect())
                  setToolsOpen(true)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)',
              }}
            >
              <span style={{ fontSize: '16px', letterSpacing: '-1px' }}>⋯</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>Araçlar</span>
              <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
            </button>

            {toolsOpen && toolsRect && createPortal(
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: toolsRect.bottom + 4,
                  right: window.innerWidth - toolsRect.right,
                  zIndex: 100,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                  minWidth: '200px',
                  overflow: 'hidden',
                }}
              >
                {[
                  { label: 'Toplu Vardiya Doldur', action: () => { setBulkFillModal(true); setToolsOpen(false) } },
                  { label: 'Tüm Personeli Doldur', action: () => { setAllFillDef(shiftDefs[0]?.id?.toString() || ''); setAllFillModal(true); setToolsOpen(false) } },
                  { label: 'Haftayı Kopyala', action: async () => { if (await confirmDialog('Bu haftayı sonraki haftaya kopyalayalım mı?')) { copyWeek.mutate(); setToolsOpen(false) } } },
                  { label: 'Excel Import', action: () => { setExcelModal(true); setExcelPreview(null); setExcelError(''); setToolsOpen(false) } },
                  { label: '+ Çizelgeye Personel Ekle', action: () => { setAddPersonModal(true); setToolsOpen(false) } },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: '13px', color: 'var(--text2)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{label}</button>
                ))}
              </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {/* ── Shift palette (D&D) ── */}
      {scheduleView === 'weekly' && canEdit && !('ontouchstart' in window) && (
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '12px',
          padding: '8px 12px', background: 'var(--surface2)',
          borderRadius: '8px', border: '1px solid var(--border)',
          alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginRight: '4px' }}>
            SÜRÜKLE:
          </span>
          {shiftDefs.map(s => {
            const sc = shiftColor(s.color_class)
            return (
              <div
                key={s.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('shiftDefId', String(s.id))
                  setDragShiftId(s.id)
                }}
                onDragEnd={() => setDragShiftId(null)}
                style={{
                  padding: '5px 12px', borderRadius: '6px',
                  background: sc.bg, color: sc.text,
                  fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
                  cursor: 'grab', userSelect: 'none',
                  border: `1px solid ${sc.text}33`,
                }}
              >
                {s.name} {s.start_hour}–{s.end_hour === 24 ? '00' : s.end_hour}
              </div>
            )
          })}
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('shiftDefId', 'delete'); setDragShiftId('delete') }}
            onDragEnd={() => setDragShiftId(null)}
            style={{
              padding: '5px 12px', borderRadius: '6px',
              background: 'rgba(231,76,60,.12)', color: 'var(--red)',
              fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
              cursor: 'grab', userSelect: 'none',
              border: '1px solid rgba(231,76,60,.3)',
            }}
          >
            ✕ Sil
          </div>
        </div>
      )}

      {/* View: GÜNLÜK */}
      {scheduleView === 'daily' && (
        <DailyView
          departments={departments}
          date={dailyDate}
          onDateChange={setDailyDate}
        />
      )}

      {/* View: HAFTALIK */}
      {scheduleView === 'weekly' && (
      <>
      {/* ── Schedule grid ── */}
      {isLoading ? (
        <div className="empty-state"><div className="empty-sub">Yükleniyor...</div></div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,.15)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            {/* Header row */}
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  background: 'var(--surface2)', borderRight: '2px solid var(--border)',
                  padding: '12px 16px', minWidth: '180px', textAlign: 'left',
                  borderBottom: '2px solid var(--border)',
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
                      borderBottom: isToday ? '2px solid var(--blue)' : sun ? '2px solid var(--accent)' : '2px solid var(--border)',
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
                  <tr key={person.id} style={{ borderTop: '1px solid var(--border)', background: rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--surface)', borderLeft: `3px solid ${dc.bg || 'transparent'}` }}>
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
                          width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
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
                        <td key={d}
                          onDragOver={e => {
                            if (!canEdit || !dragShiftId || 'ontouchstart' in window) return
                            if (assignCell.isPending) return
                            e.preventDefault()
                            setDragOverCell(`${person.id}-${d}`)
                          }}
                          onDragLeave={() => setDragOverCell(null)}
                          onDrop={e => {
                            e.preventDefault()
                            setDragOverCell(null)
                            if (!canEdit || assignCell.isPending) return
                            const rawId = e.dataTransfer.getData('shiftDefId')
                            setDragShiftId(null)
                            if (rawId === 'delete') {
                              deleteShift.mutate({ staffId: person.id, date: d })
                            } else {
                              const shiftDefId = parseInt(rawId)
                              assignCell.mutate({ staffId: person.id, deptId: person.dept_id, shiftDefId, date: d, status: 'scheduled' })
                            }
                          }}
                          style={{
                            padding: '6px 4px', textAlign: 'center',
                            borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                            background: dragOverCell === `${person.id}-${d}`
                              ? 'rgba(240,165,0,.15)'
                              : isToday ? 'rgba(59,140,240,.04)' : sun ? 'rgba(240,165,0,.03)' : 'transparent',
                            transition: 'background .1s',
                            outline: dragOverCell === `${person.id}-${d}` ? '2px dashed rgba(240,165,0,.6)' : 'none',
                          }}>
                          <button
                            onClick={e => openCellPopover(e, person, d)}
                            disabled={!canEdit}
                            style={{
                              width: '100%', minHeight: pillLabel ? '58px' : '54px', padding: '6px 4px',
                              borderRadius: '8px', border: pillLabel ? 'none' : `1px dashed ${canEdit ? 'var(--border)' : 'transparent'}`,
                              cursor: canEdit ? 'pointer' : 'default',
                              background: pillBg,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                              transition: 'filter .15s, transform .1s',
                            }}
                            onMouseEnter={e => {
                              if (canEdit) {
                                e.currentTarget.style.filter = 'brightness(1.15)'
                                if (!pillLabel) e.currentTarget.style.borderStyle = 'solid'
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.filter = 'none'
                              if (!pillLabel) e.currentTarget.style.borderStyle = 'dashed'
                            }}
                          >
                            {pillLabel ? (
                              <>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px', color: pillColor, fontWeight: 700 }}>
                                  {pillLabel}
                                </span>
                                {pillSub && (
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pillColor, opacity: .7 }}>
                                    {pillSub}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '18px', color: 'var(--border)', opacity: canEdit ? 0.3 : 0 }}>+</span>
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
      </>
      )}

      {/* Cell panel — vardiya/izin atama */}
      {cellPopover && (
        <CellAssignSheet
          cellPopover={cellPopover}
          setCellPopover={setCellPopover}
          shiftDefs={shiftDefs}
          assignCell={assignCell}
          deleteShift={deleteShift}
          formatDate={formatDate}
          shortDay={shortDay}
          shiftColor={shiftColor}
        />
      )}

      {/* Week fill panel */}
      {weekFillPopover && (
        <WeekFillSheet
          weekFillPopover={weekFillPopover}
          setWeekFillPopover={setWeekFillPopover}
          shiftDefs={shiftDefs}
          weekFillDef={weekFillDef}
          setWeekFillDef={setWeekFillDef}
          weekFillOffDay={weekFillOffDay}
          setWeekFillOffDay={setWeekFillOffDay}
          fillWeek={fillWeek}
          weekStart={weekStart}
          weekEnd={weekEnd}
          formatDate={formatDate}
          shiftColor={shiftColor}
        />
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
                  setWeekFillDef(shiftDefs[0]?.id?.toString() || '')
                  setWeekFillOffDay(6)
                  setWeekFillPopover({ person: { id: s.id, full_name: s.full_name, dept_id: s.department_id, dept_name: s.dept_name } })
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
    onError: toastErr,
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
    onError: toastErr,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/overtime/${id}`, data),
    onSuccess: () => { invalidateAll(); setEditRecord(null) },
    onError: toastErr,
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
                              onClick={async () => { if (await confirmDialog({ title: 'Mesai Kaydı Sil', body: 'Bu mesai kaydını silmek istediğinizden emin misiniz?', danger: true })) deleteMut.mutate(r.id) }}>
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
                onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Bu kayıt silinsin mi?', danger: true })) deleteMut.mutate(editRecord.id) }}>
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

  const createDept = useMutation({ mutationFn: data => api.post('/shifts/departments', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }); setEditDept(null) }, onError: toastErr })
  const updateDept = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/departments/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }); setEditDept(null) }, onError: toastErr })
  const deleteDept = useMutation({ mutationFn: (id) => api.delete(`/shifts/departments/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['departments-summary'] }) } })
  const assignMut = useMutation({ mutationFn: data => api.post('/shifts/departments/assign', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments-summary'] }); qc.invalidateQueries({ queryKey: ['staff-list'] }); setAssignModal(false); setAssignForm({ staff_id: '', dept_id: '' }) }, onError: toastErr })

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
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Bölüm Sil', body: `${d.name} bölümünü silmek istediğinizden emin misiniz?`, danger: true })) deleteDept.mutate(d.id) }}>Sil</button>
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
  const createSwap = useMutation({ mutationFn: data => api.post('/shifts/swaps', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['swaps'] }); setShowForm(false); setForm({ requester_id: '', target_id: '', swap_date: '', reason: '' }) }, onError: toastErr })
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

  const createDef = useMutation({ mutationFn: data => api.post('/shifts/definitions', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: toastErr })
  const updateDef = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/definitions/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: toastErr })
  const deleteDef = useMutation({ mutationFn: (id) => api.delete(`/shifts/definitions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-defs'] }) })
  const applyRotation = useMutation({ mutationFn: data => api.post('/shifts/schedule/rotation', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); toastOk('Rotasyon başarıyla uygulandı') }, onError: toastErr })

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
                          <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Tanımı Sil', body: `${s.name} tanımını silmek istediğinizden emin misiniz?`, danger: true })) deleteDef.mutate(s.id) }}>Sil</button>
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
//  PuantajTab — Professional Payroll / Monthly Timesheet
// ═══════════════════════════════════════════════════════════════════════════════
const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'YYS Kampüs'

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

function PuantajCalendarView({ filtered, month, y, m, isLoading }) {
  const [dayData, setDayData] = useState({}) // staffId → days array

  const daysInMonth = new Date(y, m, 0).getDate()
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const loadedIds = useRef(new Set())

  // When calendar view loads, lazy-fetch day breakdowns for all staff
  useEffect(() => {
    filtered.forEach(r => {
      if (loadedIds.current.has(r.id)) return
      loadedIds.current.add(r.id)
      api.get(`/shifts/puantaj/${r.id}/days`, { params: { month } })
        .then(res => setDayData(prev => ({ ...prev, [r.id]: res.data })))
        .catch(() => { loadedIds.current.delete(r.id) }) // allow retry on error
    })
  }, [filtered, month])

  const STATUS_COLORS = {
    worked: { bg: 'var(--green)', text: '#fff' },
    absent: { bg: 'transparent', text: 'var(--red)' },
    on_leave: { bg: 'rgba(167,139,250,.2)', text: 'var(--purple)' },
    overtime: { bg: 'rgba(240,165,0,.2)', text: 'var(--accent)' },
    scheduled: { bg: 'var(--surface3)', text: 'var(--text3)' },
    sunday: { bg: 'transparent', text: 'var(--border)' },
    no_record: { bg: 'transparent', text: 'transparent' },
  }

  const STATUS_SYMBOL = { worked: '▓', absent: '✗', on_leave: 'İ', overtime: 'M', scheduled: '·', sunday: '', no_record: '' }

  // Sunday indices (day of week for day 1)
  const sundayDays = new Set(dayNumbers.filter(d => new Date(y, m - 1, d).getDay() === 0))

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Yükleniyor...</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, minWidth: '140px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              PERSONEL
            </th>
            {dayNumbers.map(d => (
              <th key={d} style={{
                width: '24px', textAlign: 'center', padding: '4px 0',
                borderBottom: '1px solid var(--border)',
                color: sundayDays.has(d) ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: '9px',
              }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const days = dayData[r.id] || []
            const dayMap = {}
            days.forEach(d => { dayMap[d.date.split('-')[2]] = d })

            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '4px 8px', fontWeight: '500', zIndex: 1 }}>
                  <div>{r.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{r.dept_name}</div>
                </td>
                {dayNumbers.map(d => {
                  const dayStr = String(d).padStart(2, '0')
                  const entry = dayMap[dayStr]
                  const status = entry?.status || (sundayDays.has(d) ? 'sunday' : 'no_record')
                  const c = STATUS_COLORS[status] || STATUS_COLORS.no_record
                  const sym = STATUS_SYMBOL[status] || ''
                  return (
                    <td key={d} title={entry?.shift_name || entry?.leave_type || status}
                      style={{
                        width: '24px', textAlign: 'center', padding: '2px 0',
                        background: c.bg, color: c.text,
                        fontSize: status === 'worked' ? '11px' : '12px',
                      }}>
                      {sym}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PuantajListView({ filtered, totals, isLoading, month, monthLabel, showEmployer, sortBy, setSortBy, formatMoney, onRowClick }) {
  const SORTS = [{ id: 'name', label: 'AD' }, { id: 'worked', label: 'ÇALIŞTI' }, { id: 'absent', label: 'DEVAMSIZ' }, { id: 'net', label: 'NET' }]

  if (isLoading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Yükleniyor...</div>
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
              <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Yükleniyor...</div>
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
                  {[['worked','Çalıştı','var(--green)'],['absent','Devamsız','var(--red)'],['on_leave','İzin','var(--purple)'],['overtime','Mesai','var(--accent)']].map(([s,label,color]) => (
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

function PuantajTab({ departments }) {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'calendar' | 'summary'
  const [showEmployer, setShowEmployer] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null) // row object for bordro detail
  const [sortBy, setSortBy] = useState('name')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['puantaj', month, deptFilter],
    queryFn: () => {
      const params = { month }
      if (deptFilter) params.dept_id = deptFilter
      return api.get('/shifts/puantaj', { params }).then(r => r.data)
    },
  })

  const [y, m] = month.split('-').map(Number)

  const formatMoney = (val) => {
    if (val == null || val === 0) return '—'
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' ₺'
  }

  const filtered = useMemo(() => {
    let list = rows
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.full_name?.toLowerCase().includes(q) || r.dept_name?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'worked') return (b.worked_days || 0) - (a.worked_days || 0)
      if (sortBy === 'absent') return (b.absent_days || 0) - (a.absent_days || 0)
      if (sortBy === 'net') return (b.net || 0) - (a.net || 0)
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    })
  }, [rows, search, sortBy])

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
        </div>
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
        <PuantajCalendarView filtered={filtered} month={month} y={y} m={m} isLoading={isLoading} />
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

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN — ShiftsPage
// ═══════════════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { id: 'schedule',    icon: '📅', label: 'Çizelge' },
  { id: 'staff',       icon: '👥', label: 'Personel' },
  { id: 'leave',       icon: '🏖️', label: 'İzinler' },
  { id: 'overtime',    icon: '⏰', label: 'Mesai' },
  { id: 'puantaj',     icon: '📊', label: 'Puantaj' },
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

  const { data: pendingLeaves = [] } = useQuery({
    queryKey: ['leaves', 'badge'],
    queryFn: () => api.get('/shifts/leave?status=pending').then(r => r.data),
    staleTime: 60000,
  })
  const pendingLeaveCount = pendingLeaves.length

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
        background: 'linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 95%, var(--accent)) 100%)',
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
            const badge = item.id === 'leave' && pendingLeaveCount > 0 ? pendingLeaveCount : 0
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  width: '100%', padding: '12px 0',
                  paddingLeft: navExpanded ? '16px' : 0,
                  background: active ? 'rgba(240,165,0,.18)' : 'none',
                  border: 'none',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(240,165,0,.3)' : 'none',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: navExpanded ? 'flex-start' : 'center',
                  gap: '10px',
                  transition: 'all .15s',
                  position: 'relative',
                }}
                title={item.label}
              >
                {/* İkon + collapsed badge (küçük nokta) */}
                <span style={{ fontSize: '18px', flexShrink: 0, filter: active ? 'drop-shadow(0 0 6px var(--accent))' : 'none', position: 'relative' }}>
                  {item.icon}
                  {badge > 0 && !navExpanded && (
                    <span style={{
                      position: 'absolute', top: '-2px', right: '-4px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--red)', border: '1px solid var(--bg)',
                    }} />
                  )}
                </span>
                {navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                    color: active ? 'var(--accent)' : 'var(--text2)',
                    fontWeight: active ? 700 : 400,
                    whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {item.label.toUpperCase()}
                  </span>
                )}
                {/* Genişletilmiş badge (sayı) */}
                {badge > 0 && navExpanded && (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                    background: 'var(--red)', color: '#fff',
                    borderRadius: '999px', padding: '1px 5px',
                    marginRight: '8px', flexShrink: 0,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px' }}>
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Sticky top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'color-mix(in srgb, var(--bg) 80%, transparent)',
          backdropFilter: 'blur(12px)',
          borderBottom: '2px solid var(--accent)',
          padding: '0 28px',
          display: 'flex', alignItems: 'center', gap: '12px',
          minHeight: '56px',
          boxShadow: '0 1px 0 var(--border), 0 4px 16px rgba(0,0,0,.15)',
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
