import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useEventStream } from '../../shared/hooks/useEventStream.js'
import { BLOCKS, BLOCK_BY_NAME, blockColor } from '../../shared/blocks.js'

// Bildirim mesajindan blok adi cikar (orn: "M1-101 karantinaya..." → M1)
const BLOCK_NAMES = BLOCKS.map(b => b.block).sort((a, b) => b.length - a.length) // uzun olan once
function extractBlock(text) {
  if (!text) return null
  for (const block of BLOCK_NAMES) {
    const re = new RegExp(`\\b${block}\\b`, 'i')
    if (re.test(text)) return block
  }
  return null
}

function eventColor(type) {
  switch (type) {
    case 'critical': return '#dc2626'
    case 'warning':  return '#f59e0b'
    default:         return '#3b82f6'
  }
}

const VIEW_W = 680
const VIEW_H = 822

// ── Görünüm modları ─────────────────────────────────────────────────────────
const MODES = [
  { id: 'occupancy',  label: 'DOLULUK',   icon: '◉', desc: 'Yatak dolulugu' },
  { id: 'faults',     label: 'ARIZA',     icon: '⚠', desc: 'Acik ariza talepleri' },
  { id: 'cleaning',   label: 'TEMIZLIK',  icon: '◈', desc: 'Bugunki temizlik gorevleri' },
  { id: 'shifts',     label: 'VARDIYA',   icon: '☾', desc: 'Gece/gunduz personel dagilimi' },
  { id: 'quarantine', label: 'KARANTINA', icon: '⊘', desc: 'Karantina/bakim odalari' },
  { id: 'premium',    label: 'PREMIUM',   icon: '★', desc: 'Y bloklar (ozel banyolu)' },
]

// Mode bazli pin metrigi: { value (sayisal 0-100), color, badge (sag-ust kose), centerText }
function computeMetric(mode, s, cfg) {
  if (!s || !cfg) return { value: 0, color: '#6b7280', badge: null, centerLabel: '', subLabel: '...' }

  switch (mode) {
    case 'occupancy': {
      const pct = s.occupancy_pct
      const hasBeds = s.total_beds > 0
      let color = '#6b7280'
      if (hasBeds) {
        if (pct >= 85) color = '#dc2626'
        else if (pct >= 60) color = '#f59e0b'
        else if (pct > 0) color = '#16a34a'
      }
      return {
        value: pct, color,
        badge: s.full_rooms > 0 ? { text: '!', color: '#dc2626' } : null,
        centerLabel: `%${pct}`,
        subLabel: `${s.occupied}/${s.total_beds}`,
      }
    }
    case 'faults': {
      const n = s.open_faults
      let color = '#6b7280'
      if (n >= 5) color = '#dc2626'
      else if (n >= 2) color = '#f59e0b'
      else if (n >= 1) color = '#eab308'
      return {
        value: Math.min(100, n * 20), color,
        badge: n > 0 ? { text: String(n), color: '#dc2626' } : null,
        centerLabel: n > 0 ? `${n}⚠` : '✓',
        subLabel: n > 0 ? `${n} ariza` : 'temiz',
      }
    }
    case 'cleaning': {
      const pct = s.cleaning_pct
      const has = s.cleaning_total > 0
      let color = '#6b7280'
      if (has) {
        if (pct >= 80) color = '#16a34a'
        else if (pct >= 40) color = '#eab308'
        else color = '#dc2626'
      }
      return {
        value: pct, color,
        badge: s.cleaning_skipped > 0 ? { text: '✕', color: '#eab308' } : null,
        centerLabel: has ? `%${pct}` : '—',
        subLabel: has ? `${s.cleaning_done}/${s.cleaning_total}` : 'gorev yok',
      }
    }
    case 'shifts': {
      const total = s.day_count + s.night_count
      const nightPct = total > 0 ? Math.round((s.night_count / total) * 100) : 0
      // Gece vardiyasi yogunlugu = mavi-mor, gunduz = turuncu
      let color = '#6b7280'
      if (total > 0) {
        if (nightPct >= 60) color = '#8b5cf6'
        else if (nightPct >= 30) color = '#3b82f6'
        else color = '#f97316'
      }
      return {
        value: nightPct, color,
        badge: null,
        centerLabel: total > 0 ? `${total}` : '—',
        subLabel: total > 0 ? `G${s.day_count}/N${s.night_count}` : 'bos',
      }
    }
    case 'quarantine': {
      const q = s.quarantine, m = s.maintenance
      const both = q + m
      let color = '#6b7280'
      if (q > 0) color = '#dc2626'
      else if (m > 0) color = '#f59e0b'
      return {
        value: both > 0 ? Math.min(100, both * 25) : 0, color,
        badge: both > 0 ? { text: String(both), color: q > 0 ? '#dc2626' : '#f59e0b' } : null,
        centerLabel: both > 0 ? `${both}⊘` : '✓',
        subLabel: both > 0 ? `Q${q}/B${m}` : 'aktif',
      }
    }
    case 'premium': {
      const isPrem = cfg.type === 'Y'
      const isSosyal = cfg.type === 'S'
      let color = '#6b7280'
      if (isPrem) color = '#a855f7'
      else if (isSosyal) color = '#06b6d4'
      else color = '#475569'
      return {
        value: isPrem ? 100 : isSosyal ? 50 : 25, color,
        badge: isPrem ? { text: '★', color: '#a855f7' } : null,
        centerLabel: cfg.type,
        subLabel: cfg.hasPrivateBath ? 'OZEL' : 'ORTAK',
      }
    }
    default:
      return { value: 0, color: '#6b7280', badge: null, centerLabel: '?', subLabel: '?' }
  }
}

function defaultPins() {
  const pins = {}
  const blocks = BLOCKS.map(b => b.block)
  const cols = 2, startX = 580, startY = 40, dy = 36
  blocks.forEach((b, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    pins[b] = { x: startX + col * 50, y: startY + row * dy }
  })
  return pins
}

