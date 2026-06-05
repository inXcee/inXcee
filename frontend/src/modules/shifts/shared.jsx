import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

// Tek noktadan toast ile hata gosterimi — onError callback'lerinde alert yerine bunu cagir.
// Module-level fonksiyon: closure'a bagimli degil, callback'lerde stale ref riski yok.
export const toastErr = (e) => {
  useToastStore.getState().addToast(e?.response?.data?.error || 'Hata', 'error')
}
export const toastOk = (msg) => useToastStore.getState().addToast(msg, 'success')

// ─── Constants ────────────────────────────────────────────────────────────────
export const LEAVE_TYPES = {
  annual:      { label: 'Yillik',     badge: 'badge-blue' },
  sick:        { label: 'Hastalik',   badge: 'badge-red' },
  emergency:   { label: 'Acil',       badge: 'badge-amber' },
  maternity:   { label: 'Dogum',      badge: 'badge-red' },
  paternity:   { label: 'Babalik',    badge: 'badge-blue' },
  marriage:    { label: 'Evlilik',    badge: 'badge-amber' },
  bereavement: { label: 'Olum',       badge: 'badge-gray' },
}

export const STATUS_MAP = {
  pending:  { label: 'Bekliyor',    badge: 'badge-amber' },
  approved: { label: 'Onayli',      badge: 'badge-green' },
  rejected: { label: 'Reddedildi',  badge: 'badge-red' },
}

export const SWAP_STATUS = {
  pending:  { label: 'Bekliyor',  badge: 'badge-amber' },
  approved: { label: 'Onaylandi', badge: 'badge-green' },
  rejected: { label: 'Reddedildi', badge: 'badge-red' },
}

export const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','0+','0-']

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function shortDay(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short' })
}

export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export function calcAge(birthDate) {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

// ─── Color helpers ────────────────────────────────────────────────────────────
export function shiftColor(colorClass) {
  const map = {
    'bg-blue-400':   { bg: 'rgba(59,140,240,.15)', text: 'var(--blue)' },
    'bg-orange-400': { bg: 'rgba(240,165,0,.15)',   text: 'var(--accent)' },
    'bg-indigo-600': { bg: 'rgba(155,89,182,.15)',  text: 'var(--purple)' },
  }
  return map[colorClass] || { bg: 'var(--surface3)', text: 'var(--text2)' }
}

export function deptColor(colorClass) {
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

// ─── Side Panel (fixed right drawer — positioned near click, stays while scrolling) ──
export function SidePanel({ title, subtitle, icon, onClose, children, width = 340, anchorRect }) {
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
export function BottomSheet({ onClose, children }) {
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
// createPortal ile document.body'ye render edilir: aksi halde transform'lu bir
// ata eleman (örn. sayfa .fade-up animasyonu) `position:fixed`'i kendine göre
// konumlandırır ve modal viewport ortası yerine sayfa içeriğine "atlar".
export function ModalOverlay({ children, onClose, wide }) {
  // Arka plan scroll kilidi — modal açıkken sayfa kaymasın.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1060,
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
    </div>,
    document.body
  )
}

// ─── Inline popover (appears near click position) ────────────────────────────
export function InlinePopover({ anchorRect, children, onClose, width = 280 }) {
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
export function StaffSearch({ value, onChange, placeholder = 'Personel ara...', onPersonClick }) {
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
                {p.gender === 'female' ? '♀' : '♂'}
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
