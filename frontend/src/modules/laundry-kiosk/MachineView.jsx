import { useEffect, useMemo, useState } from 'react'

// Makine akışı: kirli torba(ları) seç → (opsiyonel süre) → makineye yükle;
// makinedeki torbalar için "Yıkama Bitti" → backend needs_ironing'e göre
// ütüye ya da hazıra yönlendirir (ana modülün state machine'i).
// Çoklu seçim batch-assign ucuna gider; liste 30 sn'de bir tazelenir,
// süresi dolan makinedeki torba amber vurgulanır.
const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }
const lbl = { display: 'block', fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }
const btn = (bg, color = '#fff') => ({ padding: '12px 20px', borderRadius: 12, border: 'none', background: bg, color, fontWeight: 600, fontSize: 14, cursor: 'pointer' })

const bulkBtn = {
  minHeight: 38, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
  border: '1px solid #334155', background: '#1e293b', color: '#94a3b8',
  fontSize: 12, fontWeight: 800,
}

const TIMER_OPTIONS = [
  { value: null, label: 'Program süresi' },
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
  const [dailyRuns, setDailyRuns] = useState({}) // { machineId: rows|null } — açılır gün-gün kırılım
  const [suggestions, setSuggestions] = useState([])
  const [programs, setPrograms] = useState([])
  const [program, setProgram] = useState('standard')
  const [colorGroup, setColorGroup] = useState('mixed')
  const [fabricCare, setFabricCare] = useState('standard')
  const [actualWeight, setActualWeight] = useState('')
  const [overrideReason, setOverrideReason] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [planning, dirty, washing] = await Promise.all([
        kioskApi.get('/self-service/laundry-kiosk/load-suggestions'),
        kioskApi.get('/self-service/laundry-kiosk/bags?status=dirty'),
        kioskApi.get('/self-service/laundry-kiosk/bags?status=washing'),
      ])
      setMachines(planning.data.machines || [])
      setSuggestions(planning.data.suggestions || [])
      setPrograms(planning.data.programs || [])
      const weights = new Map((planning.data.items || []).map(item => [item.id, item.estimated_weight_kg]))
      setDirtyBags((dirty.data || []).map(item => ({ ...item, estimated_weight_kg: weights.get(item.id) || 0 })))
      setWashingBags(washing.data)
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

  const estimatedWeight = useMemo(() => dirtyBags
    .filter(item => selectedIds.includes(item.id))
    .reduce((total, item) => total + Number(item.estimated_weight_kg || 0), 0), [dirtyBags, selectedIds])

  function applySuggestion(suggestion) {
    setSelectedIds(suggestion.item_ids || [])
    setTimerMinutes(suggestion.timer_minutes)
    setProgram(suggestion.program || 'standard')
    setColorGroup(suggestion.color_group || 'mixed')
    setFabricCare(suggestion.fabric_care || 'standard')
    setActualWeight(String(suggestion.estimated_weight_kg || ''))
    setOverrideReason('')
    setMsg({ type: 'ok', text: `${suggestion.machine_name} için öneri yüklendi · ${suggestion.reasons.join(' · ')}` })
  }

  async function assign(machineId) {
    if (selectedIds.length === 0) return setMsg({ type: 'err', text: 'Önce torba seçin' })
    setMsg(null)
    try {
      const res = await kioskApi.post(`/self-service/laundry-kiosk/machines/${machineId}/start-load`, {
        item_ids: selectedIds,
        timer_minutes: timerMinutes,
        program,
        color_group: colorGroup,
        fabric_care: fabricCare,
        actual_weight_kg: actualWeight === '' ? undefined : Number(actualWeight),
        override_reason: overrideReason.trim() || undefined,
      })
      const ok = res.data.success?.length || 0
      const fail = res.data.failed?.length || 0
      setSelectedIds([])
      setTimerMinutes(null)
      setActualWeight('')
      setOverrideReason('')
      setMsg({
        type: fail > 0 ? 'err' : 'ok',
        text: fail > 0 ? `✓ ${ok} yüklendi · ${fail} başarısız (${res.data.failed[0]?.error || ''})` : `✓ ${ok} torba makineye yüklendi`,
      })
      load()
    } catch (e) { setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }) }
  }

  async function toggleDaily(machineId) {
    if (dailyRuns[machineId]) {
      setDailyRuns(prev => { const n = { ...prev }; delete n[machineId]; return n })
      return
    }
    try {
      const res = await kioskApi.get(`/self-service/laundry-kiosk/machines/${machineId}/daily-runs?days=14`)
      setDailyRuns(prev => ({ ...prev, [machineId]: res.data }))
    } catch { /* sessiz — satır kapalı kalır */ }
  }

  async function maintenanceDone(m) {
    setMsg(null)
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/machines/${m.id}/maintenance-done`, {})
      setMsg({ type: 'ok', text: `✓ ${m.name} bakımı kaydedildi — sayaç sıfırlandı` })
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

      {suggestions.some(suggestion => suggestion.item_ids?.length) && (
        <div>
          <label style={lbl}>Akıllı Yük Önerileri</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 }}>
            {suggestions.filter(suggestion => suggestion.item_ids?.length).map(suggestion => (
              <button key={suggestion.machine_id} type="button" onClick={() => applySuggestion(suggestion)} style={{ ...btn('#14243b', '#dbeafe'), textAlign: 'left', border: '1px solid #29466d' }}>
                <strong style={{ display: 'block' }}>{suggestion.machine_name} · %{suggestion.fill_percent} doluluk</strong>
                <small style={{ display: 'block', marginTop: 5, color: '#8ca4c2', lineHeight: 1.45 }}>{suggestion.reasons.join(' · ')}</small>
                <span style={{ display: 'block', marginTop: 7, color: '#60a5fa', fontSize: 11 }}>{suggestion.items.length} torba · {suggestion.estimated_weight_kg} kg · {suggestion.program}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Kirli torbalar — çoklu seçim ── */}
      <div>
        <label style={lbl}>
          Torba Seç — Kirli ({dirtyBags.length})
          {selectedIds.length > 0 && <span style={{ color: '#60a5fa' }}> · {selectedIds.length} seçili</span>}
        </label>
        {/* Toplu seçim — 15 torbalık sabah yığınında tek tek dokunmak zaman kaybı */}
        {dirtyBags.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button type="button" onClick={() => setSelectedIds(dirtyBags.map(b => b.id))}
              style={bulkBtn}>
              ☑ Hepsini seç ({dirtyBags.length})
            </button>
            {dirtyBags.some(b => b.urgent) && (
              <button type="button"
                onClick={() => setSelectedIds(dirtyBags.filter(b => b.urgent).map(b => b.id))}
                style={bulkBtn}>
                ⚡ Sadece acil ({dirtyBags.filter(b => b.urgent).length})
              </button>
            )}
            {/* Aynı bloğu birlikte yıkamak teslimde de kolaylık sağlar */}
            {[...new Set(dirtyBags.map(b => b.block))].filter(Boolean).length > 1 &&
              [...new Set(dirtyBags.map(b => b.block))].filter(Boolean).map(blk => (
                <button key={blk} type="button"
                  onClick={() => setSelectedIds(dirtyBags.filter(b => b.block === blk).map(b => b.id))}
                  style={bulkBtn}>
                  {blk} ({dirtyBags.filter(b => b.block === blk).length})
                </button>
              ))}
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => setSelectedIds([])} style={bulkBtn}>
                ✕ Temizle
              </button>
            )}
          </div>
        )}
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
                {b.estimated_weight_kg ? ` · ~${b.estimated_weight_kg} kg` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Süre + makine seçimi ── */}
      {selectedIds.length > 0 && (
        <>
          <div>
            <label style={lbl}>Program ve Yıkama Süresi</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {(programs.length ? programs : [{ value: 'standard', label: 'Standart 40°' }, { value: 'delicate', label: 'Hassas 30°' }, { value: 'intensive', label: 'Yoğun 60°' }, { value: 'quick', label: 'Hızlı 30°' }]).map(option => (
                <button key={option.value} type="button" onClick={() => { setProgram(option.value); if (option.minutes) setTimerMinutes(option.minutes) }} style={{ ...bulkBtn, background: program === option.value ? '#1d4ed8' : '#1e293b', color: program === option.value ? '#fff' : '#94a3b8' }}>{option.label}</button>
              ))}
            </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            <label><span style={lbl}>Tahmini / Gerçek Ağırlık</span><input aria-label="Gerçek ağırlık" type="number" min="0" step="0.1" value={actualWeight} onChange={event => setActualWeight(event.target.value)} placeholder={`Tahmin ${estimatedWeight.toFixed(1)} kg`} style={{ width: '100%', boxSizing: 'border-box', background: '#07111f', border: '1px solid #334155', borderRadius: 9, color: '#fff', padding: 10 }} /></label>
            <label><span style={lbl}>Renk Grubu</span><select value={colorGroup} onChange={event => setColorGroup(event.target.value)} style={{ width: '100%', background: '#07111f', border: '1px solid #334155', borderRadius: 9, color: '#fff', padding: 10 }}><option value="mixed">Karışık</option><option value="white">Beyaz</option><option value="dark">Koyu</option></select></label>
            <label><span style={lbl}>Bakım</span><select value={fabricCare} onChange={event => setFabricCare(event.target.value)} style={{ width: '100%', background: '#07111f', border: '1px solid #334155', borderRadius: 9, color: '#fff', padding: 10 }}><option value="standard">Standart</option><option value="delicate">Hassas</option></select></label>
          </div>
          <label><span style={lbl}>Yetkili İstisna Gerekçesi</span><input value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Kapasite veya uyumluluk önerisi aşılacaksa zorunlu" style={{ width: '100%', boxSizing: 'border-box', background: '#07111f', border: '1px solid #334155', borderRadius: 9, color: '#fff', padding: 10 }} /></label>
          <div>
            <label style={lbl}>Makine Seç — {selectedIds.length} torba yüklenecek</label>
            {machines.length === 0 && <div style={{ color: '#475569', fontSize: 13 }}>Makine tanımlı değil</div>}
            {machines.map(m => {
              const busy = m.status === 'running' && (m.active_items || 0) > 0
              const ts = timerState(m.timer_end)
              return (
                <button key={m.id} type="button" onClick={() => assign(m.id)} disabled={m.status === 'running' || m.status === 'maintenance'}
                  style={{
                    ...btn('#1e293b', busy ? '#64748b' : '#cbd5e1'),
                    width: '100%', textAlign: 'left', marginBottom: 4,
                    borderLeft: `3px solid ${busy ? '#f59e0b' : '#22c55e'}`,
                  }}>
                  {m.name} · {m.type === 'washer' ? '🫧 Çamaşır' : '💨 Kurutucu'}
                  {busy ? ` · ${m.active_items || 0} aktif` : ' · Boş'} · {m.capacity_kg || 10} kg
                  {ts.label ? ` · ${ts.label}` : ''}
                  {m.needs_maintenance ? <span style={{ color: '#fbbf24', fontWeight: 700 }}> · 🔧 BAKIM ZAMANI</span> : ''}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Makineler — gün/hafta/ay çalışma sayıları ── */}
      {machines.length > 0 && (
        <div>
          <label style={lbl}>Makineler — Çalışma Sayıları</label>
          {machines.map(m => (
            <div key={m.id} style={{ background: '#1e293b', borderRadius: 10, padding: '8px 12px', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: m.status === 'running' ? '#60a5fa' : m.status === 'maintenance' ? '#f87171' : m.status === 'done' ? '#4ade80' : '#475569',
                }} />
                <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {m.name}
                  {m.needs_maintenance ? <span style={{ color: '#fbbf24', fontSize: 10 }}> · 🔧</span> : ''}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }} title="bugün · son 7 gün · son 30 gün">
                  Bugün <b style={{ color: m.runs_today > 0 ? '#60a5fa' : '#64748b' }}>{m.runs_today ?? 0}</b>
                  {' · '}7g <b style={{ color: '#cbd5e1' }}>{m.runs_7d ?? 0}</b>
                  {' · '}30g <b style={{ color: '#cbd5e1' }}>{m.runs_30d ?? 0}</b>
                </span>
                <button onClick={() => toggleDaily(m.id)}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>
                  {dailyRuns[m.id] ? '▾ kapat' : '▸ günlük'}
                </button>
              </div>
              {dailyRuns[m.id] && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155' }}>
                  {dailyRuns[m.id].length === 0 && (
                    <div style={{ fontSize: 11, color: '#475569' }}>Son 14 günde çalışma yok</div>
                  )}
                  {dailyRuns[m.id].map(d => (
                    <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', width: 76, flexShrink: 0 }}>
                        {new Date(d.day).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}
                      </span>
                      <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, d.runs * 10)}%`, height: '100%', background: '#1d4ed8' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700, width: 24, textAlign: 'right' }}>{d.runs}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Makine sağlığı — bakım zamanı gelenler ── */}
      {machines.some(m => m.needs_maintenance || m.status === 'maintenance') && (
        <div>
          <label style={lbl}>🔧 Bakım Gereken Makineler</label>
          {machines.filter(m => m.needs_maintenance || m.status === 'maintenance').map(m => (
            <div key={m.id} style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 2 }}>
                  {m.status === 'maintenance' ? 'Bakımda' : `Son bakımdan beri ${m.runs_since_maintenance} yıkama`}
                  {m.last_maintenance_at ? ` · son bakım ${new Date(m.last_maintenance_at).toLocaleDateString('tr-TR')}` : ' · hiç bakım kaydı yok'}
                </div>
              </div>
              <button onClick={() => maintenanceDone(m)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#b45309', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                🔧 Bakım Yapıldı
              </button>
            </div>
          ))}
        </div>
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
