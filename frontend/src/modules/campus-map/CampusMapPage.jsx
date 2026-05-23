import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useEventStream } from '../../shared/hooks/useEventStream.js'
import { BLOCKS, BLOCK_BY_NAME, blockColor } from '../../shared/blocks.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import HelpHint from '../../shared/components/HelpHint.jsx'

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
  { id: 'company',    label: 'SIRKET',    icon: '⊞', desc: 'Dominant sirket dagilimi' },
]

// Sirket adindan deterministic renk uret (hash → hue)
function companyColor(name) {
  if (!name) return '#475569'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 50%)`
}

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
    case 'company': {
      const top = s.top_companies?.[0]
      if (!top) return { value: 0, color: '#6b7280', badge: null, centerLabel: '—', subLabel: 'bos' }
      const color = companyColor(top.company)
      const sharePct = s.occupied > 0 ? Math.round((top.count / s.occupied) * 100) : 0
      return {
        value: sharePct, color,
        badge: s.top_companies.length > 1 ? { text: String(s.top_companies.length), color: '#475569' } : null,
        centerLabel: top.company.slice(0, 4).toUpperCase(),
        subLabel: `${top.count}k %${sharePct}`,
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
  const [multiSelect, setMultiSelect] = useState(() => new Set())
  const [typeFilter, setTypeFilter] = useState('all')
  const [hoverBlock, setHoverBlock] = useState(null)
  const [highlightedBlock, setHighlightedBlock] = useState(null) // arama sonucu vurgu
  const [showLabels, setShowLabels] = useState(true)
  const [mode, setMode] = useState('occupancy')
  const [showHelp, setShowHelp] = useState(false)
  const [animateIn, setAnimateIn] = useState(true)
  const [imgOpacity, setImgOpacity] = useState(1)
  const [heatCloud, setHeatCloud] = useState(false)
  const [pinScale, setPinScale] = useState(1)
  const [inspectorBlock, setInspectorBlock] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { block, x, y }
  const [quickFault, setQuickFault] = useState(null) // { block } | null
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
  })

  // Toplu oda durumu degisikligi (campus_manager only)
  const bulkStatusMutation = useMutation({
    mutationFn: ({ room_ids, status }) => api.post('/capacity/bulk/room-status', { room_ids, status }).then(r => r.data),
    onSuccess: (data, vars) => {
      const label = vars.status === 'quarantine' ? 'karantinaya alindi' : vars.status === 'maintenance' ? 'bakima alindi' : 'aktif yapildi'
      addToast(`${data.count} oda ${label}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
      queryClient.invalidateQueries({ queryKey: ['capacity-rooms-all'] })
    },
    onError: (err) => addToast(err?.response?.data?.error || 'Bulk islem hatasi', 'error'),
  })

  async function bulkAction(status, blocks) {
    const roomIds = (rooms || [])
      .filter(r => blocks.includes(r.block))
      .filter(r => status === 'active' ? r.status !== 'active' : r.status === 'active')
      .map(r => r.id)
    if (roomIds.length === 0) {
      addToast('Bu islemde degisecek oda yok', 'warning')
      return
    }
    const label = status === 'quarantine' ? 'karantinaya alınacak' : status === 'maintenance' ? 'bakıma alınacak' : 'aktif yapılacak'
    const ok = await confirmDialog({
      title: 'Toplu Oda Durumu',
      body: `${blocks.join(', ')} bloklarında ${roomIds.length} oda ${label}. Onaylar mısın?`,
      danger: status !== 'active',
    })
    if (!ok) return
    bulkStatusMutation.mutate({ room_ids: roomIds, status })
  }

  const { data: pinsData } = useQuery({
    queryKey: ['campus-map-pins'],
    queryFn: () => api.get('/campus-map/pins').then(r => r.data),
    staleTime: 60000,
  })

  // Timeseries — son 14 gun her blok icin gunluk doluluk
  const { data: timeseriesData } = useQuery({
    queryKey: ['campus-map-timeseries'],
    queryFn: () => api.get('/campus-map/timeseries?days=14').then(r => r.data),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })
  const timeseries = timeseriesData?.blocks || {}
  const tsDays = timeseriesData?.days || 14

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

  // Pin entrance animation — 1.2s sonra kapat (animasyon tamamlandi)
  useEffect(() => {
    const t = setTimeout(() => setAnimateIn(false), 1200)
    return () => clearTimeout(t)
  }, [])

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

  // Klavye kisayollari
  useEffect(() => {
    function onKey(e) {
      // Input/textarea'da yazarken kisayollari yakalama
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); setSearchQuery('') }
        else if (selectedBlock) setSelectedBlock(null)
        else if (editMode) setEditMode(false)
        else if (showHelp) setShowHelp(false)
        return
      }
      if (e.key === '?') { setShowHelp(s => !s); return }
      if (e.key === '+' || e.key === '=') { zoomIn(); return }
      if (e.key === '-' || e.key === '_') { zoomOut(); return }
      if (e.key === '0') { resetView(); return }
      if (e.key === 'f' || e.key === 'F') { fitAllPins(); return }
      const step = viewBox.w / 8
      if (e.key === 'ArrowUp')    setViewBox(v => ({ ...v, y: Math.max(-v.h * 0.2, v.y - step * (VIEW_H/VIEW_W)) }))
      if (e.key === 'ArrowDown')  setViewBox(v => ({ ...v, y: Math.min(VIEW_H - v.h * 0.8, v.y + step * (VIEW_H/VIEW_W)) }))
      if (e.key === 'ArrowLeft')  setViewBox(v => ({ ...v, x: Math.max(-v.w * 0.2, v.x - step) }))
      if (e.key === 'ArrowRight') setViewBox(v => ({ ...v, x: Math.min(VIEW_W - v.w * 0.8, v.x + step) }))
      // 1-6: mod degistirme
      const idx = ['1','2','3','4','5','6'].indexOf(e.key)
      if (idx !== -1 && MODES[idx]) setMode(MODES[idx].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, selectedBlock, editMode, showHelp, viewBox.w])

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
  function fitAllPins() {
    const visibleNames = visibleBlocks.map(b => b.block)
    const points = visibleNames.map(n => pins[n]).filter(Boolean)
    if (points.length === 0) { resetView(); return }
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const pad = 60
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
    const w = Math.max(150, maxX - minX)
    const h = Math.max(w * (VIEW_H / VIEW_W), maxY - minY)
    const newW = Math.max(w, h * (VIEW_W / VIEW_H))
    const newH = newW * (VIEW_H / VIEW_W)
    setViewBox({
      x: (minX + maxX) / 2 - newW / 2,
      y: (minY + maxY) / 2 - newH / 2,
      w: newW, h: newH,
    })
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
  async function resetPins() {
    const ok = await confirmDialog({
      title: 'Pin Konumlarını Sıfırla',
      body: 'Tüm pin konumlarını varsayılana sıfırla? (Tüm kullanıcılar için)',
      danger: true,
    })
    if (!ok) return
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
    <div style={{ padding: 12, color: 'var(--text)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pin-pop {
          0%   { transform: scale(0) translateY(-30px); opacity: 0; }
          60%  { transform: scale(1.2) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 24, minWidth: 360, maxWidth: 480, color: 'var(--text)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>KLAVYE KISAYOLLARI</h3>
              <button onClick={() => setShowHelp(false)} style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
              }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px',
              fontFamily: 'var(--mono)', fontSize: 12 }}>
              <kbd style={kbd}>+ / −</kbd><span>Yakinlas / uzaklas</span>
              <kbd style={kbd}>0</kbd><span>Zoom sifirla</span>
              <kbd style={kbd}>F</kbd><span>Tum pin'leri sigdir</span>
              <kbd style={kbd}>← ↑ ↓ →</kbd><span>Pan (kaydir)</span>
              <kbd style={kbd}>1 - 6</kbd><span>Gorunum modlari</span>
              <kbd style={kbd}>Esc</kbd><span>Kapat / iptal</span>
              <kbd style={kbd}>?</kbd><span>Bu yardim ekrani</span>
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, lineHeight: 1.7 }}>
              MOUSE: Tekerlek = zoom • Surukle = pan • Pin tikla = detay<br />
              Ctrl/Shift + tikla = coklu secim (karsilastirma)
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 3, margin: 0 }}>KAMPUS HARITASI<HelpHint topic="campus-map" title="KAMPUS HARITASI" /></h2>
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
          <button onClick={zoomOut} title="Uzaklas (-)" style={zoomBtn}>−</button>
          <button onClick={resetView} title="Sifirla (0)" style={{ ...zoomBtn, fontSize: 10, padding: '4px 8px' }}>RST</button>
          <button onClick={fitAllPins} title="Hepsini sigdir (F)" style={{ ...zoomBtn, fontSize: 10, padding: '4px 8px' }}>FIT</button>
          <button onClick={zoomIn} title="Yakinlas (+)" style={zoomBtn}>+</button>
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
            onChange={e => setImgOpacity(parseFloat(e.target.value))} style={{ width: 60 }} />
        </label>
        <label style={lblToolbar}>
          PIN
          <input type="range" min="0.5" max="1.6" step="0.05" value={pinScale}
            onChange={e => setPinScale(parseFloat(e.target.value))} style={{ width: 60 }}
            title="Tum pin'lerin boyut carpani" />
          <span style={{ minWidth: 28, textAlign: 'right', color: 'var(--text2)' }}>
            {Math.round(pinScale * 100)}%
          </span>
        </label>
        <button onClick={() => setHeatCloud(h => !h)} title="Heat cloud (mod renklerine gore yumusak isi bulutlari)"
          style={chipBtn(heatCloud)}>
          {heatCloud ? '☀ HEAT' : '○ HEAT'}
        </button>
        <button onClick={() => window.print()} title="Yazdir" style={btnGhost}>⎙ YAZDIR</button>
        <button onClick={() => setShowHelp(true)} title="Klavye kisayollari (?)" style={btnGhost}>?</button>
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

      {/* Multi-select aksiyon bar */}
      {multiSelect.size > 0 && (
        <div style={{
          background: 'rgba(240,165,0,0.12)', border: '1px solid var(--accent)', borderRadius: 8,
          padding: '10px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', letterSpacing: 2 }}>
            {multiSelect.size} BLOK SECILI
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', letterSpacing: 1 }}>
            {Array.from(multiSelect).join(' • ')}
          </span>
          <div style={{ flex: 1 }} />
          {isManager && (
            <>
              <button onClick={() => bulkAction('quarantine', Array.from(multiSelect))}
                disabled={bulkStatusMutation.isPending} style={btnDangerSolid}>
                ⊘ KARANTINAYA AL
              </button>
              <button onClick={() => bulkAction('maintenance', Array.from(multiSelect))}
                disabled={bulkStatusMutation.isPending} style={btnWarn}>
                ⚒ BAKIMA AL
              </button>
              <button onClick={() => bulkAction('active', Array.from(multiSelect))}
                disabled={bulkStatusMutation.isPending} style={btnGreen}>
                ✓ AKTIF YAP
              </button>
              <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
            </>
          )}
          <button onClick={() => setMultiSelect(new Set())} style={btnGhost}>
            ✕ TEMIZLE
          </button>
        </div>
      )}

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
          ✎ DUZENLEME — Pini surukle (konum) • Pine tikla (renk/boyut/etiket/gizle) • KAYDET tum kullanicilara yayinlar
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          block={contextMenu.block}
          x={contextMenu.x} y={contextMenu.y}
          isManager={isManager}
          onClose={() => setContextMenu(null)}
          onAction={(action) => {
            const b = contextMenu.block
            setContextMenu(null)
            switch (action) {
              case 'detail':       setSelectedBlock(b); break
              case 'fault':        setQuickFault({ block: b }); break
              case 'cleaning':     navigate(`/housekeeping?block=${b}`); break
              case 'checkin':      navigate(`/checkin?block=${b}`); break
              case 'history':      navigate(`/room-history?block=${b}`); break
              case 'quarantine':   bulkAction('quarantine', [b]); break
              case 'maintenance':  bulkAction('maintenance', [b]); break
              case 'active':       bulkAction('active', [b]); break
              case 'whatsapp':     navigate(`/whatsapp?block=${b}`); break
              case 'copy-link': {
                const url = `${window.location.origin}/campus-map?block=${b}`
                navigator.clipboard?.writeText(url).then(() => addToast('Link kopyalandi', 'success'))
                break
              }
            }
          }}
        />
      )}

      {/* Quick Fault Modal */}
      {quickFault && (
        <QuickFaultModal
          block={quickFault.block}
          onClose={() => setQuickFault(null)}
          onSuccess={() => {
            setQuickFault(null)
            addToast('Ariza talebi acildi', 'success')
            queryClient.invalidateQueries({ queryKey: ['campus-map-summary'] })
          }}
        />
      )}

      {/* Pin Inspector (edit mode) */}
      {editMode && inspectorBlock && (
        <PinInspector
          block={inspectorBlock}
          pin={pins[inspectorBlock]}
          onChange={(updates) => setPins(prev => ({
            ...prev,
            [inspectorBlock]: { ...prev[inspectorBlock], ...updates },
          }))}
          onReset={() => setPins(prev => {
            const cur = prev[inspectorBlock]
            return { ...prev, [inspectorBlock]: { x: cur.x, y: cur.y } }
          })}
          onClose={() => setInspectorBlock(null)}
        />
      )}

      {/* Map + side panel */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flex: 1, minHeight: 480,
        maxHeight: 720, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        <div style={{
          flex: 1, background: '#0a0a0a', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', position: 'relative',
          maxWidth: 900,
        }}>
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none',
              cursor: panning ? 'grabbing' : dragging ? 'grabbing' : (editMode ? 'default' : 'grab') }}
            onMouseMove={onMouseMove}
            onMouseDown={onSvgMouseDown}
            onWheel={onWheel}
          >
            <defs>
              <radialGradient id="heatGreen"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.55"/><stop offset="100%" stopColor="#16a34a" stopOpacity="0"/></radialGradient>
              <radialGradient id="heatYellow"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55"/><stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/></radialGradient>
              <radialGradient id="heatRed"><stop offset="0%" stopColor="#dc2626" stopOpacity="0.6"/><stop offset="100%" stopColor="#dc2626" stopOpacity="0"/></radialGradient>
              <radialGradient id="heatGray"><stop offset="0%" stopColor="#6b7280" stopOpacity="0.45"/><stop offset="100%" stopColor="#6b7280" stopOpacity="0"/></radialGradient>
            </defs>
            <image href="/campus-map.png" x="0" y="0" width={VIEW_W} height={VIEW_H} opacity={imgOpacity} data-pan-bg="1" />
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="rgba(0,0,0,0.18)" data-pan-bg="1" />
            {/* Heat cloud katmani */}
            {heatCloud && Object.entries(pins).map(([block, p]) => {
              const s = stats[block]
              if (!s) return null
              const m = computeMetric(mode, s, BLOCK_BY_NAME[block])
              const grad = m.color === '#16a34a' ? 'heatGreen' : m.color === '#f59e0b' || m.color === '#eab308' ? 'heatYellow' : m.color === '#dc2626' ? 'heatRed' : 'heatGray'
              return <circle key={`heat-${block}`} cx={p.x} cy={p.y} r="55" fill={`url(#${grad})`} pointerEvents="none" />
            })}
            {/* Pan icin gorunmez tutamak — pin uzerinde olmayan tum alan */}
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="transparent" data-pan-bg="1" />
            {/* Hafif vignette */}
            <radialGradient id="vignette">
              <stop offset="60%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
            </radialGradient>
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#vignette)" pointerEvents="none" />

            {visibleBlocks.map((b, idx) => {
              const p = pins[b.block]
              if (!p) return null
              if (p.hidden && !editMode) return null
              const s = stats[b.block]
              const cfg = b
              const metric = computeMetric(mode, s, cfg)
              // Custom overrides
              const customColor = p.color || metric.color
              const customLabel = p.label || b.block
              const isHover = hoverBlock === b.block
              const isSel = selectedBlock === b.block
              const isMulti = multiSelect.has(b.block)
              const isHighlighted = highlightedBlock === b.block
              const baseR = 17 * pinScale * (p.size || 1)
              const r = isSel ? baseR + 3 : (isHover ? baseR + 2 : baseR)
              const pinOpacity = p.hidden ? 0.3 : 1

              // Donut: dis halka = doluluk yuzdesi (her zaman), ic = aktif mod rengi
              const occPct = s?.occupancy_pct || 0
              const occColor = !s?.total_beds ? '#6b7280' : occPct >= 85 ? '#dc2626' : occPct >= 60 ? '#f59e0b' : occPct > 0 ? '#16a34a' : '#6b7280'
              const ringR = r + 4
              const circumference = 2 * Math.PI * ringR
              const dash = (occPct / 100) * circumference

              const animDelay = animateIn ? `${idx * 40}ms` : '0ms'
              return (
                <g key={b.block} opacity={pinOpacity}
                  style={{
                    cursor: editMode ? 'grab' : 'pointer',
                    ...(animateIn ? {
                      transformOrigin: `${p.x}px ${p.y}px`,
                      animation: `pin-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay} backwards`,
                    } : {}),
                  }}
                  onMouseEnter={() => setHoverBlock(b.block)}
                  onMouseLeave={() => setHoverBlock(null)}
                  onContextMenu={(e) => {
                    if (editMode) return
                    e.preventDefault()
                    setContextMenu({ block: b.block, x: e.clientX, y: e.clientY })
                  }}
                  onClick={(e) => {
                    if (editMode) {
                      // Edit modunda tikla = inspector ac
                      setInspectorBlock(b.block)
                      return
                    }
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      setMultiSelect(prev => {
                        const next = new Set(prev)
                        if (next.has(b.block)) next.delete(b.block)
                        else next.add(b.block)
                        return next
                      })
                    } else {
                      setSelectedBlock(b.block)
                      setMultiSelect(new Set())
                    }
                  }}
                >
                  {/* Halo */}
                  {(isHover || isSel) && (
                    <circle cx={p.x} cy={p.y} r={r + 12} fill={customColor} opacity="0.18" />
                  )}
                  {/* Hidden uyarisi (sadece edit modunda) */}
                  {p.hidden && (
                    <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
                      stroke="#6b7280" strokeWidth="1.5" strokeDasharray="2 2" />
                  )}
                  {/* Custom flag (kullanici ozellestirme yapti) */}
                  {(p.color || p.size || p.label) && (
                    <circle cx={p.x - r + 4} cy={p.y - r + 4} r="3.5"
                      fill="var(--accent)" stroke="#000" strokeWidth="0.5"
                      style={{ pointerEvents: 'none' }} />
                  )}
                  {/* Multi-select halka */}
                  {isMulti && (
                    <>
                      <circle cx={p.x} cy={p.y} r={r + 9} fill="none"
                        stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="4 3" />
                      <circle cx={p.x + r - 3} cy={p.y - r + 3} r="6" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
                      <text x={p.x + r - 3} y={p.y - r + 3} textAnchor="middle" dominantBaseline="central"
                        fontFamily="var(--mono)" fontSize="9" fontWeight="700" fill="#000"
                        style={{ pointerEvents: 'none' }}>✓</text>
                    </>
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
                  {/* Ana pin — mode rengi veya custom */}
                  <circle cx={p.x} cy={p.y} r={r}
                    fill={customColor} stroke="#fff" strokeWidth="2"
                    onMouseDown={(e) => onPinMouseDown(e, b.block)}
                  />
                  {/* Blok ismi (veya custom label) */}
                  <text x={p.x} y={p.y - 2} textAnchor="middle" dominantBaseline="central"
                    fontFamily="var(--display)" fontSize={customLabel.length > 3 ? 8 : customLabel.length > 2 ? 9 : 11}
                    fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>
                    {customLabel.length > 6 ? customLabel.slice(0, 6) : customLabel}
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
                        fill="rgba(0,0,0,0.85)" stroke={customColor} strokeWidth="1" />
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
        </div>

        {/* Side panel — multi-select varsa karsilastirma, tek secim varsa detay */}
        {multiSelect.size >= 2 ? (
          <ComparePanel
            blocks={Array.from(multiSelect)}
            stats={stats}
            timeseries={timeseries}
            onClose={() => setMultiSelect(new Set())}
            onSelectSingle={(b) => { setSelectedBlock(b); setMultiSelect(new Set()) }}
          />
        ) : selectedBlock ? (
          <SidePanel
            block={selectedBlock}
            cfg={selCfg}
            stats={sel}
            rooms={selRooms}
            mode={mode}
            timeseries={timeseries[selectedBlock]}
            onClose={() => setSelectedBlock(null)}
            onNavigate={navigate}
            onQuickFault={() => setQuickFault({ block: selectedBlock })}
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

const PRESET_COLORS = [
  '#dc2626', // kirmizi
  '#f59e0b', // turuncu
  '#eab308', // sari
  '#16a34a', // yesil
  '#06b6d4', // cyan
  '#3b82f6', // mavi
  '#8b5cf6', // mor
  '#a855f7', // pembe-mor
  '#ec4899', // pembe
  '#475569', // gri-koyu
  '#6b7280', // gri
  '#000000', // siyah
]

function PinInspector({ block, pin, onChange, onReset, onClose }) {
  if (!pin) return null
  return (
    <div style={{
      position: 'fixed', top: 100, right: 24, zIndex: 100,
      background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10,
      padding: 16, width: 280, color: 'var(--text)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', letterSpacing: 2 }}>
            {block}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            PIN OZELLESTIR
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      {/* Renk */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            RENK {pin.color ? '(OZEL)' : '(MOD)'}
          </span>
          {pin.color && (
            <button onClick={() => onChange({ color: undefined })} style={miniLink}>
              VARSAYILANA DON
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => onChange({ color: c })} style={{
              width: '100%', height: 28, background: c,
              border: pin.color === c ? '2px solid #fff' : '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
              boxShadow: pin.color === c ? '0 0 0 1px var(--accent)' : 'none',
            }} title={c} />
          ))}
        </div>
        <input type="color" value={pin.color || '#888888'}
          onChange={e => onChange({ color: e.target.value })}
          style={{ width: '100%', height: 28, marginTop: 6, border: '1px solid var(--border)',
            borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
      </div>

      {/* Boyut */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            BOYUT {pin.size ? `(${Math.round(pin.size * 100)}%)` : '(STD)'}
          </span>
          {pin.size && (
            <button onClick={() => onChange({ size: undefined })} style={miniLink}>SIFIRLA</button>
          )}
        </div>
        <input type="range" min="0.5" max="2.0" step="0.05" value={pin.size || 1}
          onChange={e => onChange({ size: parseFloat(e.target.value) })}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
          <span>%50</span><span>%100</span><span>%200</span>
        </div>
      </div>

      {/* Etiket */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            ETIKET {pin.label ? '(OZEL)' : `(${block})`}
          </span>
          {pin.label && (
            <button onClick={() => onChange({ label: undefined })} style={miniLink}>SIFIRLA</button>
          )}
        </div>
        <input type="text" placeholder={block} value={pin.label || ''}
          onChange={e => onChange({ label: e.target.value })}
          maxLength={20}
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '6px 10px', color: 'var(--text)',
            fontFamily: 'var(--mono)', fontSize: 12, boxSizing: 'border-box',
          }} />
      </div>

      {/* Gizle toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!pin.hidden}
          onChange={e => onChange({ hidden: e.target.checked || undefined })} />
        Bu pin'i gizle (sadece edit modunda gorunur)
      </label>

      <button onClick={onReset} style={{
        width: '100%', background: 'var(--surface2)', color: 'var(--red)',
        border: '1px solid var(--border)', borderRadius: 6,
        padding: '8px 12px', cursor: 'pointer',
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
      }}>
        ⟲ TUM OZELLESTIRMELERI KALDIR
      </button>
      <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--text3)', textAlign: 'center', letterSpacing: 1 }}>
        Degisiklikler KAYDET butonuna basinca yayinlanir
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
    company:    [
      ['1.SIRKET', s.top_companies?.[0] ? `${s.top_companies[0].company} (${s.top_companies[0].count})` : '—', '#a855f7'],
      ['2.SIRKET', s.top_companies?.[1] ? `${s.top_companies[1].company} (${s.top_companies[1].count})` : '—', '#06b6d4'],
      ['3.SIRKET', s.top_companies?.[2] ? `${s.top_companies[2].company} (${s.top_companies[2].count})` : '—', '#f59e0b'],
    ],
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

function Sparkline({ points, color, width = 300, height = 40 }) {
  if (!points || points.length < 2) return null
  const maxPct = Math.max(...points.map(p => p.occupancy_pct), 100)
  const minPct = Math.min(...points.map(p => p.occupancy_pct), 0)
  const range = Math.max(1, maxPct - minPct)
  const pad = 4
  const pathData = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2)
    const y = height - pad - ((p.occupancy_pct - minPct) / range) * (height - pad * 2)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const areaData = `${pathData} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: 'block' }}>
      <path d={areaData} fill={color} opacity="0.15" />
      <path d={pathData} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const x = pad + (i / (points.length - 1)) * (width - pad * 2)
        const y = height - pad - ((p.occupancy_pct - minPct) / range) * (height - pad * 2)
        return <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3 : 1.5}
          fill={color} stroke="var(--surface2)" strokeWidth={i === points.length - 1 ? 1.5 : 0.5}>
          <title>{p.date}: %{p.occupancy_pct}</title>
        </circle>
      })}
    </svg>
  )
}

function ContextMenu({ block, x, y, isManager, onClose, onAction }) {
  useEffect(() => {
    function onClick(e) {
      // Menu disinda click → kapat
      if (!e.target.closest('[data-ctx-menu]')) onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('click', onClick), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Ekran disina tasmamasi icin
  const menuW = 220, menuH = isManager ? 360 : 220
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)

  const items = [
    { id: 'detail',   icon: '◉', label: 'Detay paneli ac', desc: 'Tam blok detayi' },
    { id: 'fault',    icon: '⚠', label: 'Hizli ariza bildir', desc: 'Bu bloga yeni talep', accent: true },
    { id: 'cleaning', icon: '◈', label: 'Temizlik gorevleri', desc: 'Housekeeping sayfasi' },
    { id: 'checkin',  icon: '↗', label: 'Yeni check-in', desc: 'Personel yerlestir' },
    { id: 'history',  icon: '⊙', label: 'Oda gecmisi' },
    { id: 'whatsapp', icon: '✉', label: 'WhatsApp / Mail' },
    'divider',
    isManager && { id: 'quarantine',  icon: '⊘', label: 'Karantinaya al', danger: true },
    isManager && { id: 'maintenance', icon: '⚒', label: 'Bakima al', warn: true },
    isManager && { id: 'active',      icon: '✓', label: 'Tum odalari aktif yap' },
    isManager && 'divider',
    { id: 'copy-link', icon: '🔗', label: 'Linki kopyala' },
  ].filter(Boolean)

  return (
    <div data-ctx-menu style={{
      position: 'fixed', left, top, width: menuW, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', letterSpacing: 2 }}>
          BLOK {block}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          HIZLI EYLEMLER
        </div>
      </div>
      {items.map((it, i) => {
        if (it === 'divider') return <div key={i} style={{ height: 1, background: 'var(--border)' }} />
        return (
          <button key={it.id} onClick={() => onAction(it.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: 'transparent', border: 'none', textAlign: 'left',
              padding: '8px 12px', cursor: 'pointer',
              color: it.danger ? '#dc2626' : it.warn ? '#f59e0b' : it.accent ? 'var(--accent)' : 'var(--text)',
              fontFamily: 'var(--sans)', fontSize: 12,
              transition: 'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.accent && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: 1 }}>SIK</span>}
          </button>
        )
      })}
    </div>
  )
}

function QuickFaultModal({ block, onClose, onSuccess }) {
  const [roomNo, setRoomNo] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!description.trim() || description.trim().length < 5) {
      useToastStore.getState().addToast('Açıklama gerekli (min 5 karakter)', 'warning'); return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      const location = roomNo ? `${block} - Oda ${roomNo.trim()}` : `${block} - Genel`
      fd.append('location', location)
      fd.append('description', description.trim())
      fd.append('priority', priority)
      if (photo) fd.append('photo_before', photo)
      await api.post('/maintenance/requests', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSuccess()
    } catch (err) {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Gönderilemedi', 'error')
      setSubmitting(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 20, width: 'min(420px, 90vw)', color: 'var(--text)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>HIZLI ARIZA</h3>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
              BLOK {block}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>

        <label style={modalLabel}>ODA NO (OPSIYONEL)</label>
        <input type="text" placeholder="101, 203 vb. (bos = blok geneli)"
          value={roomNo} onChange={e => setRoomNo(e.target.value)} style={modalInput} />

        <label style={modalLabel}>ACIKLAMA *</label>
        <textarea placeholder="Ariza ne? (su sizinti, klima calismiyor, kapi kilidi vb.)"
          value={description} onChange={e => setDescription(e.target.value)}
          rows={4} style={{ ...modalInput, fontFamily: 'var(--sans)', resize: 'vertical' }} />

        <label style={modalLabel}>ONCELIK</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { v: 'normal', label: 'Normal', color: 'var(--text2)' },
            { v: 'high',   label: 'Acil',   color: '#f59e0b' },
            { v: 'urgent', label: 'Cok Acil', color: '#dc2626' },
          ].map(p => (
            <button key={p.v} onClick={() => setPriority(p.v)} style={{
              flex: 1,
              background: priority === p.v ? p.color : 'var(--surface2)',
              color: priority === p.v ? '#000' : 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
            }}>{p.label}</button>
          ))}
        </div>

        <label style={modalLabel}>FOTOGRAF (OPSIYONEL)</label>
        <input type="file" accept="image/*"
          onChange={e => setPhoto(e.target.files?.[0] || null)}
          style={{ marginBottom: 14, color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1, background: 'var(--surface2)', color: 'var(--text2)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '10px 12px', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
          }}>IPTAL</button>
          <button onClick={submit} disabled={submitting} style={{
            flex: 2, background: submitting ? 'var(--surface2)' : '#dc2626',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 12px', cursor: submitting ? 'wait' : 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
          }}>
            {submitting ? 'GONDERILIYOR...' : '⚠ ARIZA BILDIR'}
          </button>
        </div>
      </div>
    </div>
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
    company: [
      ['TOPLAM PERSONEL', t.occupied, 'var(--text)'],
      ['DOLU YATAK', t.occupied, '#16a34a'],
      ['BOS', t.empty, 'var(--accent)'],
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
    company:    [['HER SIRKET FARKLI RENK', '#a855f7'], ['BOS', '#6b7280']],
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

function ComparePanel({ blocks, stats, timeseries = {}, onClose, onSelectSingle }) {
  const items = blocks.map(b => ({ block: b, s: stats[b], cfg: BLOCK_BY_NAME[b] })).filter(x => x.s && x.cfg)
  // Aggregate
  const sum = items.reduce((a, { s }) => ({
    total_beds: a.total_beds + s.total_beds,
    occupied: a.occupied + s.occupied,
    empty_rooms: a.empty_rooms + s.empty_rooms,
    quarantine: a.quarantine + s.quarantine,
    maintenance: a.maintenance + s.maintenance,
    open_faults: a.open_faults + s.open_faults,
    cleaning_done: a.cleaning_done + s.cleaning_done,
    cleaning_total: a.cleaning_total + s.cleaning_total,
    day_count: a.day_count + s.day_count,
    night_count: a.night_count + s.night_count,
  }), { total_beds: 0, occupied: 0, empty_rooms: 0, quarantine: 0, maintenance: 0,
        open_faults: 0, cleaning_done: 0, cleaning_total: 0, day_count: 0, night_count: 0 })

  const avgOcc = sum.total_beds > 0 ? Math.round((sum.occupied / sum.total_beds) * 100) : 0

  return (
    <div style={{
      width: 340, background: 'var(--surface)', border: '1px solid var(--accent)',
      borderRadius: 8, padding: 16, position: 'sticky', top: 20,
      maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', letterSpacing: 2 }}>
            KARSILASTIRMA
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 2 }}>
            {items.length} BLOK • TOPLAM
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      {/* Toplam ozet */}
      <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            ORT. DOLULUK
          </span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)' }}>
            %{avgOcc}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${avgOcc}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 10 }}>
          <MiniStat label="YATAK" value={sum.total_beds} />
          <MiniStat label="DOLU" value={sum.occupied} color="#16a34a" />
          <MiniStat label="BOS ODA" value={sum.empty_rooms} color="var(--accent)" />
          <MiniStat label="ARIZA" value={sum.open_faults} color={sum.open_faults > 0 ? '#dc2626' : 'var(--text)'} />
          <MiniStat label="KARANTINA" value={sum.quarantine} color={sum.quarantine > 0 ? '#dc2626' : 'var(--text3)'} />
          <MiniStat label="PERSONEL" value={sum.day_count + sum.night_count} />
        </div>
      </div>

      {/* Tablo */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>
        BLOK BAZINDA
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>BLOK</th>
              <th style={thStyle}>DOLU/TOP</th>
              <th style={thStyle}>%</th>
              <th style={thStyle}>⚠</th>
              <th style={thStyle}>⊘</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ block, s, cfg }) => {
              const pct = s.occupancy_pct
              const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
              return (
                <tr key={block} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <button onClick={() => onSelectSingle(block)}
                      style={{ background: 'transparent', border: 'none', color: blockColor(block),
                        fontFamily: 'var(--display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                        cursor: 'pointer', padding: 0 }}>
                      {block}
                    </button>
                  </td>
                  <td style={tdStyle}>{s.occupied}/{s.total_beds}</td>
                  <td style={{ ...tdStyle, color, fontWeight: 700 }}>{pct}</td>
                  <td style={{ ...tdStyle, color: s.open_faults > 0 ? '#dc2626' : 'var(--text3)' }}>
                    {s.open_faults}
                  </td>
                  <td style={{ ...tdStyle, color: s.quarantine > 0 ? '#dc2626' : 'var(--text3)' }}>
                    {s.quarantine}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mini bar chart — doluluk karsilastirmasi */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        DOLULUK GORSEL
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {items.map(({ block, s }) => {
          const pct = s.occupancy_pct
          const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
          return (
            <div key={block} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 11, color: blockColor(block), minWidth: 28, letterSpacing: 1 }}>
                {block}
              </span>
              <div style={{ flex: 1, height: 14, background: 'var(--surface2)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
                <span style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', fontWeight: 700,
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                }}>%{pct}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1,
        padding: 8, background: 'var(--surface2)', borderRadius: 4, textAlign: 'center' }}>
        Tek bloga tikla detayli ac • Ctrl+tikla secime ekle/cikar
      </div>
    </div>
  )
}

function SidePanel({ block, cfg, stats: s, rooms, mode, timeseries, onClose, onNavigate, onQuickFault }) {
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

      {/* Sparkline — son 14 gun trend */}
      {timeseries?.points?.length >= 2 && (
        <div style={{ marginBottom: 14, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
              SON {timeseries.points.length} GUN TREND
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
              {(() => {
                const pts = timeseries.points
                const last = pts[pts.length - 1].occupancy_pct
                const prev = pts[Math.max(0, pts.length - 8)].occupancy_pct
                const diff = last - prev
                if (diff === 0) return '— sabit'
                return diff > 0 ? `↑ +${diff}%` : `↓ ${diff}%`
              })()}
            </span>
          </div>
          <Sparkline points={timeseries.points} color={color} />
        </div>
      )}

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
        <button onClick={onQuickFault} style={{
          background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
          letterSpacing: 1, fontWeight: 700, textAlign: 'left',
        }}>
          ⚠ HIZLI ARIZA BILDIR
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={() => onNavigate(`/housekeeping?block=${block}`)} style={btnSecondary}>◈ TEMIZLIK</button>
          <button onClick={() => onNavigate(`/maintenance?block=${block}`)} style={btnSecondary}>⚙ ARIZA LISTE</button>
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
const btnDangerSolid = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700 }
const btnWarn = { background: '#f59e0b', color: '#000', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700 }
const zoomBtn = {
  background: 'transparent', color: 'var(--text2)', border: 'none', borderRadius: 4,
  padding: '4px 9px', cursor: 'pointer', fontFamily: 'var(--mono)',
  fontSize: 14, fontWeight: 700, lineHeight: 1, minWidth: 26,
}
const thStyle = { textAlign: 'left', padding: '6px 4px', color: 'var(--text3)', fontWeight: 400, letterSpacing: 1 }
const tdStyle = { padding: '6px 4px', color: 'var(--text2)' }
const modalLabel = {
  display: 'block', fontFamily: 'var(--mono)', fontSize: 9,
  color: 'var(--text3)', letterSpacing: 1, marginBottom: 4, marginTop: 8,
}
const modalInput = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
  marginBottom: 4,
}
const miniLink = {
  background: 'transparent', border: 'none', color: 'var(--accent)',
  padding: 0, cursor: 'pointer',
  fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, fontWeight: 600,
  textDecoration: 'underline',
}
const kbd = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderBottomWidth: 2, borderRadius: 4,
  padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 11,
  color: 'var(--accent)', letterSpacing: 1, fontWeight: 600,
  minWidth: 28, textAlign: 'center', display: 'inline-block',
}
const searchItemStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
  padding: '8px 10px', cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
  transition: 'background .1s',
}
