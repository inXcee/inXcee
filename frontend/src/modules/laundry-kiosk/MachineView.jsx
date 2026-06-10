import { useEffect, useState } from 'react'

// Makine akışı: kirli torba(ları) seç → (opsiyonel süre) → makineye yükle;
// makinedeki torbalar için "Yıkama Bitti" → backend needs_ironing'e göre
// ütüye ya da hazıra yönlendirir (ana modülün state machine'i).
// Çoklu seçim batch-assign ucuna gider; liste 30 sn'de bir tazelenir,
// süresi dolan makinedeki torba amber vurgulanır.
const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const btn = (bg, color = '#fff') => ({ padding: '12px 20px', borderRadius: 12, border: 'none', background: bg, color, fontWeight: 600, fontSize: 14, cursor: 'pointer' })

const TIMER_OPTIONS = [
  { value: null, label: 'Süresiz' },
  { value: 30,   label: '30 dk' },
  { value: 45,   label: '45 dk' },
  { value: 60,   label: '60 dk' },
]

function timerState(timerEnd) {
  if (!timerEnd) return { label: '', expired: false }
  const remaining = Math.ceil((new Date(timerEnd) - new Date()) / 60000)
  return remaining > 0
    ? { label: `⏱ ${remaining}dk`, expired: false }
    : { label: '✓ SÜRE DOLDU', expired: true }
}

