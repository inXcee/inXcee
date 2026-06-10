import { useEffect, useState } from 'react'

// Makine akışı: kirli torba seç → (opsiyonel süre) → makineye yükle;
// makinedeki torbalar için "Yıkama Bitti" → backend needs_ironing'e göre
// ütüye ya da hazıra yönlendirir (ana modülün state machine'i).
const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const btn = (bg, color = '#fff') => ({ padding: '12px 20px', borderRadius: 12, border: 'none', background: bg, color, fontWeight: 600, fontSize: 14, cursor: 'pointer' })

const TIMER_OPTIONS = [
  { value: null, label: 'Süresiz' },
  { value: 30,   label: '30 dk' },
  { value: 45,   label: '45 dk' },
  { value: 60,   label: '60 dk' },
]

function remainingLabel(timerEnd) {
  if (!timerEnd) return ''
  const remaining = Math.ceil((new Date(timerEnd) - new Date()) / 60000)
  return remaining > 0 ? `⏱ ${remaining}dk` : '✓ Süre doldu'
}

export default function MachineView({ kioskApi, focusedBag, onConsumeFocus }) {
  const [machines, setMachines] = useState([])
  const [dirtyBags, setDirtyBags] = useState([])
  const [washingBags, setWashingBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [timerMinutes, setTimerMinutes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'err', text }

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

  // Durum panosundan "Makineye →" ile gelinirse torbayı otomatik seç
  useEffect(() => {
    if (focusedBag && dirtyBags.length > 0) {
      const bag = dirtyBags.find(b => b.id === focusedBag.id)
      if (bag) {
        setSelectedBag(bag)
        onConsumeFocus?.()
      }
    }
  }, [focusedBag, dirtyBags])  // eslint-disable-line react-hooks/exhaustive-deps

  async function assign(machineId) {
    if (!selectedBag) return setMsg({ type: 'err', text: 'Önce bir torba seçin' })
    setMsg(null)
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/machines/${machineId}/assign`, {
        item_id: selectedBag.id,
        timer_minutes: timerMinutes,
      })
      setSelectedBag(null)
      setTimerMinutes(null)
      setMsg({ type: 'ok', text: '✓ Makineye yüklendi' })
      load()
    } catch (e) { setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }) }
  }

  async function washComplete(bag) {
    setMsg(null)
    try {
      const res = await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/wash-complete`, {})
      const next = res.data?.next_status
      setMsg({ type: 'ok', text: next === 'ironing' ? `✓ ${bag.bag_no || `#${bag.id}`} ütüye gönderildi` : `✓ ${bag.bag_no || `#${bag.id}`} hazıra alındı` })
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

      {/* ── Kirli torbalar ── */}
      <div>
        <label style={lbl}>Torba Seç — Kirli ({dirtyBags.length})</label>
        {dirtyBags.length === 0 && !loading && <div style={{ color: '#475569', fontSize: 13 }}>Yıkanacak torba yok</div>}
        {dirtyBags.map(b => (
          <button key={b.id} type="button" onClick={() => setSelectedBag(selectedBag?.id === b.id ? null : b)}
            style={{
              ...btn(selectedBag?.id === b.id ? '#1d4ed8' : '#1e293b', selectedBag?.id === b.id ? '#fff' : '#94a3b8'),
              width: '100%', textAlign: 'left', marginBottom: 4,
            }}>
            {b.bag_no ? `${b.bag_no} · ` : ''}{b.block} — {b.room_no} · {b.item_count} parça
            {b.urgent ? ' · ⚡ ACİL' : ''}{b.is_premium ? ' · 🟣' : ''}{b.intake_name ? ` · ${b.intake_name}` : ''}
          </button>
        ))}
      </div>

      {/* ── Süre + makine seçimi ── */}
      {selectedBag && (
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
            <label style={lbl}>Makine Seç</label>
            {machines.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Makine tanımlı değil</div>}
            {machines.map(m => {
              const busy = m.status === 'running' && (m.active_items || 0) > 0
              const timer = remainingLabel(m.timer_end)
              return (
                <button key={m.id} type="button" onClick={() => assign(m.id)}
                  style={{
                    ...btn('#1e293b', busy ? '#64748b' : '#cbd5e1'),
                    width: '100%', textAlign: 'left', marginBottom: 4,
                    borderLeft: `3px solid ${busy ? '#f59e0b' : '#22c55e'}`,
                  }}>
                  {m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'}
                  {busy ? ` · ${m.active_items} aktif` : ' · Boş'}
                  {timer ? ` · ${timer}` : ''}
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
          const timer = remainingLabel(b.machine_timer_end)
          return (
            <div key={b.id} style={{
              background: '#1e293b', borderRadius: 10, padding: '10px 14px', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 10, borderLeft: '3px solid #60a5fa',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {b.block} — {b.room_no} · {b.item_count} parça{b.needs_ironing ? ' · 🫧 ütülü' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {b.machine_name ? `⚙ ${b.machine_name}` : '⚙ Makine'}{timer ? ` · ${timer}` : ''}
                </div>
              </div>
              <button onClick={() => washComplete(b)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ✓ Yıkama Bitti
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
