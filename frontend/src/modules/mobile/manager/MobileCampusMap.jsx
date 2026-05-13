import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import mobileApi from '../auth/mobileApi.js'
import { BLOCKS, BLOCK_BY_NAME } from '../../../shared/blocks.js'
import { usePullToRefresh } from '../../../shared/hooks/usePullToRefresh.js'

const VIEW_W = 680
const VIEW_H = 822

const MODES = [
  { id: 'occupancy',  label: 'DOLULUK',  icon: '◉' },
  { id: 'faults',     label: 'ARIZA',    icon: '⚠' },
  { id: 'cleaning',   label: 'TEMIZ',    icon: '◈' },
  { id: 'shifts',     label: 'VARDIYA',  icon: '☾' },
  { id: 'quarantine', label: 'KARANT.',  icon: '⊘' },
  { id: 'premium',    label: 'PREMIUM',  icon: '★' },
]

function computeMetric(mode, s, cfg) {
  if (!s || !cfg) return { color: '#6b7280', label: '...', sub: '' }
  switch (mode) {
    case 'occupancy': {
      const pct = s.occupancy_pct
      const has = s.total_beds > 0
      const color = !has ? '#6b7280' : pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
      return { color, label: `%${pct}`, sub: `${s.occupied}/${s.total_beds}` }
    }
    case 'faults': {
      const n = s.open_faults
      const color = n >= 5 ? '#dc2626' : n >= 2 ? '#f59e0b' : n >= 1 ? '#eab308' : '#6b7280'
      return { color, label: n > 0 ? `${n}⚠` : '✓', sub: `${n} ariza` }
    }
    case 'cleaning': {
      const has = s.cleaning_total > 0
      const pct = s.cleaning_pct
      const color = !has ? '#6b7280' : pct >= 80 ? '#16a34a' : pct >= 40 ? '#eab308' : '#dc2626'
      return { color, label: has ? `%${pct}` : '—', sub: has ? `${s.cleaning_done}/${s.cleaning_total}` : 'yok' }
    }
    case 'shifts': {
      const total = s.day_count + s.night_count
      const nightPct = total > 0 ? (s.night_count / total) * 100 : 0
      const color = total === 0 ? '#6b7280' : nightPct >= 60 ? '#8b5cf6' : nightPct >= 30 ? '#3b82f6' : '#f97316'
      return { color, label: `${total}`, sub: `G${s.day_count}/N${s.night_count}` }
    }
    case 'quarantine': {
      const both = s.quarantine + s.maintenance
      const color = s.quarantine > 0 ? '#dc2626' : s.maintenance > 0 ? '#f59e0b' : '#6b7280'
      return { color, label: both > 0 ? `${both}⊘` : '✓', sub: `Q${s.quarantine}/B${s.maintenance}` }
    }
    case 'premium': {
      const isPrem = cfg.type === 'Y', isSos = cfg.type === 'S'
      const color = isPrem ? '#a855f7' : isSos ? '#06b6d4' : '#475569'
      return { color, label: cfg.type, sub: cfg.hasPrivateBath ? 'OZEL' : 'ORTAK' }
    }
    default: return { color: '#6b7280', label: '?', sub: '' }
  }
}

function defaultPins() {
  const pins = {}
  BLOCKS.forEach((b, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    pins[b.block] = { x: 540 + col * 70, y: 40 + row * 42 }
  })
  return pins
}

