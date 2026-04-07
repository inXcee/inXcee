import { useState, useEffect, useCallback } from 'react'

export const COMMANDS = [
  // ── Navigasyon ──────────────────────────────────────────────────
  { id: 'nav-dashboard',    type: 'nav',    label: 'Dashboard',             icon: '▣', path: '/' },
  { id: 'nav-checkin',      type: 'nav',    label: 'Check-in',              icon: '↗', path: '/checkin' },
  { id: 'nav-capacity',     type: 'nav',    label: 'Kapasiteler',           icon: '⊞', path: '/capacity' },
  { id: 'nav-checkout',     type: 'nav',    label: 'Check-out',             icon: '↙', path: '/checkout' },
  { id: 'nav-housekeeping', type: 'nav',    label: 'Housekeeping',          icon: '◈', path: '/housekeeping' },
  { id: 'nav-maintenance',  type: 'nav',    label: 'Teknik Servis',         icon: '⚙', path: '/maintenance' },
  { id: 'nav-discipline',   type: 'nav',    label: 'Disiplin',              icon: '⚠', path: '/discipline' },
  { id: 'nav-shifts',       type: 'nav',    label: 'Vardiyalar',            icon: '⬗', path: '/shifts' },
  { id: 'nav-laundry',      type: 'nav',    label: 'Çamaşırhane',           icon: '♨', path: '/laundry' },
  { id: 'nav-inventory',    type: 'nav',    label: 'Envanter',              icon: '▨', path: '/inventory' },
  { id: 'nav-reports',      type: 'nav',    label: 'PDF Raporlar',          icon: '↓', path: '/reports' },
  { id: 'nav-room-history', type: 'nav',    label: 'Oda Geçmişi',           icon: '⬖', path: '/room-history' },
  { id: 'nav-whatsapp',     type: 'nav',    label: 'WhatsApp',              icon: '☎', path: '/whatsapp' },

  // ── Hızlı Eylemler ──────────────────────────────────────────────
  { id: 'act-new-laundry',  type: 'action', label: 'Yeni Çamaşır Kaydı',   icon: '＋', path: '/laundry',      action: 'open-new-laundry' },
  { id: 'act-new-checkin',  type: 'nav',    label: 'Yeni Check-in',         icon: '＋', path: '/checkin' },
  { id: 'act-new-checkout', type: 'nav',    label: 'Yeni Check-out',        icon: '＋', path: '/checkout' },
  { id: 'act-new-maint',    type: 'action', label: 'Yeni Teknik Talep',     icon: '＋', path: '/maintenance',  action: 'open-maintenance' },
  { id: 'act-new-house',    type: 'nav',    label: 'Yeni Temizlik Talebi',  icon: '＋', path: '/housekeeping' },
]

/** Basit fuzzy match: query'nin her kelimesi label'da geçiyor mu */
export function matchCommand(cmd, query) {
  const q = query.toLowerCase()
  const label = cmd.label.toLowerCase()
  return q.split(' ').every(word => label.includes(word))
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  return { open, setOpen, close, query, setQuery }
}
