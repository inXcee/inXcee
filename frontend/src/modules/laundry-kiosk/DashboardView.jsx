import { useEffect, useState } from 'react'
import { BLOCKS } from '../../shared/blocks.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'

const STATUS_GROUPS = [
  { key: 'pending_collection', label: '🧺 PENDING (toplanacak)', color: '#fbbf24' },
  { key: 'dirty',              label: '🧴 KİRLİ (yıkanmayı bekliyor)', color: '#94a3b8' },
  { key: 'washing',            label: '⚙ MAKİNEDE',              color: '#60a5fa' },
  { key: 'ironing',            label: '🫧 ÜTÜDE',                 color: '#a78bfa' },
  { key: 'ready',              label: '✓ HAZIR (teslim bekliyor)', color: '#4ade80' },
]

const card = { background: '#0f172a', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }

// Props:
//   kioskApi
//   onAction: (action, bag) => void   // action ∈ 'collect' | 'iron' | 'deliver'
// SLA config'i yoksa hazır-bekleme için makul varsayılan (eski sabit davranış)
const FALLBACK_SLA = { ready: { warning_hours: 24, critical_hours: 48 } }

export default function DashboardView({ kioskApi, onAction }) {
  const [bags, setBags] = useState([])
  const [lostBags, setLostBags] = useState([]) // kayıplar — "bulundu" geri dönüşü için
  const [summary, setSummary] = useState(null) // gün özeti — vardiya devri için
  const [slaConfig, setSlaConfig] = useState(FALLBACK_SLA) // { stage: {warning_hours, critical_hours} }
  const [loading, setLoading] = useState(false)
  const [filterBlock, setFilterBlock] = useState('all')
  const [collapsed, setCollapsed] = useState({})

  async function load() {
    setLoading(true)
    try {
      // Default endpoint (no status) returns all active (excludes delivered/lost)
      const url = filterBlock === 'all'
        ? '/self-service/laundry-kiosk/bags'
        : `/self-service/laundry-kiosk/bags?block=${encodeURIComponent(filterBlock)}`
      const [res, lost, sum, sla] = await Promise.all([
        kioskApi.get(url),
        kioskApi.get('/self-service/laundry-kiosk/bags?status=lost').catch(() => ({ data: [] })),
        kioskApi.get('/self-service/laundry-kiosk/today-summary').catch(() => null),
        kioskApi.get('/self-service/laundry-kiosk/sla-config').catch(() => null),
      ])
      setBags(res.data)
      setLostBags(filterBlock === 'all' ? lost.data : lost.data.filter(b => b.block === filterBlock))
      if (sum) setSummary(sum.data)
      if (sla && Array.isArray(sla.data) && sla.data.length > 0) {
        setSlaConfig(Object.fromEntries(sla.data.map(c => [c.stage, c])))
      }
    } catch {
      setBags([])
    } finally {
      setLoading(false)
    }
  }

  // Initial + filter change
  useEffect(() => { load() }, [filterBlock])  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [filterBlock])  // eslint-disable-line react-hooks/exhaustive-deps

  async function collect(bag) {
    const ok = await confirmDialog({
      title: 'Çanta Toplandı',
      body: `${bag.bag_no || `#${bag.id}`} toplandı olarak işaretlenecek. Onayla?`,
    })
    if (!ok) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/collect`, {})
      load()
    } catch (e) {
      useToastStore.getState().addToast(e.response?.data?.error || 'Hata', 'error')
    }
  }

  // Kayıp torba bulundu — hazıra geri döner, sakine "bulundu" mesajı gider
  async function markFound(bag) {
    const ok = await confirmDialog({
      title: 'Torba Bulundu',
      body: `${bag.bag_no || `#${bag.id}`} (${bag.block}-${bag.room_no}) hazıra geri alınacak ve sahibine haber verilecek. Onayla?`,
    })
    if (!ok) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/found`, {})
      load()
    } catch (e) {
      useToastStore.getState().addToast(e.response?.data?.error || 'Hata', 'error')
    }
  }

  // Taze yanlış girişin telafisi — backend 15 dk + dirty guard'lı
  async function voidBag(bag) {
    const ok = await confirmDialog({
      title: 'Girişi İptal Et',
      body: `${bag.bag_no || `#${bag.id}`} (${bag.block}-${bag.room_no}) tamamen silinecek. Yanlış giriş düzeltme içindir. Onayla?`,
    })
    if (!ok) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/void`, {})
      load()
    } catch (e) {
      useToastStore.getState().addToast(e.response?.data?.error || 'Hata', 'error')
    }
  }

  async function washComplete(bag) {
    const ok = await confirmDialog({
      title: 'Yıkama Bitti',
      body: `${bag.bag_no || `#${bag.id}`} yıkamadan çıkarılacak${bag.needs_ironing ? ' ve ütüye gönderilecek' : ' ve hazıra alınacak'}. Onayla?`,
    })
    if (!ok) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/wash-complete`, {})
      load()
    } catch (e) {
      useToastStore.getState().addToast(e.response?.data?.error || 'Hata', 'error')
    }
  }

  // created_at'ten bu yana geçen dakika — iptal butonu sadece taze girişte
  const ageMinutes = (b) => (Date.now() - new Date(b.created_at)) / 60000
  // bu duruma gireli geçen saat (updated_at ≈ durum giriş anı — SLA sorgularıyla aynı taban)
  const stageHours = (b) => (Date.now() - new Date(b.updated_at || b.created_at)) / 3600000

  // Hub ile aynı SLA eşikleri (laundry_sla_config): uyarıda amber, kritikte kırmızı rozet
  function slaBadge(b) {
    const cfg = slaConfig[b.status]
    if (!cfg || cfg.warning_hours == null) return null
    const h = stageHours(b)
    if (h < cfg.warning_hours) return null
    const critical = cfg.critical_hours != null && h >= cfg.critical_hours
    const label = h >= 48 ? `${Math.floor(h / 24)}g` : `${Math.floor(h)}s`
    return (
      <span style={{
        marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
        background: critical ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
        border: `1px solid ${critical ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
        color: critical ? '#f87171' : '#fbbf24',
        borderRadius: 4, padding: '1px 6px',
      }}>⏰ {label} {critical ? 'KRİTİK' : 'BEKLİYOR'}</span>
    )
  }

  function actionButton(bag) {
    switch (bag.status) {
      case 'pending_collection':
        return <button onClick={() => collect(bag)} style={miniBtn('#15803d')}>Topla →</button>
      case 'dirty':
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {ageMinutes(bag) <= 15 && (
              <button onClick={() => voidBag(bag)} style={miniBtn('#7f1d1d')} title="Yanlış girişi iptal et (15 dk)">↩</button>
            )}
            <button onClick={() => onAction('machine', bag)} style={miniBtn('#1d4ed8')}>Makineye →</button>
          </div>
        )
      case 'washing':
        return <button onClick={() => washComplete(bag)} style={miniBtn('#0e7490')}>Bitti →</button>
      case 'ironing':
        return <button onClick={() => onAction('iron', bag)} style={miniBtn('#7c3aed')}>Tamamla →</button>
      case 'ready':
        return <button onClick={() => onAction('deliver', bag)} style={miniBtn('#b45309')}>Teslim →</button>
      default:
        return null
    }
  }

  const byStatus = STATUS_GROUPS.map(g => ({
    ...g,
    items: bags.filter(b => b.status === g.key),
  }))

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>📋 Bugünün Aktif Torbaları ({bags.length})</h2>
        <button onClick={load} disabled={loading} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
          {loading ? '…' : '↻ Yenile'}
        </button>
      </div>

      {/* Gün özeti — vardiya devrinde tek bakış */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'BUGÜN GİRİŞ',  value: summary.intake_today,    color: '#38bdf8' },
            { label: 'BUGÜN TESLİM', value: summary.delivered_today, color: '#4ade80' },
            { label: 'AKTİF',        value: summary.active_total,    color: '#fbbf24' },
            { label: 'HAZIR BEKLİYOR', value: summary.ready_waiting, color: summary.ready_waiting > 0 ? '#f97316' : '#475569' },
          ].map(k => (
            <div key={k.label} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 1, marginTop: 5 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Block filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>BLOK</span>
        <select value={filterBlock} onChange={e => setFilterBlock(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
          <option value="all">Tüm Bloklar</option>
          {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
        </select>
      </div>

      {bags.length === 0 && !loading && (
        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 20 }}>
          Aktif torba yok
        </div>
      )}

      {/* Kayıplar — bulundu geri dönüşü */}
      {lostBags.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div style={{ color: '#f87171', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
            ⚠ KAYIP ({lostBags.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lostBags.map(b => (
              <div key={b.id} style={{ background: '#0f172a', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                    {b.block}-{b.room_no} · {b.item_count} parça{b.intake_name ? ` · 👤 ${b.intake_name}` : ''}
                  </div>
                </div>
                <button onClick={() => markFound(b)} style={miniBtn('#15803d')}>✓ Bulundu</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status groups */}
      {byStatus.map(group => {
        if (group.items.length === 0) return null
        const isCollapsed = collapsed[group.key]
        return (
          <div key={group.key} style={{ background: '#1e293b', borderRadius: 10, padding: '10px 12px' }}>
            <button type="button" onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
              style={{ background: 'transparent', border: 'none', color: group.color, fontSize: 12, fontWeight: 700, letterSpacing: 1, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{isCollapsed ? '▸' : '▾'}</span>
              <span>{group.label} ({group.items.length})</span>
            </button>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {group.items.map(b => (
                  <div key={b.id} style={{ background: '#0f172a', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#38bdf8', fontFamily: 'monospace' }}>{b.bag_no || `#${b.id}`}</div>
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                        {b.block}-{b.room_no} · {b.item_count} parça
                        {b.is_premium ? ' · 🟣' : ''}
                        {b.urgent ? ' · ⚡' : ''}
                        {b.status === 'ready' && b.shelf_location ? <span style={{ color: '#4ade80' }}> · 📍 {b.shelf_location}</span> : ''}
                        {slaBadge(b)}
                      </div>
                      {b.intake_name && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          👤 {b.intake_name}
                        </div>
                      )}
                      {b.notes && (
                        <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          📝 {b.notes}
                        </div>
                      )}
                    </div>
                    {actionButton(b)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const miniBtn = (bg) => ({
  padding: '6px 12px', borderRadius: 6, border: 'none', background: bg, color: '#fff',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
})