export default function MobileCampusMap() {
  const navigate = useNavigate()
  const svgRef = useRef(null)
  const [mode, setMode] = useState('occupancy')
  const [view, setView] = useState('map') // map | list
  const [selected, setSelected] = useState(null) // block name
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })
  const touchState = useRef(null)

  const { data: summary, refetch: refetchSummary, isLoading } = useQuery({
    queryKey: ['mobile-campus-summary'],
    queryFn: () => mobileApi.get('/campus-map/summary').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: pinsData } = useQuery({
    queryKey: ['mobile-campus-pins'],
    queryFn: () => mobileApi.get('/campus-map/pins').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const pins = useMemo(() => ({ ...defaultPins(), ...(pinsData?.pins || {}) }), [pinsData])
  const stats = summary?.blocks || {}

  const { isPulling, handlers: pullHandlers } = usePullToRefresh(refetchSummary)

  // Touch handlers — 1 parmak pan, 2 parmak pinch zoom
  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }
  function svgPointFromTouch(touch) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = touch.clientX; pt.y = touch.clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const { x, y } = pt.matrixTransform(m.inverse())
    return { x, y }
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      touchState.current = { type: 'pan', startVx: viewBox.x, startVy: viewBox.y,
        startTx: e.touches[0].clientX, startTy: e.touches[0].clientY, moved: false }
    } else if (e.touches.length === 2) {
      const d = getDistance(e.touches[0], e.touches[1])
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
      const svg = svgRef.current
      const rect = svg.getBoundingClientRect()
      const px = ((cx - rect.left) / rect.width) * viewBox.w + viewBox.x
      const py = ((cy - rect.top) / rect.height) * viewBox.h + viewBox.y
      touchState.current = { type: 'pinch', startD: d, startVB: { ...viewBox }, anchorX: px, anchorY: py }
    }
  }
  function onTouchMove(e) {
    if (!touchState.current) return
    if (touchState.current.type === 'pan' && e.touches.length === 1) {
      const svg = svgRef.current
      const rect = svg.getBoundingClientRect()
      const scaleX = viewBox.w / rect.width
      const scaleY = viewBox.h / rect.height
      const dx = (e.touches[0].clientX - touchState.current.startTx) * scaleX
      const dy = (e.touches[0].clientY - touchState.current.startTy) * scaleY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touchState.current.moved = true
      setViewBox(prev => ({
        ...prev,
        x: Math.max(-prev.w * 0.2, Math.min(VIEW_W - prev.w * 0.8, touchState.current.startVx - dx)),
        y: Math.max(-prev.h * 0.2, Math.min(VIEW_H - prev.h * 0.8, touchState.current.startVy - dy)),
      }))
    } else if (touchState.current.type === 'pinch' && e.touches.length === 2) {
      e.preventDefault()
      const d = getDistance(e.touches[0], e.touches[1])
      const scale = touchState.current.startD / d
      const newW = Math.max(120, Math.min(VIEW_W * 1.2, touchState.current.startVB.w * scale))
      const newH = newW * (VIEW_H / VIEW_W)
      const ratio = newW / touchState.current.startVB.w
      const newX = touchState.current.anchorX - (touchState.current.anchorX - touchState.current.startVB.x) * ratio
      const newY = touchState.current.anchorY - (touchState.current.anchorY - touchState.current.startVB.y) * ratio
      setViewBox({
        x: Math.max(-newW * 0.2, Math.min(VIEW_W - newW * 0.8, newX)),
        y: Math.max(-newH * 0.2, Math.min(VIEW_H - newH * 0.8, newY)),
        w: newW, h: newH,
      })
    }
  }
  function onTouchEnd() {
    touchState.current = null
  }

  function handlePinTap(block) {
    // Eger pan yapildiysa secim acma
    if (touchState.current?.moved) return
    setSelected(block)
  }

  return (
    <div {...pullHandlers} style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a' }}>
      {isPulling && <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 12, color: '#3b82f6', background: '#fff' }}>↓ Yenileniyor...</div>}

      {/* Top bar */}
      <div style={{ background: '#fff', padding: '10px 12px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>Kampus Haritasi</h1>
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 6, padding: 2 }}>
          <button onClick={() => setView('map')} style={viewToggleBtn(view === 'map')}>◉ HARITA</button>
          <button onClick={() => setView('list')} style={viewToggleBtn(view === 'list')}>☰ LISTE</button>
        </div>
      </div>

      {/* Mode chips */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb',
        display: 'flex', overflowX: 'auto', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            flexShrink: 0,
            background: mode === m.id ? '#1f2937' : '#f3f4f6',
            color: mode === m.id ? '#fbbf24' : '#374151',
            border: 'none', borderRadius: 999,
            padding: '6px 12px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 14 }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {view === 'map' ? (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0a0a0a', touchAction: 'none' }}>
          {isLoading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#9ca3af' }}>Harita yukleniyor...</div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <image href="/campus-map.png" x="0" y="0" width={VIEW_W} height={VIEW_H} opacity="0.85" />
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="rgba(0,0,0,0.2)" />

              {BLOCKS.map(b => {
                const p = pins[b.block]
                const s = stats[b.block]
                const m = computeMetric(mode, s, b)
                const r = 20
                return (
                  <g key={b.block} onClick={() => handlePinTap(b.block)}>
                    {/* Tap target — 50px gorunmez halka */}
                    <circle cx={p.x} cy={p.y} r="32" fill="transparent" />
                    {/* Halo when selected */}
                    {selected === b.block && (
                      <circle cx={p.x} cy={p.y} r={r + 10} fill={m.color} opacity="0.3" />
                    )}
                    {/* Shadow */}
                    <circle cx={p.x + 1} cy={p.y + 2} r={r} fill="rgba(0,0,0,0.5)" />
                    {/* Main pin */}
                    <circle cx={p.x} cy={p.y} r={r} fill={m.color} stroke="#fff" strokeWidth="2.5" />
                    <text x={p.x} y={p.y - 3} textAnchor="middle" dominantBaseline="central"
                      fontFamily="ui-sans-serif" fontSize={b.block.length > 2 ? 11 : 13}
                      fontWeight="800" fill="#fff">
                      {b.block}
                    </text>
                    <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="central"
                      fontFamily="ui-monospace" fontSize="9" fontWeight="600" fill="#fff" opacity="0.95">
                      {m.label}
                    </text>
                    {/* Fault badge */}
                    {s?.open_faults > 0 && (
                      <g>
                        <circle cx={p.x + r - 3} cy={p.y - r + 3} r="8" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
                        <text x={p.x + r - 3} y={p.y - r + 3} textAnchor="middle" dominantBaseline="central"
                          fontFamily="ui-monospace" fontSize="10" fontWeight="700" fill="#fff">
                          {s.open_faults}
                        </text>
                      </g>
                    )}
                    {/* Karantina ring */}
                    {s?.quarantine > 0 && (
                      <circle cx={p.x} cy={p.y} r={r + 5} fill="none"
                        stroke="#dc2626" strokeWidth="2" strokeDasharray="4 3" />
                    )}
                  </g>
                )
              })}
            </svg>
          )}

          {/* Zoom controls */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => {
              const f = 0.7
              const cx = viewBox.x + viewBox.w / 2, cy = viewBox.y + viewBox.h / 2
              const newW = Math.max(120, viewBox.w * f), newH = newW * (VIEW_H / VIEW_W)
              setViewBox({ x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH })
            }} style={zoomCircleBtn}>+</button>
            <button onClick={() => {
              const f = 1.4
              const cx = viewBox.x + viewBox.w / 2, cy = viewBox.y + viewBox.h / 2
              const newW = Math.min(VIEW_W * 1.2, viewBox.w * f), newH = newW * (VIEW_H / VIEW_W)
              setViewBox({
                x: Math.max(-newW * 0.2, Math.min(VIEW_W - newW * 0.8, cx - newW / 2)),
                y: Math.max(-newH * 0.2, Math.min(VIEW_H - newH * 0.8, cy - newH / 2)),
                w: newW, h: newH,
              })
            }} style={zoomCircleBtn}>−</button>
            <button onClick={() => setViewBox({ x: 0, y: 0, w: VIEW_W, h: VIEW_H })}
              style={{ ...zoomCircleBtn, fontSize: 10 }}>RST</button>
          </div>

          {/* Hint */}
          <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)',
            color: '#fff', fontSize: 10, padding: '4px 8px', borderRadius: 4 }}>
            ⌖ 2 parmak zoom • tek parmak pan
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', background: '#f3f4f6', padding: 12 }}>
          {BLOCKS.map(b => {
            const s = stats[b.block]
            const m = computeMetric(mode, s, b)
            return (
              <button key={b.block} onClick={() => { setSelected(b.block); setView('map') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  background: '#fff', border: 'none', borderRadius: 10,
                  padding: 12, marginBottom: 6, textAlign: 'left',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: m.color, color: '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontWeight: 700,
                }}>
                  <div style={{ fontSize: 13 }}>{b.block}</div>
                  <div style={{ fontSize: 8, opacity: 0.95, marginTop: -2 }}>{m.label}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                    Blok {b.block} <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 400 }}>• TIP {b.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {s ? `${s.occupied}/${s.total_beds} dolu • %${s.occupancy_pct}` : 'yukleniyor...'}
                  </div>
                </div>
                {s?.open_faults > 0 && (
                  <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999,
                    padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{s.open_faults} ⚠</span>
                )}
                {s?.quarantine > 0 && (
                  <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 999,
                    padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>⊘ {s.quarantine}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Bottom sheet */}
      {selected && (
        <BlockSheet
          block={selected}
          stats={stats[selected]}
          cfg={BLOCK_BY_NAME[selected]}
          onClose={() => setSelected(null)}
          onNavigate={navigate}
        />
      )}
    </div>
  )
}

function BlockSheet({ block, stats: s, cfg, onClose, onNavigate }) {
  const [expanded, setExpanded] = useState(false)
  if (!s || !cfg) return null
  const pct = s.occupancy_pct
  const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
      }} />
      <div style={{
        position: 'fixed', bottom: 60, left: 0, right: 0, zIndex: 50,
        background: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: '8px 16px 20px', maxHeight: expanded ? '85vh' : '50vh',
        overflowY: 'auto',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
        transition: 'max-height .25s',
      }}>
        {/* Drag handle */}
        <div onClick={() => setExpanded(e => !e)} style={{
          width: 40, height: 4, background: '#d1d5db', borderRadius: 2,
          margin: '0 auto 12px', cursor: 'pointer',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#111', letterSpacing: 1.5 }}>BLOK {block}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              TIP {cfg.type} • {cfg.floors} KAT • {cfg.hasPrivateBath ? 'OZEL BANYO' : 'ORTAK BANYO'}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: '#f3f4f6', border: 'none', borderRadius: 8,
            width: 34, height: 34, fontSize: 16, color: '#374151',
          }}>✕</button>
        </div>

        {/* Doluluk bar */}
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>DOLULUK</span>
            <span style={{ fontSize: 16, fontWeight: 800, color }}>%{pct}</span>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
            {s.occupied} / {s.total_beds} yatak
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
          <Stat label="ODA" value={s.total_rooms} />
          <Stat label="BOS" value={s.empty_rooms} color="#f59e0b" />
          <Stat label="DOLU ODA" value={s.full_rooms} color={s.full_rooms > 0 ? '#dc2626' : '#111'} />
          <Stat label="ARIZA" value={s.open_faults} color={s.open_faults > 0 ? '#dc2626' : '#111'} />
          <Stat label="KARANTINA" value={s.quarantine} color={s.quarantine > 0 ? '#dc2626' : '#9ca3af'} />
          <Stat label="BAKIM" value={s.maintenance} color={s.maintenance > 0 ? '#f59e0b' : '#9ca3af'} />
        </div>

        {/* Vardiya */}
        {(s.day_count + s.night_count) > 0 && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>
              <span>VARDIYA DAGILIMI</span>
              <span>{s.day_count + s.night_count} kisi</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(s.day_count / (s.day_count + s.night_count)) * 100}%`, background: '#f97316' }} />
              <div style={{ width: `${(s.night_count / (s.day_count + s.night_count)) * 100}%`, background: '#8b5cf6' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, fontWeight: 600 }}>
              <span style={{ color: '#f97316' }}>☀ Gunduz {s.day_count}</span>
              <span style={{ color: '#8b5cf6' }}>☾ Gece {s.night_count}</span>
            </div>
          </div>
        )}

        {/* Temizlik */}
        {s.cleaning_total > 0 && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>
              <span>BUGUN TEMIZLIK</span>
              <span style={{ color: '#16a34a' }}>%{s.cleaning_pct}</span>
            </div>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${s.cleaning_pct}%`, height: '100%', background: '#16a34a' }} />
            </div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>
              {s.cleaning_done}/{s.cleaning_total} tamamlandi
              {s.cleaning_skipped > 0 ? ` • ${s.cleaning_skipped} atlandi` : ''}
            </div>
          </div>
        )}

        {/* Top sirketler */}
        {expanded && s.top_companies?.length > 0 && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>ANA SIRKETLER</div>
            {s.top_companies.map(c => (
              <div key={c.company} style={{ display: 'flex', justifyContent: 'space-between',
                fontSize: 13, padding: '4px 0', color: '#111' }}>
                <span>{c.company}</span>
                <span style={{ fontWeight: 700, color: '#1f2937' }}>{c.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 14 }}>
          <button onClick={() => onNavigate(`/mobile/manager/heatmap`)} style={btnSheetSec}>
            Doluluk Listesi
          </button>
          <button onClick={() => onNavigate(`/mobile/manager/maintenance`)} style={btnSheetSec}>
            Bakim Talepleri
          </button>
        </div>

        <button onClick={() => setExpanded(e => !e)} style={{
          width: '100%', marginTop: 8, padding: 8,
          background: 'transparent', border: 'none',
          color: '#6b7280', fontSize: 12, fontWeight: 600,
        }}>
          {expanded ? '▼ KUCULT' : '▲ DETAYLI GOR'}
        </button>
      </div>
    </>
  )
}

function Stat({ label, value, color = '#111' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 600, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function viewToggleBtn(active) {
  return {
    background: active ? '#1f2937' : 'transparent',
    color: active ? '#fbbf24' : '#6b7280',
    border: 'none', borderRadius: 4,
    padding: '4px 10px', fontSize: 11, fontWeight: 700,
    letterSpacing: 0.5, cursor: 'pointer',
  }
}

const zoomCircleBtn = {
  width: 40, height: 40, borderRadius: '50%',
  background: 'rgba(255,255,255,0.95)', border: 'none',
  fontSize: 18, fontWeight: 700, color: '#1f2937',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  cursor: 'pointer',
}

const btnSheetSec = {
  background: '#f3f4f6', color: '#1f2937', border: 'none', borderRadius: 8,
  padding: '10px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