export default function MachineView({ kioskApi, focusedBag, onConsumeFocus }) {
  const [machines, setMachines] = useState([])
  const [dirtyBags, setDirtyBags] = useState([])
  const [washingBags, setWashingBags] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [timerMinutes, setTimerMinutes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }
  const [shelfMap, setShelfMap] = useState({}) // { bagId: rafMetni } — ütüsüz torbalar hazıra giderken

  async function load() {
    setLoading(true)
    try {
      const [m, dirty, washing] = await Promise.all([
        kioskApi.get('/self-service/laundry-kiosk/machines'),
        kioskApi.get('/self-service/laundry-kiosk/bags?status=dirty'),
        kioskApi.get('/self-service/laundry-kiosk/bags?status=washing'),
      ])
      setMachines(m.data); setDirtyBags(dirty.data); setWashingBags(washing.data)
    } catch { setMsg({ type: 'err', text: 'Yüklenemedi' }) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // 30 sn'de bir tazele — kalan süreler ve listeler canlı kalsın (Durum panosu deseni)
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Durum panosundan "Makineye →" ile gelinirse torbayı otomatik seç
  useEffect(() => {
    if (focusedBag && dirtyBags.length > 0) {
      const bag = dirtyBags.find(b => b.id === focusedBag.id)
      if (bag) {
        setSelectedIds([bag.id])
        onConsumeFocus?.()
      }
    }
  }, [focusedBag, dirtyBags])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggleBag(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function assign(machineId) {
    if (selectedIds.length === 0) return setMsg({ type: 'err', text: 'Önce torba seçin' })
    setMsg(null)
    try {
      const res = await kioskApi.post(`/self-service/laundry-kiosk/machines/${machineId}/batch-assign`, {
        item_ids: selectedIds,
        timer_minutes: timerMinutes,
      })
      const ok = res.data.success?.length || 0
      const fail = res.data.failed?.length || 0
      setSelectedIds([])
      setTimerMinutes(null)
      setMsg({
        type: fail > 0 ? 'err' : 'ok',
        text: fail > 0 ? `✓ ${ok} yüklendi · ${fail} başarısız (${res.data.failed[0]?.error || ''})` : `✓ ${ok} torba makineye yüklendi`,
      })
      load()
    } catch (e) { setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }) }
  }

  async function washComplete(bag) {
    setMsg(null)
    try {
      const shelf = (shelfMap[bag.id] || '').trim()
      const res = await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/wash-complete`, {
        shelf_location: shelf || undefined,
      })
      const next = res.data?.next_status
      setMsg({ type: 'ok', text: next === 'ironing' ? `✓ ${bag.bag_no || `#${bag.id}`} ütüye gönderildi` : `✓ ${bag.bag_no || `#${bag.id}`} hazıra alındı${shelf ? ` (📍 ${shelf})` : ''}` })
      setShelfMap(prev => { const n = { ...prev }; delete n[bag.id]; return n })
      load()
    } catch (e) { setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }) }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cbd5e1', margin: 0 }}>⚙️ Makine</h2>
        <button onClick={load} disabled={loading}
          style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
          {loading ? '…' : '↻ Yenile'}
        </button>
      </div>

      {msg && <div style={{ color: msg.type === 'ok' ? '#4ade80' : '#f87171', fontSize: 13 }}>{msg.text}</div>}

      {/* ── Kirli torbalar — çoklu seçim ── */}
      <div>
        <label style={lbl}>
          Torba Seç — Kirli ({dirtyBags.length})
          {selectedIds.length > 0 && <span style={{ color: '#60a5fa' }}> · {selectedIds.length} seçili</span>}
        </label>
        {dirtyBags.length === 0 && !loading && <div style={{ color: '#475569', fontSize: 13 }}>Yıkanacak torba yok</div>}
        {dirtyBags.map(b => {
          const sel = selectedIds.includes(b.id)
          return (
            <button key={b.id} type="button" onClick={() => toggleBag(b.id)}
              style={{
                ...btn(sel ? '#1d4ed8' : '#1e293b', sel ? '#fff' : '#94a3b8'),
                width: '100%', textAlign: 'left', marginBottom: 4,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${sel ? '#fff' : '#475569'}`,
                background: sel ? '#fff' : 'transparent',
                color: '#1d4ed8', fontSize: 13, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>{sel ? '✓' : ''}</span>
              <span>
                {b.bag_no ? `${b.bag_no} · ` : ''}{b.block} — {b.room_no} · {b.item_count} parça
                {b.urgent ? ' · ⚡ ACİL' : ''}{b.is_premium ? ' · 🟣' : ''}{b.intake_name ? ` · ${b.intake_name}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Süre + makine seçimi ── */}
      {selectedIds.length > 0 && (
        <>
          <div>
            <label style={lbl}>Yıkama Süresi</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TIMER_OPTIONS.map(o => (
                <button key={o.label} type="button" onClick={() => setTimerMinutes(o.value)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: timerMinutes === o.value ? '#1d4ed8' : '#1e293b',
                    color: timerMinutes === o.value ? '#fff' : '#94a3b8',
                    fontWeight: 600, fontSize: 13,
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Makine Seç — {selectedIds.length} torba yüklenecek</label>
            {machines.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Makine tanımlı değil</div>}
            {machines.map(m => {
              const busy = m.status === 'running' && (m.active_items || 0) > 0
              const ts = timerState(m.timer_end)
              return (
                <button key={m.id} type="button" onClick={() => assign(m.id)}
                  style={{
                    ...btn('#1e293b', busy ? '#64748b' : '#cbd5e1'),
                    width: '100%', textAlign: 'left', marginBottom: 4,
                    borderLeft: `3px solid ${busy ? '#f59e0b' : '#22c55e'}`,
                  }}>
                  {m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'}
                  {busy ? ` · ${m.active_items} aktif` : ' · Boş'}
                  {ts.label ? ` · ${ts.label}` : ''}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Makinedekiler ── */}
      <div>
        <label style={lbl}>Makinede ({washingBags.length})</label>
        {washingBags.length === 0 && !loading && <div style={{ color: '#475569', fontSize: 13 }}>Makinede torba yok</div>}
        {washingBags.map(b => {
          const ts = timerState(b.machine_timer_end)
          return (
            <div key={b.id} style={{
              background: ts.expired ? 'rgba(245,158,11,0.08)' : '#1e293b',
              borderRadius: 10, padding: '10px 14px', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 10,
              borderLeft: `3px solid ${ts.expired ? '#f59e0b' : '#60a5fa'}`,
              border: ts.expired ? '1px solid rgba(245,158,11,0.4)' : undefined,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: ts.expired ? '#fbbf24' : '#60a5fa', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {b.block} — {b.room_no} · {b.item_count} parça{b.needs_ironing ? ' · 🫧 ütülü' : ''}
                </div>
                <div style={{ fontSize: 11, color: ts.expired ? '#fbbf24' : '#94a3b8', marginTop: 2, fontWeight: ts.expired ? 700 : 400 }}>
                  {b.machine_name ? `⚙ ${b.machine_name}` : '⚙ Makine'}{ts.label ? ` · ${ts.label}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                {!b.needs_ironing && (
                  <input
                    value={shelfMap[b.id] || ''}
                    onChange={e => setShelfMap(prev => ({ ...prev, [b.id]: e.target.value }))}
                    placeholder="Raf (ops.)"
                    style={{
                      width: 100, boxSizing: 'border-box', background: '#0f172a',
                      border: '1px solid #334155', borderRadius: 6, padding: '5px 8px',
                      color: '#f1f5f9', fontSize: 11, outline: 'none',
                    }}
                  />
                )}
                <button onClick={() => washComplete(b)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: ts.expired ? '#b45309' : '#15803d', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  ✓ Yıkama Bitti
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
