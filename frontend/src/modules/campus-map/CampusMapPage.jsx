import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { BLOCKS, BLOCK_BY_NAME, blockColor } from '../../shared/blocks.js'

// Resmin gerçek ölçüsü: 680 x 822 (portre)
const VIEW_W = 680
const VIEW_H = 822

// Pin varsayilan konumlari — resmin sag kenarinda dikey liste halinde
function defaultPins() {
  const pins = {}
  const blocks = BLOCKS.map(b => b.block)
  const cols = 2
  const startX = 580
  const startY = 40
  const dy = 36
  blocks.forEach((b, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    pins[b] = { x: startX + col * 50, y: startY + row * dy }
  })
  return pins
}

function occupancyColor(pct, hasBeds) {
  if (!hasBeds) return '#6b7280'
  if (pct >= 85) return '#dc2626'
  if (pct >= 60) return '#f59e0b'
  if (pct > 0)   return '#16a34a'
  return '#6b7280'
}

function aggregateByBlock(rooms) {
  const map = {}
  for (const b of BLOCKS) {
    map[b.block] = {
      block: b.block, type: b.type,
      totalBeds: 0, occupied: 0, emptyRooms: 0, totalRooms: 0,
      quarantine: 0, maintenance: 0, fault: 0,
    }
  }
  for (const r of rooms || []) {
    const m = map[r.block]
    if (!m) continue
    m.totalRooms++
    if (r.status === 'quarantine') m.quarantine++
    else if (r.status === 'maintenance') m.maintenance++
    else {
      m.totalBeds += r.active_beds || 0
      m.occupied += r.occupied || 0
      if ((r.occupied || 0) === 0) m.emptyRooms++
    }
    m.fault += r.open_fault_count || 0
  }
  for (const k of Object.keys(map)) {
    const m = map[k]
    m.occupancyPct = m.totalBeds > 0 ? Math.round((m.occupied / m.totalBeds) * 100) : 0
  }
  return map
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
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [hoverBlock, setHoverBlock] = useState(null)
  const [showLabels, setShowLabels] = useState(true)
  const [imgOpacity, setImgOpacity] = useState(1)

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['capacity-rooms-all'],
    queryFn: () => api.get('/capacity/rooms').then(r => r.data),
    staleTime: 30000,
    refetchInterval: 30000,
  })

  // Pin konumlarini sunucudan cek (tum kullanicilar ayni haritayi gorur)
  const { data: pinsData } = useQuery({
    queryKey: ['campus-map-pins'],
    queryFn: () => api.get('/campus-map/pins').then(r => r.data),
    staleTime: 60000,
  })

  useEffect(() => {
    if (pinsData?.pins && !editMode) {
      setPins({ ...defaultPins(), ...pinsData.pins })
    }
  }, [pinsData, editMode])

  const savePinsMutation = useMutation({
    mutationFn: (newPins) => api.put('/campus-map/pins', { pins: newPins }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus-map-pins'] })
      addToast('Pin konumlari kaydedildi', 'success')
      setEditMode(false)
    },
    onError: (err) => {
      addToast(err?.response?.data?.error || 'Kaydedilemedi', 'error')
    },
  })

  const stats = useMemo(() => aggregateByBlock(rooms), [rooms])

  const totalStats = useMemo(() => {
    let totalBeds = 0, occupied = 0, empty = 0, q = 0, m = 0, f = 0
    for (const s of Object.values(stats)) {
      totalBeds += s.totalBeds; occupied += s.occupied
      empty += s.emptyRooms; q += s.quarantine; m += s.maintenance; f += s.fault
    }
    return { totalBeds, occupied, empty, quarantine: q, maintenance: m, fault: f }
  }, [stats])

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

  function onMouseMove(e) {
    if (!dragging) return
    const { x, y } = svgPoint(e)
    setPins(prev => ({
      ...prev,
      [dragging.block]: {
        x: Math.max(15, Math.min(VIEW_W - 15, x - dragging.offsetX)),
        y: Math.max(15, Math.min(VIEW_H - 15, y - dragging.offsetY)),
      }
    }))
  }

  function savePins() {
    savePinsMutation.mutate(pins)
  }

  function resetPins() {
    if (!confirm('Tum pin konumlarini varsayilana sifirla? (Tum kullanicilar icin)')) return
    const def = defaultPins()
    setPins(def)
    savePinsMutation.mutate(def)
  }

  useEffect(() => {
    if (!dragging) return
    const handleUp = () => setDragging(null)
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [dragging])

  const visibleBlocks = useMemo(() => {
    return BLOCKS.filter(b => typeFilter === 'all' || b.type === typeFilter)
  }, [typeFilter])

  const sel = selectedBlock ? stats[selectedBlock] : null
  const selCfg = selectedBlock ? BLOCK_BY_NAME[selectedBlock] : null
  const selRooms = useMemo(() => {
    if (!selectedBlock) return []
    return (rooms || []).filter(r => r.block === selectedBlock)
  }, [selectedBlock, rooms])

  return (
    <div style={{ padding: 20, color: 'var(--text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 3, margin: 0 }}>KAMPUS HARITASI</h2>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
            {isLoading ? 'YUKLENIYOR...' : `${BLOCKS.length} BLOK • ${totalStats.totalBeds} YATAK • %${totalStats.totalBeds > 0 ? Math.round((totalStats.occupied / totalStats.totalBeds) * 100) : 0} DOLULUK`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'M', 'S', 'Y'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={chipBtn(typeFilter === t)}>
              {t === 'all' ? 'TUMU' : `${t} TIPI`}
            </button>
          ))}
          <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', cursor: 'pointer', letterSpacing: 1 }}>
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            ETIKETLER
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
            HARITA OPAK
            <input type="range" min="0.3" max="1" step="0.05" value={imgOpacity}
              onChange={e => setImgOpacity(parseFloat(e.target.value))}
              style={{ width: 70 }} />
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
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="TOPLAM YATAK" value={totalStats.totalBeds} color="var(--text)" />
        <Kpi label="DOLU" value={totalStats.occupied} color="#16a34a" />
        <Kpi label="BOS ODA" value={totalStats.empty} color="var(--accent)" />
        <Kpi label="KARANTINA" value={totalStats.quarantine} color="#dc2626" />
        <Kpi label="BAKIM" value={totalStats.maintenance} color="#f59e0b" />
        <Kpi label="ACIK ARIZA" value={totalStats.fault} color={totalStats.fault > 0 ? '#dc2626' : 'var(--text3)'} />
      </div>

      {editMode && (
        <div style={{
          background: 'rgba(240,165,0,0.08)', border: '1px solid var(--accent)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 10,
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', letterSpacing: 1,
        }}>
          ✎ DUZENLEME — Pinleri sahip oldugu binanin uzerine surukle. Harita opakligini azalt, etiketleri okuyarak yerlestir. Bittiginde KAYDET.
        </div>
      )}

      {/* Map + side panel */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{
          flex: 1, background: '#0a0a0a', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', position: 'relative',
          maxWidth: 760,
        }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none', cursor: dragging ? 'grabbing' : 'default' }}
            onMouseMove={onMouseMove}
          >
            <image href="/campus-map.png" x="0" y="0" width={VIEW_W} height={VIEW_H} opacity={imgOpacity} />

            {visibleBlocks.map(b => {
              const p = pins[b.block]
              if (!p) return null
              const s = stats[b.block]
              const hasBeds = (s?.totalBeds || 0) > 0
              const color = occupancyColor(s?.occupancyPct || 0, hasBeds)
              const isHover = hoverBlock === b.block
              const isSel = selectedBlock === b.block
              const r = isSel ? 16 : (isHover ? 15 : 13)
              const labelOffset = r + 9

              return (
                <g key={b.block}
                  onMouseEnter={() => setHoverBlock(b.block)}
                  onMouseLeave={() => setHoverBlock(null)}
                  onClick={() => !editMode && setSelectedBlock(b.block)}
                  style={{ cursor: editMode ? 'grab' : 'pointer' }}
                >
                  {/* Outer halo on hover/select */}
                  {(isHover || isSel) && (
                    <circle cx={p.x} cy={p.y} r={r + 6} fill={color} opacity="0.25" />
                  )}
                  {/* Pin shadow */}
                  <circle cx={p.x + 1} cy={p.y + 2} r={r} fill="rgba(0,0,0,0.45)" />
                  {/* Main pin */}
                  <circle
                    cx={p.x} cy={p.y} r={r}
                    fill={color}
                    stroke="#fff" strokeWidth="2.5"
                    onMouseDown={(e) => onPinMouseDown(e, b.block)}
                  />
                  {/* Block label inside pin */}
                  <text
                    x={p.x} y={p.y}
                    textAnchor="middle" dominantBaseline="central"
                    fontFamily="var(--display)"
                    fontSize={b.block.length > 2 ? 9 : 11}
                    fontWeight="700"
                    fill="#fff"
                    style={{ pointerEvents: 'none' }}
                  >
                    {b.block}
                  </text>

                  {/* Side label: dolu/toplam */}
                  {showLabels && hasBeds && (
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={p.x + labelOffset - 2}
                        y={p.y - 9}
                        width={42} height={18}
                        rx={4}
                        fill="rgba(0,0,0,0.85)"
                        stroke={color}
                        strokeWidth="1"
                      />
                      <text
                        x={p.x + labelOffset + 19}
                        y={p.y + 1}
                        textAnchor="middle" dominantBaseline="central"
                        fontFamily="var(--mono)" fontSize="10" fontWeight="600"
                        fill="#fff"
                      >
                        {s.occupied}/{s.totalBeds}
                      </text>
                    </g>
                  )}

                  {/* Fault badge */}
                  {s?.fault > 0 && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={p.x + r - 2} cy={p.y - r + 2} r="7" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
                      <text x={p.x + r - 2} y={p.y - r + 2} textAnchor="middle" dominantBaseline="central"
                        fontFamily="var(--mono)" fontSize="9" fontWeight="700" fill="#fff">{s.fault}</text>
                    </g>
                  )}

                  {/* Quarantine indicator (dashed ring) */}
                  {s?.quarantine > 0 && (
                    <circle cx={p.x} cy={p.y} r={r + 3} fill="none"
                      stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3"
                      style={{ pointerEvents: 'none' }} />
                  )}
                </g>
              )
            })}

            {/* Hover detail card */}
            {hoverBlock && !editMode && !dragging && (() => {
              const p = pins[hoverBlock]
              const s = stats[hoverBlock]
              const cfg = BLOCK_BY_NAME[hoverBlock]
              if (!p || !s || !cfg) return null
              const w = 180, h = 110
              let tx = p.x + 22
              let ty = p.y - h / 2
              if (tx + w > VIEW_W) tx = p.x - 22 - w
              if (ty < 0) ty = 0
              if (ty + h > VIEW_H) ty = VIEW_H - h
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={tx} y={ty} width={w} height={h} rx={6}
                    fill="rgba(10,10,10,0.95)" stroke="var(--accent)" strokeWidth="1.5" />
                  <text x={tx + 10} y={ty + 18} fontFamily="var(--display)" fontSize="14"
                    fill="#fff" letterSpacing="1.5">BLOK {hoverBlock}</text>
                  <text x={tx + w - 10} y={ty + 18} textAnchor="end"
                    fontFamily="var(--mono)" fontSize="9" fill="var(--text3)" letterSpacing="1">
                    TIP {cfg.type} • {cfg.floors}K
                  </text>
                  <line x1={tx + 8} x2={tx + w - 8} y1={ty + 26} y2={ty + 26} stroke="var(--border)" strokeWidth="0.5" />
                  <text x={tx + 10} y={ty + 44} fontFamily="var(--mono)" fontSize="11" fontWeight="600" fill="#16a34a">
                    {s.occupied}/{s.totalBeds}
                  </text>
                  <text x={tx + 70} y={ty + 44} fontFamily="var(--mono)" fontSize="11" fill="var(--text2)">
                    %{s.occupancyPct} dolu
                  </text>
                  <text x={tx + 10} y={ty + 62} fontFamily="var(--mono)" fontSize="10" fill="var(--accent)">
                    {s.emptyRooms} bos / {s.totalRooms} oda
                  </text>
                  {s.quarantine > 0 && (
                    <text x={tx + 10} y={ty + 78} fontFamily="var(--mono)" fontSize="10" fill="#dc2626">
                      ⊘ {s.quarantine} karantina
                    </text>
                  )}
                  {s.maintenance > 0 && (
                    <text x={tx + 10} y={ty + 78 + (s.quarantine > 0 ? 14 : 0)} fontFamily="var(--mono)" fontSize="10" fill="#f59e0b">
                      ⚒ {s.maintenance} bakim
                    </text>
                  )}
                  {s.fault > 0 && (
                    <text x={tx + 10} y={ty + h - 8} fontFamily="var(--mono)" fontSize="10" fill="#dc2626">
                      ⚠ {s.fault} acik ariza
                    </text>
                  )}
                </g>
              )
            })()}
          </svg>

          {/* Legend overlay */}
          <div style={{
            position: 'absolute', left: 12, bottom: 12,
            background: 'rgba(10,10,10,0.85)', borderRadius: 6,
            padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
            fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', letterSpacing: 1,
            border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text3)', marginBottom: 2 }}>DOLULUK</div>
            <LegendRow color="#16a34a" label="< %60" />
            <LegendRow color="#f59e0b" label="%60-85" />
            <LegendRow color="#dc2626" label="> %85" />
            <LegendRow color="#6b7280" label="BOS" />
          </div>
        </div>

        {/* Side panel */}
        {selectedBlock ? (
          <SidePanel
            block={selectedBlock}
            cfg={selCfg}
            stats={sel}
            rooms={selRooms}
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
              Oda detayi, doluluk ve hizli eylemler burada gosterilir
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function SidePanel({ block, cfg, stats: s, rooms, onClose, onNavigate }) {
  if (!cfg || !s) return null
  const pct = s.occupancyPct
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

      {/* Occupancy progress bar */}
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
          {s.occupied} / {s.totalBeds} yatak
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 14 }}>
        <MiniStat label="ODA" value={s.totalRooms} />
        <MiniStat label="BOS" value={s.emptyRooms} color="var(--accent)" />
        <MiniStat label="ARIZA" value={s.fault} color={s.fault > 0 ? '#dc2626' : 'var(--text)'} />
        {s.quarantine > 0 && <MiniStat label="KARANTINA" value={s.quarantine} color="#dc2626" />}
        {s.maintenance > 0 && <MiniStat label="BAKIM" value={s.maintenance} color="#f59e0b" />}
      </div>

      {/* Floor-by-floor room grid */}
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
                      <div style={{
                        position: 'absolute', top: -3, right: -3,
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#dc2626', border: '1.5px solid var(--surface)',
                      }} />
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
          <button onClick={() => onNavigate(`/housekeeping?block=${block}`)} style={btnSecondary}>
            ◈ TEMIZLIK
          </button>
          <button onClick={() => onNavigate(`/maintenance?block=${block}`)} style={btnSecondary}>
            ⚙ ARIZA
          </button>
          <button onClick={() => onNavigate(`/room-history?block=${block}`)} style={btnSecondary}>
            ⊙ GECMIS
          </button>
          <button onClick={() => onNavigate(`/checkin?block=${block}`)} style={btnSecondary}>
            ↗ CHECK-IN
          </button>
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

function LegendRow({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 9, height: 9, background: color, borderRadius: '50%', display: 'inline-block', border: '1px solid #fff' }} />
      <span>{label}</span>
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
