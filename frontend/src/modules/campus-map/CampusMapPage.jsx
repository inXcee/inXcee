// Kampüs haritası orkestratörü: SVG zoom/pan/drag, klavye kısayolları, SSE canlı
// olaylar, blok arama, çoklu seçim/toplu işlem ve görünüm modları. Tüm görsel
// parçalar (pin, paneller, modallar, legend) ayrı bileşenlerde; bu dosya state ve
// etkileşim mantığını yönetir.
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
import {
  VIEW_W, VIEW_H, MODES, extractBlock, eventColor, computeMetric, defaultPins,
  chipBtn, lblToolbar, btnGhost, btnGreen, btnAccent, btnDanger, btnDangerSolid, btnWarn,
  zoomBtn, searchItemStyle,
} from './shared.jsx'
import HelpModal from './HelpModal.jsx'
import ModeKpis from './ModeKpis.jsx'
import ModeLegend from './ModeLegend.jsx'
import ContextMenu from './ContextMenu.jsx'
import QuickFaultModal from './QuickFaultModal.jsx'
import PinInspector from './PinInspector.jsx'
import MapPin from './MapPin.jsx'
import HoverCard from './HoverCard.jsx'
import ComparePanel from './ComparePanel.jsx'
import SidePanel from './SidePanel.jsx'
import AttentionQueue from './AttentionQueue.jsx'
import CampusOverviewTable from './CampusOverviewTable.jsx'

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

  // Pin click — edit modunda inspector, normalde seçim/çoklu seçim
  function handlePinClick(e, block) {
    if (editMode) { setInspectorBlock(block); return }
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setMultiSelect(prev => {
        const next = new Set(prev)
        if (next.has(block)) next.delete(block)
        else next.add(block)
        return next
      })
    } else {
      setSelectedBlock(block)
      setMultiSelect(new Set())
    }
  }

  function handlePinContextMenu(e, block) {
    if (editMode) return
    e.preventDefault()
    setContextMenu({ block, x: e.clientX, y: e.clientY })
  }

  return (
    <div style={{ padding: 12, color: 'var(--text)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pin-pop {
          0%   { transform: scale(0) translateY(-30px); opacity: 0; }
          60%  { transform: scale(1.2) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
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

            {visibleBlocks.map((b, idx) => (
              <MapPin
                key={b.block}
                b={b} p={pins[b.block]} s={stats[b.block]} idx={idx}
                mode={mode} pinScale={pinScale} showLabels={showLabels}
                animateIn={animateIn} editMode={editMode}
                isHover={hoverBlock === b.block}
                isSel={selectedBlock === b.block}
                isMulti={multiSelect.has(b.block)}
                isHighlighted={highlightedBlock === b.block}
                pulse={pulseBlocks[b.block]}
                onHoverEnter={setHoverBlock}
                onHoverLeave={() => setHoverBlock(null)}
                onContextMenu={handlePinContextMenu}
                onClick={handlePinClick}
                onPinMouseDown={onPinMouseDown}
              />
            ))}

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
            onPersonClick={(personnelId) => navigate(`/personnel/${personnelId}`)}
          />
        ) : (
          // Blok seçili değilken boş kutu yerine "şu an ne yapılmalı" listesi
          <AttentionQueue
            stats={stats}
            modeDesc={currentMode?.desc}
            onSelect={(b) => { zoomToBlock(b); setSelectedBlock(b) }}
          />
        )}
      </div>

      {/* Tüm blokların sayıları tek tabloda — satıra tıkla haritada göster */}
      <CampusOverviewTable
        stats={stats}
        selectedBlock={selectedBlock}
        onSelect={(b) => { zoomToBlock(b); setSelectedBlock(b) }}
      />
    </div>
  )
}
