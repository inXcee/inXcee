import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import GarmentPicker from './GarmentPicker.jsx'
import { laundryApi } from '../laundry/api.js'
import GarmentChecklist from './GarmentChecklist.jsx'
import EntryForm from './EntryForm.jsx'
import DashboardView from './DashboardView.jsx'
import RoomsView from './RoomsView.jsx'
import MachineView from './MachineView.jsx'
import { blockNeedsSignature } from './constants.js'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME } from '../../shared/blocks.js'

const TABS = [
  { key: 'entry',   icon: '🧺', label: 'Giriş' },
  { key: 'rooms',   icon: '🏠', label: 'Odalar' },
  { key: 'machine', icon: '⚙️', label: 'Makine' },
  { key: 'ironing', icon: '🫧', label: 'Ütü' },
  { key: 'deliver', icon: '🚚', label: 'Teslim' },
  { key: 'status',  icon: '📋', label: 'Durum' },
]
const VALID_TABS = TABS.map(t => t.key)

// ── İmza canvas ──────────────────────────────────────────────────────────────
function SigPad({ sigRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  // expose clear + toDataURL via ref
  useEffect(() => {
    if (sigRef) {
      sigRef.current = {
        isEmpty: () => !hasSig,
        toDataURL: () => canvasRef.current?.toDataURL(),
        clear: () => {
          canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          setHasSig(false)
        },
      }
    }
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault(); drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const draw = useCallback((e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
    setHasSig(true)
  }, [getPos])

  const stopDraw = useCallback(() => { drawing.current = false }, [])

  return (
    <div>
      <canvas ref={canvasRef} width={400} height={140}
        style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      {hasSig && (
        <button type="button" onClick={() => sigRef.current?.clear()}
          className="mt-1 text-xs text-slate-500 hover:text-slate-300">Temizle</button>
      )}
    </div>
  )
}

// ── Blok seçici ──────────────────────────────────────────────────────────────
function BlockPicker({ blocks, block, setBlock }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {blocks.map(b => (
        <button key={b} type="button" onClick={() => setBlock(b)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
          {b}
        </button>
      ))}
    </div>
  )
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function LaundryKioskPage() {
  const [avsToken, setAvsToken] = useState(null)
  const [workerInfo, setWorkerInfo] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [pinInput, setPinInput] = useState('')
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'entry'
  })
  const [focusedBag, setFocusedBag] = useState(null)
  const [focusedRoom, setFocusedRoom] = useState(null) // { block, room_no } | null
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!avsToken) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url)
  }, [activeTab, avsToken])

  const kioskApi = {
    get: url => api.get(url, { headers: { Authorization: `Bearer ${avsToken}` } }),
    post: (url, data) => api.post(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
    put: (url, data) => api.put(url, data, { headers: { Authorization: `Bearer ${avsToken}` } }),
  }

  const handleNameSearch = val => {
    setNameQuery(val)
    setSelectedWorker(null)
    clearTimeout(searchTimer.current)
    if (val.length < 2) { setNameResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/avs-search?q=${encodeURIComponent(val)}`)
        setNameResults(res.data)
      } catch { setNameResults([]) }
    }, 300)
  }

  const handleLogin = async e => {
    e.preventDefault(); setLoginError('')
    if (!selectedWorker) return setLoginError('Listeden bir kişi seçin')
    try {
      const res = await api.post('/auth/avs-login', { worker_id: selectedWorker.id, pin: pinInput })
      setAvsToken(res.data.token)
      setWorkerInfo(res.data.worker)
    } catch (err) { setLoginError(err.response?.data?.error || 'Giriş başarısız') }
  }

  // ── Login ekranı ────────────────────────────────────────────────────────────
  if (!avsToken) {
    return (
      <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🧺</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Çamaşırhane</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>AVS Personel Girişi</p>
          </div>
          <form onSubmit={handleLogin} style={{ background: '#0f172a', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>İsimle Ara</label>
              <input type="text" value={nameQuery} onChange={e => handleNameSearch(e.target.value)}
                placeholder="En az 2 karakter..."
                autoFocus
                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {nameResults.length > 0 && !selectedWorker && (
              <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden' }}>
                {nameResults.map(w => (
                  <button key={w.id} type="button"
                    onClick={() => { setSelectedWorker(w); setNameResults([]) }}
                    disabled={!w.has_pin}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px',
                      background: 'transparent', border: 'none', borderBottom: '1px solid #334155',
                      color: w.has_pin ? '#e2e8f0' : '#475569', cursor: w.has_pin ? 'pointer' : 'not-allowed',
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{w.full_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {w.role_label || '—'}{!w.has_pin ? ' · PIN tanımlı değil' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedWorker && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', borderRadius: 12, padding: '12px 16px' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{selectedWorker.full_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedWorker.role_label || '—'}</div>
                </div>
                <button type="button" onClick={() => { setSelectedWorker(null); setNameQuery(''); setPinInput('') }}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>
                  Değiştir
                </button>
              </div>
            )}

            {selectedWorker && (
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>PIN (4 hane)</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="····"
                  autoFocus
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', color: '#f1f5f9', fontSize: 24, textAlign: 'center', letterSpacing: 8, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            )}

            {loginError && <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{loginError}</div>}

            <button type="submit" disabled={!selectedWorker || pinInput.length !== 4}
              style={{
                padding: '14px', borderRadius: 12, border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                background: (!selectedWorker || pinInput.length !== 4) ? '#1e293b' : '#2563eb',
                color: (!selectedWorker || pinInput.length !== 4) ? '#475569' : '#fff',
              }}>
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Ana ekran ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column' }}>
      {/* Üst bar */}
      <div style={{
        height: 56, background: '#0f172a', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🧺</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Çamaşırhane</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{workerInfo?.full_name}</div>
          {workerInfo?.role_label && <div style={{ fontSize: 11, color: '#64748b' }}>{workerInfo.role_label}</div>}
        </div>
        <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveTab('entry'); setFocusedBag(null) }}
          style={{ fontSize: 12, color: '#94a3b8', padding: '6px 12px', background: '#1e293b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Çıkış
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav className="kiosk-sidenav" style={{
          width: 160, background: '#0b1220', borderRight: '1px solid #1e293b',
          padding: 8, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: activeTab === t.key ? '#1d4ed8' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 600, textAlign: 'left',
              }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div style={{
          flex: 1, padding: 16, overflowY: 'auto', maxWidth: 720,
          margin: '0 auto', width: '100%',
        }}>
          {activeTab === 'entry'   && <EntryForm   kioskApi={kioskApi} focusedRoom={focusedRoom} onConsumeFocus={() => setFocusedRoom(null)} />}
          {activeTab === 'rooms'   && <RoomsView   kioskApi={kioskApi}
                                          onPickRoom={(room) => { setFocusedRoom(room); setActiveTab('entry') }} />}
          {activeTab === 'machine' && <MachineView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'ironing' && <IroningView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'deliver' && <DeliverView kioskApi={kioskApi} focusedBag={focusedBag} onConsumeFocus={() => setFocusedBag(null)} />}
          {activeTab === 'status'  && <DashboardView kioskApi={kioskApi}
                                          onAction={(action, bag) => {
                                            if (action === 'machine') { setFocusedBag(bag); setActiveTab('machine') }
                                            if (action === 'iron')    { setFocusedBag(bag); setActiveTab('ironing') }
                                            if (action === 'deliver') { setFocusedBag(bag); setActiveTab('deliver') }
                                          }} />}
        </div>
      </div>

      {/* Bottom-nav — mobile only */}
      <nav className="kiosk-bottomnav" style={{
        height: 64, background: '#0b1220', borderTop: '1px solid #1e293b',
        display: 'none',
        alignItems: 'stretch', justifyContent: 'space-around',
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 0',
              borderTop: activeTab === t.key ? '3px solid #3b82f6' : '3px solid transparent',
            }}>
            <span style={{ fontSize: 22, opacity: activeTab === t.key ? 1 : 0.55 }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: activeTab === t.key ? '#93c5fd' : '#64748b', fontWeight: 600 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// ── Blok listesi (public, token gerekmez) ─────────────────────────────────────
function useBlocks() {
  return useQuery({
    queryKey: ['kiosk-blocks'],
    queryFn: () => api.get('/self-service/laundry-kiosk/blocks').then(r => r.data),
    staleTime: 60000,
  }).data ?? []
}

function useGarmentTypes() {
  return useQuery({
    queryKey: ['garment-types'],
    queryFn: laundryApi.getGarmentTypes,
    staleTime: 300000,
  }).data ?? []
}

const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const input = { width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const btn = (bg, color = '#fff') => ({ padding: '12px 20px', borderRadius: 12, border: 'none', background: bg, color, fontWeight: 600, fontSize: 14, cursor: 'pointer' })


// ── Ütü ──────────────────────────────────────────────────────────────────────
function IroningView({ kioskApi, focusedBag, onConsumeFocus }) {
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [garments, setGarments] = useState([])
  const [ticked, setTicked] = useState({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await kioskApi.get('/self-service/laundry-kiosk/bags?status=ironing')
      setBags(res.data)
    } catch { setError('Yüklenemedi') } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Auto-select bag if focusedBag provided
  useEffect(() => {
    if (focusedBag && bags.length > 0) {
      const bag = bags.find(b => b.id === focusedBag.id)
      if (bag) {
        selectBag(bag)
        onConsumeFocus?.()
      }
    }
  }, [focusedBag, bags])  // eslint-disable-line react-hooks/exhaustive-deps

  function selectBag(bag) {
    setSelectedBag(bag)
    setError('')
    setTicked({})
    try {
      const parsed = bag.garments_json ? JSON.parse(bag.garments_json) : []
      setGarments(parsed)
    } catch { setGarments([]) }
  }

  function toggleTick(idx) {
    setTicked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const allTicked = garments.length > 0 && garments.every((_, i) => ticked[i])

  async function complete() {
    if (!selectedBag || !allTicked) return
    setError('')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${selectedBag.id}/ironing-complete`, {})
      setSuccess(true)
      setBags(prev => prev.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🫧 Ütü</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Torba hazıra alındı</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      {!selectedBag && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Ütülenecek torbalar ({bags.length})</div>
            <button onClick={load} style={{ ...btn('#334155', '#e2e8f0'), padding: '6px 12px', fontSize: 12 }} disabled={loading}>
              {loading ? '...' : '↻'}
            </button>
          </div>
          {bags.length === 0 && !loading && <div style={{ color: '#475569', fontSize: 13 }}>Ütülenecek torba yok</div>}
          {bags.map(b => (
            <div key={b.id} onClick={() => selectBag(b)}
              style={{ background: '#1e293b', borderRadius: 12, padding: 14, cursor: 'pointer', borderLeft: '3px solid #a78bfa' }}>
              <div style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'monospace', marginBottom: 2 }}>{b.bag_no || `#${b.id}`}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{b.block} Blok — {b.room_no}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {b.item_count} kıyafet{b.intake_name ? ` · ${b.intake_name}` : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {selectedBag && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSelectedBag(null)} style={{ ...btn('#1e293b', '#94a3b8'), padding: '6px 12px', fontSize: 12 }}>← Geri</button>
            <div style={{ fontSize: 13, color: '#a78bfa', fontFamily: 'monospace', fontWeight: 700 }}>{selectedBag.bag_no}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{selectedBag.block} — {selectedBag.room_no}</div>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>KIYAFETLERİ DOĞRULA</div>

          {garments.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13 }}>Kıyafet bilgisi yok — tüm torbayı doğrulayarak devam edin</div>
          )}

          <GarmentChecklist
            garments={garments}
            ticked={ticked}
            onToggle={toggleTick}
            onToggleAll={(all) => {
              const next = {}
              garments.forEach((_, i) => { next[i] = all })
              setTicked(next)
            }}
            variant="ironing"
          />

          <button onClick={complete}
            disabled={garments.length > 0 && !allTicked}
            style={{
              ...btn(garments.length > 0 && !allTicked ? '#1e293b' : '#15803d', garments.length > 0 && !allTicked ? '#475569' : '#fff'),
              padding: 14, fontSize: 14,
            }}>
            ✓ Ütü Tamamla — Hazıra Al
            {garments.length > 0 && !allTicked ? ` (${garments.length}/${garments.length} gerekli)` : ''}
          </button>
        </>
      )}
    </div>
  )
}


