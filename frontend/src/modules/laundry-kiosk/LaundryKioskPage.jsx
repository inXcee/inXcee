import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import GarmentPicker from './GarmentPicker.jsx'
import { laundryApi } from '../laundry/api.js'

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
  const [activeAction, setActiveAction] = useState(null)
  const searchTimer = useRef(null)

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
    <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 15 }}>{workerInfo?.full_name}</div>
          {workerInfo?.role_label && <div style={{ fontSize: 12, color: '#64748b' }}>{workerInfo.role_label}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeAction && (
            <button onClick={() => setActiveAction(null)}
              style={{ fontSize: 12, color: '#94a3b8', padding: '6px 12px', background: '#1e293b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              ← Geri
            </button>
          )}
          <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveAction(null) }}
            style={{ fontSize: 12, color: '#64748b', padding: '6px 12px', background: '#1e293b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Çıkış
          </button>
        </div>
      </div>

      {!activeAction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'bag',     icon: '🧺', label: 'Torba Bırak', bg: '#1e3a5f' },
              { key: 'ironing', icon: '🫧', label: 'Ütü',          bg: '#4a1d96' },
            ].map(a => (
              <button key={a.key} onClick={() => setActiveAction(a.key)}
                style={{
                  background: a.bg, border: 'none', borderRadius: 16, padding: '28px 16px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <span style={{ fontSize: 40 }}>{a.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{a.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { key: 'deliver', icon: '🚚', label: 'Teslim Et',   bg: '#451a03' },
              { key: 'status',  icon: '📋', label: 'Durum',        bg: '#1c1917' },
              { key: 'garment', icon: '👔', label: 'Kıyafet Gir', bg: '#3b0764' },
            ].map(a => (
              <button key={a.key} onClick={() => setActiveAction(a.key)}
                style={{
                  background: a.bg, border: 'none', borderRadius: 16, padding: '20px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <span style={{ fontSize: 32 }}>{a.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', textAlign: 'center' }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeAction === 'bag'     && <BagForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'ironing' && <IroningView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'deliver' && <DeliverView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'status'  && <StatusView kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
      {activeAction === 'garment' && <GarmentForm kioskApi={kioskApi} onDone={() => setActiveAction(null)} />}
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

// ── Torba Al ──────────────────────────────────────────────────────────────────
function BagForm({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const blocks = useBlocks()
  const garmentTypes = useGarmentTypes()
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [itemCount, setItemCount] = useState(1)
  const [isPremium, setIsPremium] = useState(false)
  const [garments, setGarments] = useState([])
  const [notes, setNotes] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [success, setSuccess] = useState(false)
  const [bagNo, setBagNo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (block && roomNo) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => { setPersons(r.data); setSelectedPerson(null) })
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  async function handleSubmit() {
    setError('')
    if (!block || !roomNo) return setError('Blok ve oda no gerekli')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      const res = await kioskApi.post('/self-service/laundry-kiosk/bag', {
        block, room_no: roomNo,
        personnel_id: selectedPerson?.id || null,
        item_count: itemCount,
        is_premium: isPremium,
        garments: garments.length > 0 ? garments : null,
        notes: notes || null,
        urgent,
        intake_signature: sig,
      })
      setBagNo(res.data.bag_no)
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata oluştu') }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Torba kaydedildi!</div>
      {bagNo && (
        <div style={{ marginTop: 16, background: '#0f172a', borderRadius: 12, padding: '16px 24px', display: 'inline-block' }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 2, marginBottom: 4 }}>TORBA NO</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: 4 }}>{bagNo}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Torbayı görevliye teslim edin</div>
        </div>
      )}
      <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🧺 Torba Al</h2>

      <div><label style={lbl}>Blok</label><BlockPicker blocks={blocks} block={block} setBlock={setBlock} /></div>

      <div><label style={lbl}>Oda No</label>
        <input type="text" inputMode="numeric" value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="ör. 205" style={input} />
      </div>

      {persons.length > 0 && (
        <div>
          <label style={lbl}>Kişi (opsiyonel)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" onClick={() => setSelectedPerson(null)}
              style={{ ...btn(!selectedPerson ? '#334155' : '#1e293b', !selectedPerson ? '#e2e8f0' : '#64748b'), textAlign: 'left' }}>
              Kişisiz
            </button>
            {persons.map(p => (
              <button key={p.id} type="button" onClick={() => setSelectedPerson(p)}
                style={{ ...btn(selectedPerson?.id === p.id ? '#1d4ed8' : '#1e293b', selectedPerson?.id === p.id ? '#fff' : '#94a3b8'), textAlign: 'left' }}>
                {p.full_name}{p.company ? ` · ${p.company}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div><label style={lbl}>Adet</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[1,2,3,4,5,6,7,8].map(n => (
            <button key={n} type="button" onClick={() => setItemCount(n)}
              style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: itemCount === n ? '#1d4ed8' : '#1e293b', color: itemCount === n ? '#fff' : '#64748b', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setIsPremium(v => !v)}
          style={{ ...btn(isPremium ? '#581c87' : '#1e293b', isPremium ? '#e9d5ff' : '#64748b'), fontSize: 13 }}>
          👔 Premium Kıyafet {isPremium ? '(Açık)' : ''}
        </button>
      </div>

      {isPremium && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>Kıyafetler</div>
          <GarmentPicker garmentTypes={garmentTypes} value={garments} onChange={setGarments} />
        </div>
      )}

      <div><label style={lbl}>Not (opsiyonel)</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Özel not..."
          style={{ ...input, padding: '10px 14px' }} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>⚡ Acil</span>
      </label>

      <div><label style={lbl}>İmza</label><SigPad sigRef={sigRef} /></div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <button onClick={handleSubmit} style={{ ...btn('#2563eb'), padding: '14px' }}>Kaydet</button>
    </div>
  )
}

// ── Ütü ──────────────────────────────────────────────────────────────────────
function IroningView({ kioskApi, onDone }) {
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
  const tickedCount = Object.values(ticked).filter(Boolean).length

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

          {garments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {garments.map((g, i) => (
                <div key={i} onClick={() => toggleTick(i)}
                  style={{
                    background: '#1e293b', borderRadius: 10, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    border: `1px solid ${ticked[i] ? '#22c55e' : '#334155'}`,
                  }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: ticked[i] ? '#15803d' : '#1e293b',
                    border: `2px solid ${ticked[i] ? '#22c55e' : '#475569'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                  }}>
                    {ticked[i] ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>
                      {g.emoji || '👔'} {g.type_name} × {g.count}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {[g.color_label, g.pattern_label && g.pattern_label !== 'Düz' ? g.pattern_label : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#64748b' }}>{tickedCount}/{garments.length} doğrulandı</div>
            </div>
          )}

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

// ── Durum Görüntüle ────────────────────────────────────────────────────────────
function StatusView({ kioskApi, onDone }) {
  const blocks = useBlocks()
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [bags, setBags] = useState([])
  const [success, setSuccess] = useState(false)

  const STATUS_LABEL = {
    pending_collection: 'Toplanmayı Bekliyor',
    dirty: 'Kirli', washing: 'Yıkanıyor', ironing: 'Ütüleniyor',
    ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
  }

  async function search() {
    if (!block) return
    const params = new URLSearchParams({ block })
    if (roomNo) params.set('room_no', roomNo)
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?${params}`)
    setBags(res.data)
  }

  async function markReady(id) {
    await kioskApi.put(`/self-service/laundry-kiosk/bags/${id}/status`, { status: 'ready' })
    setBags(bags => bags.map(b => b.id === id ? { ...b, status: 'ready' } : b))
    setSuccess(true); setTimeout(() => setSuccess(false), 2000)
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>📋 Torba Durumu</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Güncellendi</div>}
      <div><label style={lbl}>Blok</label><BlockPicker blocks={blocks} block={block} setBlock={setBlock} /></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="Oda (opsiyonel)"
          style={{ ...input, flex: 1 }} />
        <button onClick={search} style={btn('#1d4ed8')}>Ara</button>
      </div>
      {bags.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Torba bulunamadı</div>}
      {bags.map(b => (
        <div key={b.id} style={{ background: '#1e293b', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
            <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {b.item_count} torba · {STATUS_LABEL[b.status] || b.status}
              {b.urgent ? ' · ⚡' : ''}{b.intake_name ? ` · ${b.intake_name}` : ''}
            </div>
          </div>
          {b.status === 'ironing' && (
            <button onClick={() => markReady(b.id)} style={{ ...btn('#047857', '#d1fae5'), fontSize: 12, padding: '8px 14px' }}>Hazır</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Teslim Et ─────────────────────────────────────────────────────────────────
function DeliverView({ kioskApi, onDone }) {
  const [mode, setMode] = useState(null) // 'staff' | 'resident'

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>🚚 Teslim Et</h2>
      {!mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setMode('staff')}
            style={{ ...btn('#1e3a5f', '#93c5fd'), padding: 20, fontSize: 15, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>👷 Personel Teslimi</span>
            <span style={{ fontSize: 11, color: '#60a5fa' }}>AVS görevlisi hazır torbayı teslim eder</span>
          </button>
          <button onClick={() => setMode('resident')}
            style={{ ...btn('#14532d', '#86efac'), padding: 20, fontSize: 15, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>🙋 Sakin Teslimi</span>
            <span style={{ fontSize: 11, color: '#4ade80' }}>Sakin kendi torbalarını alır, imzalar</span>
          </button>
        </div>
      )}
      {mode === 'staff'    && <StaffDeliverForm kioskApi={kioskApi} onBack={() => setMode(null)} />}
      {mode === 'resident' && <ResidentDeliverForm onBack={() => setMode(null)} />}
    </div>
  )
}

function StaffDeliverForm({ kioskApi, onBack }) {
  const blocks = useBlocks()
  const [block, setBlock] = useState('')
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function searchReady() {
    const res = await kioskApi.get(`/self-service/laundry-kiosk/bags?status=ready${block ? `&block=${block}` : ''}`)
    setBags(res.data)
  }

  async function deliver() {
    if (!selectedBag) return
    setError('')
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/bags/${selectedBag.id}/status`, { status: 'delivered' })
      setSuccess(true); setSelectedBag(null); setBags(bags => bags.filter(b => b.id !== selectedBag.id))
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button onClick={onBack} style={{ ...btn('#1e293b', '#94a3b8'), fontSize: 12, alignSelf: 'flex-start', padding: '6px 12px' }}>← Geri</button>
      <h3 style={{ fontSize: 15, color: '#93c5fd', margin: 0 }}>👷 Personel Teslimi</h3>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Teslim edildi</div>}
      <div>
        <label style={lbl}>Blok (opsiyonel)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setBlock('')}
            style={{ ...btn(!block ? '#1d4ed8' : '#1e293b', !block ? '#fff' : '#64748b'), fontSize: 13, padding: '8px 16px' }}>Tümü</button>
          {blocks.map(b => (
            <button key={b} type="button" onClick={() => setBlock(b)}
              style={{ ...btn(block === b ? '#1d4ed8' : '#1e293b', block === b ? '#fff' : '#64748b'), fontSize: 13, padding: '8px 16px' }}>{b}</button>
          ))}
        </div>
      </div>
      <button onClick={searchReady} style={{ ...btn('#334155', '#e2e8f0') }}>Hazır Torbaları Getir</button>
      {bags.map(b => (
        <div key={b.id} onClick={() => setSelectedBag(b)}
          style={{ background: '#1e293b', borderRadius: 12, padding: 12, cursor: 'pointer', border: `2px solid ${selectedBag?.id === b.id ? '#3b82f6' : 'transparent'}` }}>
          {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
          <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{b.item_count} torba{b.intake_name ? ` · ${b.intake_name}` : ''}</div>
        </div>
      ))}
      {selectedBag && (
        <>
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <button onClick={deliver} style={{ ...btn('#b45309'), padding: 14 }}>Teslim Onayla</button>
        </>
      )}
    </div>
  )
}

function ResidentDeliverForm({ onBack }) {
  const sigRef = useRef(null)
  const [step, setStep] = useState('search') // 'search' | 'bags'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [residentToken, setResidentToken] = useState(null)
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function searchResident() {
    if (query.trim().length < 2) return
    try {
      const res = await api.get(`/checkin/search?q=${encodeURIComponent(query.trim())}`)
      setResults(res.data)
    } catch { setError('Arama başarısız') }
  }

  async function loginResident(person) {
    try {
      const res = await api.get('/self-service/laundry-kiosk/bags?status=ready')
      setBags(res.data)
      setResidentToken(person)
      setStep('bags')
    } catch { setError('Yüklenemedi') }
  }

  async function deliver() {
    if (!selectedBag || !residentToken) return
    setError('')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await api.post(`/self-service/laundry-kiosk/deliver-resident/${selectedBag.id}`, { signature: sig })
      setBags(prev => prev.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null)
      setSuccess(true); setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button onClick={onBack} style={{ ...btn('#1e293b', '#94a3b8'), fontSize: 12, alignSelf: 'flex-start', padding: '6px 12px' }}>← Geri</button>
      <h3 style={{ fontSize: 15, color: '#86efac', margin: 0 }}>🙋 Sakin Teslimi</h3>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Teslim edildi</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      {step === 'search' && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="İsim ile ara..." onKeyDown={e => e.key === 'Enter' && searchResident()}
              style={{ ...input, flex: 1 }} />
            <button onClick={searchResident} style={btn('#1d4ed8')}>Ara</button>
          </div>
          {results.map(p => (
            <button key={p.id} onClick={() => loginResident(p)}
              style={{ ...btn('#1e293b', '#e2e8f0'), textAlign: 'left', width: '100%', marginBottom: 4 }}>
              <div style={{ fontWeight: 500 }}>{p.full_name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{p.company || ''} {p.room_no ? `· Oda ${p.room_no}` : ''}</div>
            </button>
          ))}
        </>
      )}
      {step === 'bags' && (
        <>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Sakin: <strong style={{ color: '#e2e8f0' }}>{residentToken?.full_name}</strong>
            <button onClick={() => { setStep('search'); setResults([]); setBags([]); setResidentToken(null) }}
              style={{ marginLeft: 12, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11 }}>Değiştir</button>
          </div>
          {bags.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Hazır torba yok</div>}
          {bags.map(b => (
            <div key={b.id} onClick={() => setSelectedBag(b)}
              style={{ background: '#1e293b', borderRadius: 12, padding: 12, cursor: 'pointer', border: `2px solid ${selectedBag?.id === b.id ? '#22c55e' : 'transparent'}` }}>
              {b.bag_no && <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no}</div>}
              <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 500 }}>{b.block} — {b.room_no}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{b.item_count} torba</div>
            </div>
          ))}
          {selectedBag && (
            <>
              <div><label style={lbl}>İmza</label><SigPad sigRef={sigRef} /></div>
              <button onClick={deliver} style={{ ...btn('#15803d'), padding: 14 }}>Teslim Onayla</button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Kıyafet Gir ───────────────────────────────────────────────────────────────
function GarmentForm({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const blocks = useBlocks()
  const garmentTypes = useGarmentTypes()
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [persons, setPersons] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [garments, setGarments] = useState([])
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (block && roomNo) {
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${block}&room_no=${roomNo}`)
        .then(r => { setPersons(r.data); setSelectedPerson(null) })
        .catch(() => setPersons([]))
    }
  }, [block, roomNo])

  async function submit() {
    setError('')
    if (!block || !roomNo) return setError('Blok ve oda no gerekli')
    if (garments.length === 0) return setError('En az bir kıyafet ekleyin')
    const sig = sigRef.current?.isEmpty() ? null : sigRef.current?.toDataURL()
    try {
      await kioskApi.post('/self-service/laundry-kiosk/garment', {
        block, room_no: roomNo, personnel_id: selectedPerson?.id || null,
        clothing_items: garments, intake_signature: sig,
      })
      setSuccess(true)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Kıyafetler kaydedildi!</div>
      <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
    </div>
  )

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>👔 Kıyafet Gir</h2>
      <div><label style={lbl}>Blok</label><BlockPicker blocks={blocks} block={block} setBlock={setBlock} /></div>
      <div><label style={lbl}>Oda No</label>
        <input value={roomNo} onChange={e => setRoomNo(e.target.value)} placeholder="ör. 205" style={input} />
      </div>
      {persons.length > 0 && (
        <div>
          <label style={lbl}>Kişi</label>
          {persons.map(p => (
            <button key={p.id} type="button" onClick={() => setSelectedPerson(p)}
              style={{ ...btn(selectedPerson?.id === p.id ? '#6d28d9' : '#1e293b', selectedPerson?.id === p.id ? '#fff' : '#94a3b8'), width: '100%', textAlign: 'left', marginBottom: 4 }}>
              {p.full_name}
            </button>
          ))}
        </div>
      )}
      <div>
        <label style={lbl}>Kıyafetler</label>
        {garmentTypes.length === 0
          ? <div style={{ color: '#475569', fontSize: 12 }}>Yükleniyor...</div>
          : <GarmentPicker garmentTypes={garmentTypes} value={garments} onChange={setGarments} />
        }
      </div>
      <div><label style={lbl}>İmza</label><SigPad sigRef={sigRef} /></div>
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <button onClick={submit} disabled={garments.length === 0}
        style={{ ...btn(garments.length === 0 ? '#1e293b' : '#6d28d9', garments.length === 0 ? '#475569' : '#fff'), padding: 14 }}>
        Kaydet
      </button>
    </div>
  )
}

// ── Makineye Yükle ────────────────────────────────────────────────────────────
function MachineView({ kioskApi, onDone }) {
  const [machines, setMachines] = useState([])
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    kioskApi.get('/self-service/laundry-kiosk/machines').then(r => setMachines(r.data)).catch(() => {})
    kioskApi.get('/self-service/laundry-kiosk/bags?status=dirty').then(r => setBags(r.data)).catch(() => {})
  }, [])

  async function assign(machineId) {
    if (!selectedBag) return setError('Önce bir torba seçin')
    setError('')
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/machines/${machineId}/assign`, { item_id: selectedBag.id })
      setBags(bags => bags.filter(b => b.id !== selectedBag.id))
      setSelectedBag(null); setSuccess(true); setTimeout(() => setSuccess(false), 2000)
    } catch (e) { setError(e.response?.data?.error || 'Hata') }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>⚙️ Makineye Yükle</h2>
      {success && <div style={{ color: '#4ade80', fontSize: 13 }}>✓ Makineye atandı</div>}
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <div>
        <label style={lbl}>Torba Seç (Kirli)</label>
        {bags.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Kirli torba yok</div>}
        {bags.map(b => (
          <button key={b.id} type="button" onClick={() => setSelectedBag(b)}
            style={{ ...btn(selectedBag?.id === b.id ? '#1d4ed8' : '#1e293b', selectedBag?.id === b.id ? '#fff' : '#94a3b8'), width: '100%', textAlign: 'left', marginBottom: 4 }}>
            {b.bag_no ? `${b.bag_no} · ` : ''}{b.block} — {b.room_no} · {b.item_count} adet{b.intake_name ? ` · ${b.intake_name}` : ''}
          </button>
        ))}
      </div>
      {selectedBag && (
        <div>
          <label style={lbl}>Makine Seç</label>
          {machines.map(m => {
            let timerLabel = ''
            if (m.timer_end) {
              const remaining = Math.ceil((new Date(m.timer_end) - new Date()) / 60000)
              timerLabel = remaining > 0 ? ` · ⏱ ${remaining}dk` : ' · ✓ Bitti'
            }
            return (
              <button key={m.id} type="button" onClick={() => assign(m.id)}
                style={{ ...btn('#1e293b', '#cbd5e1'), width: '100%', textAlign: 'left', marginBottom: 4 }}
                onMouseEnter={e => e.currentTarget.style.background = '#164e63'}
                onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}>
                {m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'} · {m.active_items || 0} aktif{timerLabel}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