export default function CampusMapPage() {
  const user = useAuthStore(s => s.user)
  const isManager = user?.role === 'campus_manager'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const svgRef = useRef(null)

  const [pins, setPins] = useState(defaultPins)
  const [editMode, setEditMode] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [panning, setPanning] = useState(null) // { startVx, startVy, startMx, startMy }
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [hoverBlock, setHoverBlock] = useState(null)
  const [highlightedBlock, setHighlightedBlock] = useState(null) // arama sonucu vurgu
  const [showLabels, setShowLabels] = useState(true)
  const [imgOpacity, setImgOpacity] = useState(1)
  const [mode, setMode] = useState('occupancy')
  const [liveEvents, setLiveEvents] = useState([]) // son 5 olay
  const [pulseBlocks, setPulseBlocks] = useState({})
  // Zoom/Pan
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  // Arama
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const token = useAuthStore(s => s.token)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['campus-map-summary'],
    queryFn: () => api.get('/campus-map/summary').then(r => r.data),
    staleTime: 20000,
    refetchInterval: 30000,
  })

  const { data: rooms = [] } = useQuery({
    queryKey: ['capacity-rooms-all'],
    queryFn: () => api.get('/capacity/rooms').then(r => r.data),
    staleTime: 30000,
    refetchInterval: 30000,
    enabled: !!selectedBlock,  // sadece detay paneli icin
  })

  const { data: pinsData } = useQuery({
    queryKey: ['campus-map-pins'],
    queryFn: () => api.get('/campus-map/pins').then(r => r.data),
    staleTime: 60000,
  })

  // Personel arama (debounced)
  const trimmed = searchQuery.trim()
  const { data: personnelResults = [] } = useQuery({
    queryKey: ['campus-map-search', trimmed],
    queryFn: () => api.get(`/capacity/personnel/search?q=${encodeURIComponent(trimmed)}`).then(r => r.data),
    enabled: trimmed.length >= 2,
    staleTime: 10000,
  })

  // Blok adi eslesmesi
  const blockMatches = useMemo(() => {
    if (trimmed.length < 1) return []
    const upper = trimmed.toUpperCase()
    return BLOCKS.filter(b => b.block.toUpperCase().includes(upper)).slice(0, 6)
  }, [trimmed])

  useEffect(() => {
    if (pinsData?.pins && !editMode) {
      setPins({ ...defaultPins(), ...pinsData.pins })
    }
  }, [pinsData, editMode])

  // SSE — canli olaylar
  const handleSSE = useCallback(({ event, data }) => {
    if (event === 'occupancy') {
      queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
      queryClient.invalidateQueries({ queryKey: ['capacity-rooms-all'] })
      return
    }
    if (event === 'message' && data) {
      const block = extractBlock(data.message)
      const evtType = data.type || 'info'
      // Olay feed'ine ekle
      setLiveEvents(prev => [{
        id: data.id || Date.now() + Math.random(),
        message: data.message,
        type: evtType,
        module: data.module,
        block,
        ts: Date.now(),
      }, ...prev].slice(0, 5))
      // Pin pulse
      if (block) {
        const color = eventColor(evtType)
        setPulseBlocks(prev => ({ ...prev, [block]: { color, until: Date.now() + 4000 } }))
        setTimeout(() => {
          setPulseBlocks(prev => {
            const cur = prev[block]
            if (!cur || cur.until > Date.now()) return prev
            const { [block]: _, ...rest } = prev
            return rest
          })
        }, 4500)
      }
      // Capacity/maintenance/housekeeping olaylarinda ozet'i tazele
      if (['capacity', 'maintenance', 'housekeeping'].includes(data.module)) {
        queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
      }
    }
  }, [queryClient])

  useEventStream('/api/notifications/stream', token, handleSSE, [handleSSE])

  const savePinsMutation = useMutation({
    mutationFn: (newPins) => api.put('/campus-map/pins', { pins: newPins }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus-map-pins'] })
      addToast('Pin konumlari kaydedildi (tum kullanicilar)', 'success')
      setEditMode(false)
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Kaydedilemedi', 'error'),
  })

  const stats = summary?.blocks || {}

  const totalStats = useMemo(() => {
    let total_beds = 0, occupied = 0, empty = 0, q = 0, m = 0, f = 0,
        clean_total = 0, clean_done = 0, day = 0, night = 0
    for (const s of Object.values(stats)) {
      total_beds += s.total_beds; occupied += s.occupied
      empty += s.empty_rooms; q += s.quarantine; m += s.maintenance; f += s.open_faults
      clean_total += s.cleaning_total; clean_done += s.cleaning_done
      day += s.day_count; night += s.night_count
    }
    return { total_beds, occupied, empty, quarantine: q, maintenance: m, fault: f,
      clean_total, clean_done, day, night }
  }, [stats])

  // ── Drag ─────────────────────────────────────────────────────────────────
  function svgPoint(evt) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX; pt.y = evt.clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const { x, y } = pt.matrixTransform(m.inverse())
    return { x, y }
  }

  function onPinMouseDown(e, blockName) {
    if (!editMode) return
    e.stopPropagation()
    const { x, y } = svgPoint(e)
    const p = pins[blockName]
    setDragging({ block: blockName, offsetX: x - p.x, offsetY: y - p.y })
  }

  // Pan — bos alana mouse down
  function onSvgMouseDown(e) {
    if (editMode || dragging) return
    if (e.target.tagName === 'circle' || e.target.tagName === 'text' || e.target.tagName === 'rect') {
      // Pin/tooltip uzerine tiklandi, pan baslatma (tooltip rect harici)
      if (e.target.getAttribute('data-pan-bg') !== '1') return
    }
    setPanning({ startVx: viewBox.x, startVy: viewBox.y, startMx: e.clientX, startMy: e.clientY })
  }

  function onMouseMove(e) {
    if (dragging) {
      const { x, y } = svgPoint(e)
      setPins(prev => ({
        ...prev,
        [dragging.block]: {
          x: Math.max(15, Math.min(VIEW_W - 15, x - dragging.offsetX)),
          y: Math.max(15, Math.min(VIEW_H - 15, y - dragging.offsetY)),
        }
      }))
      return
    }
    if (panning) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const scaleX = viewBox.w / rect.width
      const scaleY = viewBox.h / rect.height
      const dx = (e.clientX - panning.startMx) * scaleX
      const dy = (e.clientY - panning.startMy) * scaleY
      const newX = Math.max(-viewBox.w * 0.2, Math.min(VIEW_W - viewBox.w * 0.8, panning.startVx - dx))
      const newY = Math.max(-viewBox.h * 0.2, Math.min(VIEW_H - viewBox.h * 0.8, panning.startVy - dy))
      setViewBox(prev => ({ ...prev, x: newX, y: newY }))
    }
  }

  useEffect(() => {
    if (!dragging && !panning) return
    const handleUp = () => { setDragging(null); setPanning(null) }
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [dragging, panning])

  // Wheel zoom
  function onWheel(e) {
    e.preventDefault()
    const { x: mx, y: my } = svgPoint(e)
    const scale = e.deltaY > 0 ? 1.2 : 0.83
    const newW = Math.max(150, Math.min(VIEW_W * 1.2, viewBox.w * scale))
    const newH = newW * (VIEW_H / VIEW_W)
    // Zoom around mouse position
    const ratio = newW / viewBox.w
    const newX = mx - (mx - viewBox.x) * ratio
    const newY = my - (my - viewBox.y) * ratio
    setViewBox({
      x: Math.max(-newW * 0.2, Math.min(VIEW_W - newW * 0.8, newX)),
      y: Math.max(-newH * 0.2, Math.min(VIEW_H - newH * 0.8, newY)),
      w: newW, h: newH,
    })
  }

  function zoomIn() {
    const f = 0.7
    const cx = viewBox.x + viewBox.w / 2
    const cy = viewBox.y + viewBox.h / 2
    const newW = Math.max(150, viewBox.w * f)
    const newH = newW * (VIEW_H / VIEW_W)
    setViewBox({ x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH })
  }
  function zoomOut() {
    const f = 1.4
    const cx = viewBox.x + viewBox.w / 2
    const cy = viewBox.y + viewBox.h / 2
    const newW = Math.min(VIEW_W * 1.2, viewBox.w * f)
    const newH = newW * (VIEW_H / VIEW_W)
    setViewBox({
      x: Math.max(-newW * 0.2, Math.min(VIEW_W - newW * 0.8, cx - newW / 2)),
      y: Math.max(-newH * 0.2, Math.min(VIEW_H - newH * 0.8, cy - newH / 2)),
      w: newW, h: newH,
    })
  }
  function resetView() {
    setViewBox({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  }
  function zoomToBlock(blockName) {
    const p = pins[blockName]
    if (!p) return
    const w = 280, h = w * (VIEW_H / VIEW_W)
    setViewBox({
      x: Math.max(0, Math.min(VIEW_W - w, p.x - w / 2)),
      y: Math.max(0, Math.min(VIEW_H - h, p.y - h / 2)),
      w, h,
    })
    setHighlightedBlock(blockName)
    setTimeout(() => setHighlightedBlock(prev => prev === blockName ? null : prev), 3000)
  }

  function savePins() { savePinsMutation.mutate(pins) }
  function resetPins() {
    if (!confirm('Tum pin konumlarini varsayilana sifirla? (Tum kullanicilar icin)')) return
    const def = defaultPins()
    setPins(def)
    savePinsMutation.mutate(def)
  }

  const visibleBlocks = useMemo(() =>
    BLOCKS.filter(b => typeFilter === 'all' || b.type === typeFilter), [typeFilter])

  const sel = selectedBlock ? stats[selectedBlock] : null
  const selCfg = selectedBlock ? BLOCK_BY_NAME[selectedBlock] : null
  const selRooms = useMemo(() => {
    if (!selectedBlock) return []
    return (rooms || []).filter(r => r.block === selectedBlock)
  }, [selectedBlock, rooms])

  const currentMode = MODES.find(m => m.id === mode)

  // Top metric for current mode (header bar)
  const topMetric = useMemo(() => {
    switch (mode) {
      case 'occupancy': return { label: 'KAMPUS DOLULUK', value: totalStats.total_beds > 0 ? `%${Math.round((totalStats.occupied / totalStats.total_beds) * 100)}` : '—', sub: `${totalStats.occupied}/${totalStats.total_beds}` }
      case 'faults':    return { label: 'TOPLAM ACIK ARIZA', value: totalStats.fault, sub: `${BLOCKS.length} blok` }
      case 'cleaning':  return { label: 'BUGUN TEMIZLIK', value: totalStats.clean_total > 0 ? `%${Math.round((totalStats.clean_done / totalStats.clean_total) * 100)}` : '—', sub: `${totalStats.clean_done}/${totalStats.clean_total}` }
      case 'shifts':    return { label: 'GECE/GUNDUZ', value: `${totalStats.night}/${totalStats.day}`, sub: totalStats.night + totalStats.day > 0 ? `%${Math.round((totalStats.night / (totalStats.night + totalStats.day)) * 100)} gece` : '—' }
      case 'quarantine': return { label: 'KARANTINA+BAKIM', value: totalStats.quarantine + totalStats.maintenance, sub: `Q${totalStats.quarantine} B${totalStats.maintenance}` }
      case 'premium':   return { label: 'PREMIUM BLOK', value: BLOCKS.filter(b => b.type === 'Y').length, sub: 'ozel banyolu' }
      default: return { label: '', value: '', sub: '' }
    }
  }, [mode, totalStats])

  return (
    <div style={{ padding: 16, color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 3, margin: 0 }}>KAMPUS HARITASI</h2>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
            {isLoading ? 'YUKLENIYOR...' : `${BLOCKS.length} BLOK • CANLI • ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
          </div>
        </div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 22 }}>{currentMode?.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>
              {topMetric.label}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 2, color: 'var(--accent)' }}>
              {topMetric.value} <span style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 1 }}>{topMetric.sub}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mode switcher */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10, padding: 4,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
        overflowX: 'auto',
      }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} title={m.desc}
            style={{
              flex: '1 1 auto', minWidth: 110,
              background: mode === m.id ? 'var(--accent)' : 'transparent',
              color: mode === m.id ? '#000' : 'var(--text2)',
              border: 'none', borderRadius: 6,
              padding: '8px 10px', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.5, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all .15s',
            }}>
            <span style={{ fontSize: 14 }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {/* Arama */}
        <div style={{ position: 'relative', minWidth: 220 }}>
          <input
            type="text"
            placeholder="◎ Blok veya personel ara..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            style={{
              width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 10px', color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.5,
            }}
          />
          {searchOpen && trimmed.length >= 1 && (blockMatches.length > 0 || personnelResults.length > 0) && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
              maxHeight: 320, overflowY: 'auto', zIndex: 50,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {blockMatches.length > 0 && (
                <div style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 9,
                  color: 'var(--text3)', letterSpacing: 1.5, borderBottom: '1px solid var(--border)' }}>
                  BLOKLAR
                </div>
              )}
              {blockMatches.map(b => {
                const s = stats[b.block]
                return (
                  <button key={b.block}
                    onMouseDown={() => { zoomToBlock(b.block); setSelectedBlock(b.block); setSearchQuery(''); setSearchOpen(false) }}
                    style={searchItemStyle}>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 13, color: blockColor(b.block), letterSpacing: 1.5, minWidth: 32 }}>
                      {b.block}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                      TIP {b.type} • {b.floors}K
                    </span>
                    {s && (
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                        {s.occupied}/{s.total_beds}
                      </span>
                    )}
                  </button>
                )
              })}
              {personnelResults.length > 0 && (
                <div style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 9,
                  color: 'var(--text3)', letterSpacing: 1.5, borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)' }}>
                  PERSONEL ({personnelResults.length})
                </div>
              )}
              {personnelResults.map(p => (
                <button key={p.id}
                  onMouseDown={() => {
                    if (p.block) {
                      zoomToBlock(p.block)
                      setSelectedBlock(p.block)
                    }
                    setSearchQuery('')
                    setSearchOpen(false)
                  }}
                  style={searchItemStyle}>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text)', flex: 1, textAlign: 'left' }}>
                    {p.full_name}
                  </span>
                  {p.block ? (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>
                      {p.block}-{p.room_no}
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                      ATANMAMIS
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

        {/* Zoom kontrolleri */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
          <button onClick={zoomOut} title="Uzaklas" style={zoomBtn}>−</button>
          <button onClick={resetView} title="Sifirla" style={{ ...zoomBtn, fontSize: 10, padding: '4px 8px' }}>RST</button>
          <button onClick={zoomIn} title="Yakinlas" style={zoomBtn}>+</button>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          {Math.round((VIEW_W / viewBox.w) * 100)}%
        </span>

        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

        {['all', 'M', 'S', 'Y'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={chipBtn(typeFilter === t)}>
            {t === 'all' ? 'TUMU' : `${t} TIPI`}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <label style={lblToolbar}>
          <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
          ETIKETLER
        </label>
        <label style={lblToolbar}>
          OPAK
          <input type="range" min="0.3" max="1" step="0.05" value={imgOpacity}
            onChange={e => setImgOpacity(parseFloat(e.target.value))} style={{ width: 70 }} />
        </label>
        {isManager && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
            {editMode ? (
              <>
                <button onClick={savePins} disabled={savePinsMutation.isPending} style={btnGreen}>
                  {savePinsMutation.isPending ? '...' : '✓ KAYDET'}
                </button>
                <button onClick={() => {
                  setPins({ ...defaultPins(), ...(pinsData?.pins || {}) })
                  setEditMode(false)
                }} style={btnGhost}>IPTAL</button>
                <button onClick={resetPins} style={btnDanger}>SIFIRLA</button>
              </>
            ) : (
              <button onClick={() => setEditMode(true)} style={btnAccent}>✎ PIN DUZENLE</button>
            )}
          </>
        )}
      </div>

      {/* Canli olay feed */}
      {liveEvents.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '6px 10px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span className="live-dot" style={{ width: 8, height: 8, background: '#dc2626', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>CANLI</span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
            {liveEvents.map(ev => (
              <button key={ev.id}
                onClick={() => ev.block && setSelectedBlock(ev.block)}
                style={{
                  flexShrink: 0, background: 'var(--surface2)',
                  border: `1px solid ${eventColor(ev.type)}`,
                  borderLeftWidth: 3, borderRadius: 4,
                  padding: '4px 8px', cursor: ev.block ? 'pointer' : 'default',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
                  display: 'flex', alignItems: 'center', gap: 6, maxWidth: 280,
                }}
                title={ev.message}>
                {ev.block && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{ev.block}</span>}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.message}
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => setLiveEvents([])} title="Temizle" style={{
            background: 'transparent', border: 'none', color: 'var(--text3)',
            cursor: 'pointer', fontSize: 14, padding: '2px 6px', flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      {/* KPI strip — mode aware */}
      <ModeKpis mode={mode} totalStats={totalStats} />

      {editMode && (
        <div style={{
          background: 'rgba(240,165,0,0.08)', border: '1px solid var(--accent)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 10,
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', letterSpacing: 1,
        }}>
          ✎ DUZENLEME — Pinleri ait oldugu binanin uzerine surukle. Kaydet butonu ile tum kullanicilara yayinla.
        </div>
      )}

      {/* Map + side panel */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{
          flex: 1, background: '#0a0a0a', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', position: 'relative', maxWidth: 760,
        }}>
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none',
              cursor: panning ? 'grabbing' : dragging ? 'grabbing' : (editMode ? 'default' : 'grab') }}
            onMouseMove={onMouseMove}
            onMouseDown={onSvgMouseDown}
            onWheel={onWheel}
          >
            <image href="/campus-map.png" x="0" y="0" width={VIEW_W} height={VIEW_H} opacity={imgOpacity} data-pan-bg="1" />
            {/* Pan icin gorunmez tutamak — pin uzerinde olmayan tum alan */}
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" data-pan-bg="1" />
            {/* Hafif vignette */}
            <radialGradient id="vignette">
              <stop offset="60%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
            </radialGradient>
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#vignette)" pointerEvents="none" />

            {visibleBlocks.map(b => {
              const p = pins[b.block]
              if (!p) return null
              const s = stats[b.block]
              const cfg = b
              const metric = computeMetric(mode, s, cfg)
              const isHover = hoverBlock === b.block
              const isSel = selectedBlock === b.block
              const isHighlighted = highlightedBlock === b.block
              const baseR = 17
              const r = isSel ? baseR + 3 : (isHover ? baseR + 2 : baseR)

              // Donut: dis halka = doluluk yuzdesi (her zaman), ic = aktif mod rengi
              const occPct = s?.occupancy_pct || 0
              const occColor = !s?.total_beds ? '#6b7280' : occPct >= 85 ? '#dc2626' : occPct >= 60 ? '#f59e0b' : occPct > 0 ? '#16a34a' : '#6b7280'
              const ringR = r + 4
              const circumference = 2 * Math.PI * ringR
              const dash = (occPct / 100) * circumference

              return (
                <g key={b.block}
                  onMouseEnter={() => setHoverBlock(b.block)}
                  onMouseLeave={() => setHoverBlock(null)}
                  onClick={() => !editMode && setSelectedBlock(b.block)}
                  style={{ cursor: editMode ? 'grab' : 'pointer' }}
                >
                  {/* Halo */}
                  {(isHover || isSel) && (
                    <circle cx={p.x} cy={p.y} r={r + 12} fill={metric.color} opacity="0.18" />
                  )}
                  {/* Arama vurgu — sari pulsing halka */}
                  {isHighlighted && (
                    <>
                      <circle cx={p.x} cy={p.y} r={r + 18} fill="none" stroke="#facc15" strokeWidth="2.5">
                        <animate attributeName="r" values={`${r + 6};${r + 26}`} dur="1s" repeatCount="3" />
                        <animate attributeName="opacity" values="1;0" dur="1s" repeatCount="3" />
                      </circle>
                      <circle cx={p.x} cy={p.y} r={r + 8} fill="#facc15" opacity="0.25" />
                    </>
                  )}
                  {/* Canli olay pulse */}
                  {pulseBlocks[b.block] && (
                    <>
                      <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
                        stroke={pulseBlocks[b.block].color} strokeWidth="3">
                        <animate attributeName="r" values={`${r + 6};${r + 30}`} dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
                        stroke={pulseBlocks[b.block].color} strokeWidth="2">
                        <animate attributeName="r" values={`${r + 6};${r + 22}`} dur="1.5s" begin="0.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0" dur="1.5s" begin="0.5s" repeatCount="indefinite" />
                      </circle>
                    </>
                  )}
                  {/* Doluluk donut halkasi */}
                  <circle cx={p.x} cy={p.y} r={ringR} fill="none"
                    stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle cx={p.x} cy={p.y} r={ringR} fill="none"
                    stroke={occColor} strokeWidth="3"
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={circumference / 4}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                    style={{ transition: 'stroke-dasharray .4s' }}
                  />
                  {/* Gölge */}
                  <circle cx={p.x + 1} cy={p.y + 2} r={r} fill="rgba(0,0,0,0.5)" />
                  {/* Ana pin — mode rengi */}
                  <circle cx={p.x} cy={p.y} r={r}
                    fill={metric.color} stroke="#fff" strokeWidth="2"
                    onMouseDown={(e) => onPinMouseDown(e, b.block)}
                  />
                  {/* Blok ismi */}
                  <text x={p.x} y={p.y - 2} textAnchor="middle" dominantBaseline="central"
                    fontFamily="var(--display)" fontSize={b.block.length > 2 ? 9 : 11} fontWeight="700"
                    fill="#fff" style={{ pointerEvents: 'none' }}>
                    {b.block}
                  </text>
                  {/* Metrik */}
                  <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="central"
                    fontFamily="var(--mono)" fontSize="8" fontWeight="600"
                    fill="#fff" opacity="0.95" style={{ pointerEvents: 'none' }}>
                    {metric.centerLabel}
                  </text>

                  {/* Yan etiket */}
                  {showLabels && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={p.x + r + 5} y={p.y - 9} width={48} height={18} rx={4}
                        fill="rgba(0,0,0,0.85)" stroke={metric.color} strokeWidth="1" />
                      <text x={p.x + r + 29} y={p.y + 1}
                        textAnchor="middle" dominantBaseline="central"
                        fontFamily="var(--mono)" fontSize="9" fontWeight="600" fill="#fff">
                        {metric.subLabel}
                      </text>
                    </g>
                  )}

                  {/* Badge (sag-ust) */}
                  {metric.badge && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={p.x + r - 2} cy={p.y - r + 2} r="7"
                        fill={metric.badge.color} stroke="#fff" strokeWidth="1.5" />
                      <text x={p.x + r - 2} y={p.y - r + 2}
                        textAnchor="middle" dominantBaseline="central"
                        fontFamily="var(--mono)" fontSize="9" fontWeight="700" fill="#fff">
                        {metric.badge.text}
                      </text>
                    </g>
                  )}

                  {/* Karantina kesik halka — daima goster */}
                  {s?.quarantine > 0 && (
                    <circle cx={p.x} cy={p.y} r={ringR + 4} fill="none"
                      stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3"
                      style={{ pointerEvents: 'none' }} />
                  )}

                  {/* Alt durum noktalari — 3 mini gosterge (vardiya/temizlik/ariza) */}
                  {!editMode && s && (
                    <g style={{ pointerEvents: 'none' }}>
                      <StatusDot cx={p.x - 8} cy={p.y + r + 6}
                        active={(s.day_count + s.night_count) > 0}
                        color={s.night_count > s.day_count ? '#8b5cf6' : '#f97316'} />
                      <StatusDot cx={p.x} cy={p.y + r + 6}
                        active={s.cleaning_total > 0}
                        color={s.cleaning_pct >= 80 ? '#16a34a' : s.cleaning_pct >= 40 ? '#eab308' : '#dc2626'} />
                      <StatusDot cx={p.x + 8} cy={p.y + r + 6}
                        active={s.open_faults > 0}
                        color="#dc2626" />
                    </g>
                  )}
                </g>
              )
            })}

            {/* Hover detail card */}
            {hoverBlock && !editMode && !dragging && (
              <HoverCard
                block={hoverBlock}
                cfg={BLOCK_BY_NAME[hoverBlock]}
                s={stats[hoverBlock]}
                pin={pins[hoverBlock]}
                mode={mode}
              />
            )}
          </svg>

          {/* Legend overlay (mode-aware) */}
          <ModeLegend mode={mode} />

          {/* Mini-map (sag-ust) */}
          <MiniMap viewBox={viewBox} pins={pins} stats={stats} mode={mode} onPanTo={(x, y) => {
            setViewBox(prev => ({
              ...prev,
              x: Math.max(-prev.w * 0.2, Math.min(VIEW_W - prev.w * 0.8, x - prev.w / 2)),
              y: Math.max(-prev.h * 0.2, Math.min(VIEW_H - prev.h * 0.8, y - prev.h / 2)),
            }))
          }} />
        </div>

        {/* Side panel */}
        {selectedBlock ? (
          <SidePanel
            block={selectedBlock}
            cfg={selCfg}
            stats={sel}
            rooms={selRooms}
            mode={mode}
            onClose={() => setSelectedBlock(null)}
            onNavigate={navigate}
          />
        ) : (
          <div style={{
            width: 320, background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--text3)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>◉</div>
            BIR PIN'E TIKLA<br />
            <span style={{ fontSize: 9, color: 'var(--text4)' }}>
              {currentMode?.desc}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniMap({ viewBox, pins, stats, mode, onPanTo }) {
  const MW = 140
  const MH = MW * (VIEW_H / VIEW_W)
  const ref = useRef(null)

  function handleClick(e) {
    const rect = ref.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H
    onPanTo(x, y)
  }

  // Pin renkleri (mode'a göre özetlenmiş)
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12,
      background: 'rgba(10,10,10,0.85)', border: '1px solid var(--border)',
      borderRadius: 6, padding: 4, cursor: 'crosshair',
    }} ref={ref} onClick={handleClick}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={MW} height={MH} style={{ display: 'block' }}>
        <image href="/campus-map.png" x="0" y="0" width={VIEW_W} height={VIEW_H} opacity="0.6" />
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="rgba(0,0,0,0.3)" />
        {Object.entries(pins).map(([block, p]) => {
          const s = stats[block]
          const occ = s?.occupancy_pct || 0
          const hasBeds = (s?.total_beds || 0) > 0
          let color = '#6b7280'
          if (hasBeds) {
            if (occ >= 85) color = '#dc2626'
            else if (occ >= 60) color = '#f59e0b'
            else if (occ > 0) color = '#16a34a'
          }
          return <circle key={block} cx={p.x} cy={p.y} r="14" fill={color} stroke="#fff" strokeWidth="1.5" />
        })}
        {/* Viewport gostergesi */}
        <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h}
          fill="rgba(240,165,0,0.15)" stroke="var(--accent)" strokeWidth="4" />
      </svg>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', textAlign: 'center', letterSpacing: 1, marginTop: 2 }}>
        MINI-MAP • TIKLA
      </div>
    </div>
  )
}

function StatusDot({ cx, cy, active, color }) {
  if (!active) return <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.2)" />
  return (
    <>
      <circle cx={cx} cy={cy} r="3.5" fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="6" fill={color} opacity="0.3">
        <animate attributeName="r" values="3.5;7;3.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </>
  )
}

function HoverCard({ block, cfg, s, pin, mode }) {
  if (!pin || !s || !cfg) return null
  const w = 210, h = 138
  let tx = pin.x + 24, ty = pin.y - h / 2
  if (tx + w > VIEW_W) tx = pin.x - 24 - w
  if (ty < 0) ty = 4
  if (ty + h > VIEW_H) ty = VIEW_H - h - 4

  // Mode-spesifik 2. satir
  const modeLines = {
    occupancy:  [['DOLU', `${s.occupied}/${s.total_beds}`, '#16a34a'],
                 ['BOS ODA', s.empty_rooms, '#facc15'],
                 ['DOLULUK', `%${s.occupancy_pct}`, '#fff']],
    faults:     [['ACIK ARIZA', s.open_faults, '#dc2626'],
                 ['TOPLAM ODA', s.total_rooms, '#fff'],
                 ['DOLULUK', `%${s.occupancy_pct}`, '#facc15']],
    cleaning:   [['TAMAMLANAN', `${s.cleaning_done}/${s.cleaning_total}`, '#16a34a'],
                 ['ATLANAN', s.cleaning_skipped, '#eab308'],
                 ['BUGUN %', `%${s.cleaning_pct}`, '#fff']],
    shifts:     [['GUNDUZ', s.day_count, '#f97316'],
                 ['GECE', s.night_count, '#8b5cf6'],
                 ['TOPLAM', s.day_count + s.night_count, '#fff']],
    quarantine: [['KARANTINA', s.quarantine, '#dc2626'],
                 ['BAKIM', s.maintenance, '#f59e0b'],
                 ['AKTIF ODA', s.total_rooms - s.quarantine - s.maintenance, '#16a34a']],
    premium:    [['TIP', cfg.type, '#a855f7'],
                 ['KAT', cfg.floors, '#fff'],
                 ['BANYO', cfg.hasPrivateBath ? 'OZEL' : 'ORTAK', '#06b6d4']],
  }
  const lines = modeLines[mode] || modeLines.occupancy

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={w} height={h} rx={6}
        fill="rgba(10,10,10,0.96)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x={tx + 12} y={ty + 20} fontFamily="var(--display)" fontSize="16" fontWeight="700"
        fill="#fff" letterSpacing="2">BLOK {block}</text>
      <text x={tx + w - 12} y={ty + 20} textAnchor="end"
        fontFamily="var(--mono)" fontSize="9" fill="var(--text3)" letterSpacing="1">
        TIP {cfg.type} • {cfg.floors}K
      </text>
      <line x1={tx + 10} x2={tx + w - 10} y1={ty + 28} y2={ty + 28} stroke="var(--border)" strokeWidth="0.5" />
      {lines.map((ln, i) => (
        <g key={i}>
          <text x={tx + 12} y={ty + 48 + i * 18} fontFamily="var(--mono)" fontSize="9"
            fill="var(--text3)" letterSpacing="1">{ln[0]}</text>
          <text x={tx + w - 12} y={ty + 48 + i * 18} textAnchor="end"
            fontFamily="var(--mono)" fontSize="11" fontWeight="700" fill={ln[2]}>
            {ln[1]}
          </text>
        </g>
      ))}
      <line x1={tx + 10} x2={tx + w - 10} y1={ty + h - 24} y2={ty + h - 24} stroke="var(--border)" strokeWidth="0.5" />
      <text x={tx + w / 2} y={ty + h - 10} textAnchor="middle"
        fontFamily="var(--mono)" fontSize="9" fill="var(--text3)" letterSpacing="1">
        TIKLA: DETAYLI GOR
      </text>
    </g>
  )
}

function ModeKpis({ mode, totalStats: t }) {
  const sets = {
    occupancy: [
      ['TOPLAM YATAK', t.total_beds, 'var(--text)'],
      ['DOLU', t.occupied, '#16a34a'],
      ['BOS ODA', t.empty, 'var(--accent)'],
      ['KARANTINA', t.quarantine, '#dc2626'],
      ['BAKIM', t.maintenance, '#f59e0b'],
      ['ACIK ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
    ],
    faults: [
      ['ACIK ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
      ['KARANTINA', t.quarantine, '#dc2626'],
      ['BAKIM ODASI', t.maintenance, '#f59e0b'],
      ['BOS ODA', t.empty, 'var(--accent)'],
    ],
    cleaning: [
      ['BUGUN TOPLAM', t.clean_total, 'var(--text)'],
      ['TAMAMLANAN', t.clean_done, '#16a34a'],
      ['KALAN', t.clean_total - t.clean_done, '#eab308'],
      ['DOLU YATAK', t.occupied, 'var(--text3)'],
    ],
    shifts: [
      ['GUNDUZ VARDIYA', t.day, '#f97316'],
      ['GECE VARDIYA', t.night, '#8b5cf6'],
      ['TOPLAM PERSONEL', t.day + t.night, 'var(--text)'],
    ],
    quarantine: [
      ['KARANTINA ODASI', t.quarantine, '#dc2626'],
      ['BAKIM ODASI', t.maintenance, '#f59e0b'],
      ['AKTIF ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
    ],
    premium: [
      ['Y BLOK', BLOCKS.filter(b => b.type === 'Y').length, '#a855f7'],
      ['S BLOK', BLOCKS.filter(b => b.type === 'S').length, '#06b6d4'],
      ['M BLOK', BLOCKS.filter(b => b.type === 'M').length, '#475569'],
    ],
  }
  const items = sets[mode] || sets.occupancy
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
      {items.map(([label, value, color]) => <Kpi key={label} label={label} value={value} color={color} />)}
    </div>
  )
}

function ModeLegend({ mode }) {
  const sets = {
    occupancy:  [['< %60', '#16a34a'], ['%60-85', '#f59e0b'], ['> %85', '#dc2626'], ['BOS', '#6b7280']],
    faults:     [['0', '#6b7280'], ['1', '#eab308'], ['2-4', '#f59e0b'], ['5+', '#dc2626']],
    cleaning:   [['> %80', '#16a34a'], ['%40-80', '#eab308'], ['< %40', '#dc2626'], ['YOK', '#6b7280']],
    shifts:     [['GUNDUZ', '#f97316'], ['KARMA', '#3b82f6'], ['GECE', '#8b5cf6'], ['BOS', '#6b7280']],
    quarantine: [['KARANTINA', '#dc2626'], ['BAKIM', '#f59e0b'], ['NORMAL', '#6b7280']],
    premium:    [['Y (PREMIUM)', '#a855f7'], ['S (SOSYAL)', '#06b6d4'], ['M (MERKEZI)', '#475569']],
  }
  const items = sets[mode] || sets.occupancy
  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 12,
      background: 'rgba(10,10,10,0.85)', borderRadius: 6,
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', letterSpacing: 1,
      border: '1px solid var(--border)',
    }}>
      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>{MODES.find(m => m.id === mode)?.label}</div>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, background: color, borderRadius: '50%', display: 'inline-block', border: '1px solid #fff' }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function SidePanel({ block, cfg, stats: s, rooms, mode, onClose, onNavigate }) {
  if (!cfg || !s) return null
  const pct = s.occupancy_pct
  const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'

  return (
    <div style={{
      width: 340, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, position: 'sticky', top: 20,
      maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 3, color: blockColor(block), lineHeight: 1 }}>
            {block}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
            TIP {cfg.type} • {cfg.floors} KAT • {cfg.hasPrivateBath ? 'OZEL BANYO' : 'ORTAK BANYO'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4,
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          <span>DOLULUK</span>
          <span style={{ color }}>%{pct}</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginTop: 4, textAlign: 'center' }}>
          {s.occupied} / {s.total_beds} yatak
        </div>
      </div>

      {/* 6'lı mini grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 14 }}>
        <MiniStat label="ODA" value={s.total_rooms} />
        <MiniStat label="BOS" value={s.empty_rooms} color="var(--accent)" />
        <MiniStat label="DOLU ODA" value={s.full_rooms} color={s.full_rooms > 0 ? '#dc2626' : 'var(--text)'} />
        <MiniStat label="ARIZA" value={s.open_faults} color={s.open_faults > 0 ? '#dc2626' : 'var(--text)'} />
        <MiniStat label="KARANTINA" value={s.quarantine} color={s.quarantine > 0 ? '#dc2626' : 'var(--text3)'} />
        <MiniStat label="BAKIM" value={s.maintenance} color={s.maintenance > 0 ? '#f59e0b' : 'var(--text3)'} />
      </div>

      {/* Vardiya dağılımı */}
      {(s.day_count + s.night_count) > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            VARDIYA DAGILIMI
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(s.day_count / (s.day_count + s.night_count)) * 100}%`, background: '#f97316' }} />
            <div style={{ width: `${(s.night_count / (s.day_count + s.night_count)) * 100}%`, background: '#8b5cf6' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4,
            fontFamily: 'var(--mono)', fontSize: 9 }}>
            <span style={{ color: '#f97316' }}>☀ GUNDUZ {s.day_count}</span>
            <span style={{ color: '#8b5cf6' }}>☾ GECE {s.night_count}</span>
          </div>
        </div>
      )}

      {/* Temizlik durumu */}
      {s.cleaning_total > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            <span>BUGUN TEMIZLIK</span>
            <span>%{s.cleaning_pct}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${s.cleaning_pct}%`, height: '100%', background: '#16a34a' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)', marginTop: 3 }}>
            {s.cleaning_done}/{s.cleaning_total} tamamlandı{s.cleaning_skipped > 0 ? ` • ${s.cleaning_skipped} atlandi` : ''}
          </div>
        </div>
      )}

      {/* Top şirketler */}
      {s.top_companies?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            ANA SIRKETLER
          </div>
          {s.top_companies.map(c => (
            <div key={c.company} style={{ display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', padding: '2px 0' }}>
              <span>{c.company}</span>
              <span style={{ color: 'var(--accent)' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kat-kat oda grid */}
      {Array.from({ length: cfg.floors }, (_, i) => i + 1).map(floor => {
        const floorRooms = rooms.filter(r => r.floor === floor)
        if (floorRooms.length === 0) return null
        const occ = floorRooms.reduce((a, r) => a + (r.occupied || 0), 0)
        const cap = floorRooms.reduce((a, r) => a + (r.active_beds || 0), 0)
        return (
          <div key={floor} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
                KAT {floor}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                {occ}/{cap}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 3 }}>
              {floorRooms.map(r => {
                const rpct = r.active_beds > 0 ? Math.round(((r.occupied || 0) / r.active_beds) * 100) : 0
                let bg = '#6b7280'
                if (r.status === 'quarantine') bg = '#dc2626'
                else if (r.status === 'maintenance') bg = '#f59e0b'
                else if (r.active_beds > 0) {
                  if (rpct >= 100) bg = '#dc2626'
                  else if (rpct >= 60) bg = '#f59e0b'
                  else if (rpct > 0) bg = '#16a34a'
                }
                return (
                  <div key={r.id}
                    title={`Oda ${r.room_no} • ${r.occupied || 0}/${r.active_beds || 0}${r.status !== 'active' ? ' • ' + r.status : ''}${r.open_fault_count ? ' • ' + r.open_fault_count + ' ariza' : ''}`}
                    onClick={() => onNavigate(`/capacity?block=${block}&room=${r.id}`)}
                    style={{
                      background: bg, color: '#fff', borderRadius: 3,
                      padding: '5px 2px', textAlign: 'center', cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
                      position: 'relative', transition: 'transform .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {r.room_no}
                    {r.open_fault_count > 0 && (
                      <div style={{ position: 'absolute', top: -3, right: -3,
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#dc2626', border: '1.5px solid var(--surface)' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={() => onNavigate(`/capacity?block=${block}`)} style={btnPrimary}>
          KAPASITE SAYFASINDA AC →
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={() => onNavigate(`/housekeeping?block=${block}`)} style={btnSecondary}>◈ TEMIZLIK</button>
          <button onClick={() => onNavigate(`/maintenance?block=${block}`)} style={btnSecondary}>⚙ ARIZA</button>
          <button onClick={() => onNavigate(`/room-history?block=${block}`)} style={btnSecondary}>⊙ GECMIS</button>
          <button onClick={() => onNavigate(`/checkin?block=${block}`)} style={btnSecondary}>↗ CHECK-IN</button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 20, color, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, color, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

function chipBtn(active) {
  return {
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? '#000' : 'var(--text2)',
    border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 10px', cursor: 'pointer',
    fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
  }
}
const lblToolbar = { display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', cursor: 'pointer', letterSpacing: 1 }
const btnPrimary = {
  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6,
  padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
  letterSpacing: 1, fontWeight: 700, textAlign: 'left',
}
const btnSecondary = {
  background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '7px 8px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 9,
  letterSpacing: 1, textAlign: 'center',
}
const btnGreen = { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600 }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1 }
const btnDanger = { background: 'var(--surface2)', color: '#dc2626', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1 }
const btnAccent = { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600 }
const zoomBtn = {
  background: 'transparent', color: 'var(--text2)', border: 'none', borderRadius: 4,
  padding: '4px 9px', cursor: 'pointer', fontFamily: 'var(--mono)',
  fontSize: 14, fontWeight: 700, lineHeight: 1, minWidth: 26,
}
const searchItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
  padding: '8px 10px', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
  transition: 'background .1s',
}