// ── Teslim Et ─────────────────────────────────────────────────────────────────
// M ve S = standart akis. Y = premium (ozel banyolu, ironing default).
// Blok listesi tek kaynak `shared/blocks.js` — yeni blok eklenince otomatik dahil.
const BLOCK_GROUPS = [
  { label: 'M Blokları', keys: BLOCKS_BY_TYPE.M },
  { label: 'S Blokları', keys: BLOCKS_BY_TYPE.S },
  { label: 'Y Blokları', keys: BLOCKS_BY_TYPE.Y },
]

function isPremiumBlock(blockKey) {
  return blockKey === 'other' || BLOCK_BY_NAME[blockKey]?.type === 'Y'
}

function DeliverView({ kioskApi, focusedBag, onConsumeFocus }) {
  const sigRef = useRef(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [otherBlock, setOtherBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [deliveredName, setDeliveredName] = useState('')
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [fileCount, setFileCount] = useState(1)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [parsedGarments, setParsedGarments] = useState([])
  const [ticked, setTicked] = useState({})

  const effectiveBlock = selectedBlock === 'other' ? otherBlock.trim() : selectedBlock
  const isPremium = selectedBlock ? isPremiumBlock(selectedBlock) : null

  useEffect(() => {
    setSelectedBag(null)
    setBags([])
    if (!effectiveBlock || !roomNo) return
    kioskApi.get(`/self-service/laundry-kiosk/bags?status=ready&block=${effectiveBlock}&room_no=${roomNo}`)
      .then(r => { setBags(r.data); if (r.data.length === 1) setSelectedBag(r.data[0]) })
      .catch(() => setBags([]))
  }, [effectiveBlock, roomNo])

  // Pre-fill block + room from focusedBag (so bags useEffect fetches the right ones)
  useEffect(() => {
    if (focusedBag) {
      setSelectedBlock(focusedBag.block)
      setRoomNo(String(focusedBag.room_no))
    }
  }, [focusedBag])

  // Auto-select bag once it's loaded
  useEffect(() => {
    if (focusedBag && bags.length > 0) {
      const bag = bags.find(b => b.id === focusedBag.id)
      if (bag) {
        setSelectedBag(bag)
        onConsumeFocus?.()
      }
    }
  }, [focusedBag, bags])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTicked({})
    if (!selectedBag) { setParsedGarments([]); return }
    try {
      const parsed = selectedBag.garments_json ? JSON.parse(selectedBag.garments_json) : []
      setParsedGarments(parsed)
    } catch { setParsedGarments([]) }
  }, [selectedBag])

  function toggleTick(idx) {
    setTicked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const allTicked = parsedGarments.length === 0 || parsedGarments.every((_, i) => ticked[i])

  async function deliver() {
    setError('')
    if (parsedGarments.length > 0 && !allTicked) return setError('Tüm parçaları doğrulayın')
    if (!effectiveBlock || !roomNo.trim()) return setError('Blok ve oda no gerekli')
    if (!deliveredName.trim()) return setError('Ad soyad gerekli')
    if (!selectedBag) return setError('Torba seçilmedi')
    let sig = null
    if (blockNeedsSignature(effectiveBlock)) {
      if (sigRef.current?.isEmpty()) return setError('İmza gerekli')
      sig = sigRef.current?.toDataURL()
    }
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${selectedBag.id}/deliver`, {
        delivered_name: deliveredName.trim(),
        file_count: fileCount,
        signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Teslim tamamlandı!</div>
      <button onClick={() => {
        setSuccess(false); setSelectedBlock(null); setOtherBlock(''); setRoomNo('');
        setDeliveredName(''); setBags([]); setSelectedBag(null); setFileCount(1);
        setParsedGarments([]); setTicked({}); setError('')
      }} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Yeni Teslim</button>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🚚 Teslim Et</h2>

      <div>
        <label style={lbl}>Blok</label>
        {BLOCK_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>{group.label.toUpperCase()}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {group.keys.map(k => (
                <button key={k} type="button" onClick={() => setSelectedBlock(k)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: selectedBlock === k ? '#1d4ed8' : '#1e293b',
                    color: selectedBlock === k ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 14,
                  }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={() => setSelectedBlock('other')}
            style={{
              padding: '8px 14px', borderRadius: 10, border: `1px dashed ${selectedBlock === 'other' ? '#3b82f6' : '#475569'}`,
              cursor: 'pointer', background: selectedBlock === 'other' ? '#1e3a5f' : '#1e293b',
              color: selectedBlock === 'other' ? '#93c5fd' : '#64748b', fontSize: 13,
            }}>
            Diğer…
          </button>
        </div>
        {selectedBlock === 'other' && (
          <input value={otherBlock} onChange={e => setOtherBlock(e.target.value)}
            placeholder="Blok adı girin (ör. B, D2…)"
            style={{ ...input, marginTop: 8 }} />
        )}
        {selectedBlock && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: isPremium ? '#3b0764' : '#1e3a5f', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, color: isPremium ? '#ddd6fe' : '#93c5fd' }}>
              {isPremium ? '🟣 Premium' : '⚪ Regular'}
            </span>
          </div>
        )}
      </div>

      <div>
        <label style={lbl}>Oda No</label>
        <input type="text" inputMode="numeric" value={roomNo} onChange={e => setRoomNo(e.target.value)}
          placeholder="ör. 205" style={input} />
      </div>

      <div>
        <label style={lbl}>Ad Soyad</label>
        <input type="text" value={deliveredName} onChange={e => setDeliveredName(e.target.value)}
          placeholder="Teslim alan kişi" style={input} />
      </div>

      {(effectiveBlock && roomNo) && (
        <div>
          <label style={lbl}>Torba {effectiveBlock && roomNo ? `(${effectiveBlock}-${roomNo} hazır)` : ''}</label>
          {bags.length === 0
            ? <div style={{ color: '#475569', fontSize: 13 }}>Hazır torba bulunamadı</div>
            : bags.map(b => (
                <div key={b.id} onClick={() => setSelectedBag(b)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 14px', marginBottom: 6, cursor: 'pointer',
                    border: `2px solid ${selectedBag?.id === b.id ? '#3b82f6' : '#334155'}`,
                  }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                  <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                    {b.item_count} parça{b.intake_name ? ` · ${b.intake_name}` : ''}
                    {b.is_premium ? ' · 🟣 Premium' : ' · ⚪ Regular'}
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {selectedBag && parsedGarments.length > 0 && (
        <div>
          <label style={lbl}>PARÇALARI DOĞRULA</label>
          <GarmentChecklist
            garments={parsedGarments}
            ticked={ticked}
            onToggle={toggleTick}
            onToggleAll={(all) => {
              const next = {}
              parsedGarments.forEach((_, i) => { next[i] = all })
              setTicked(next)
            }}
            variant="deliver"
          />
        </div>
      )}

      <div>
        <label style={lbl}>File Adedi</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => setFileCount(c => Math.max(1, c - 1))}
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#f1f5f9', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
            −
          </button>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', minWidth: 32, textAlign: 'center' }}>{fileCount}</span>
          <button type="button" onClick={() => setFileCount(c => c + 1)}
            style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#1e293b', color: '#f1f5f9', fontSize: 20, cursor: 'pointer', fontWeight: 700 }}>
            +
          </button>
        </div>
      </div>

      {blockNeedsSignature(effectiveBlock) && (
        <div>
          <label style={lbl}>İmza</label>
          <SigPad sigRef={sigRef} />
        </div>
      )}

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <button onClick={deliver}
        disabled={parsedGarments.length > 0 && !allTicked}
        style={{
          ...btn(
            (parsedGarments.length > 0 && !allTicked) ? '#1e293b' : '#b45309',
            (parsedGarments.length > 0 && !allTicked) ? '#475569' : '#fff'
          ),
          padding: 14, fontSize: 15,
        }}>
        ✓ Teslim Et
        {parsedGarments.length > 0 && !allTicked ? ` (${parsedGarments.length} parça)` : ''}
      </button>
    </div>
  )
}
