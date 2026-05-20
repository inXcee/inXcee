import { useEffect, useState } from 'react'
import { BLOCKS } from '../../shared/blocks.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

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
export default function DashboardView({ kioskApi, onAction }) {
  const [bags, setBags] = useState([])
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
      const res = await kioskApi.get(url)
      setBags(res.data)
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
      window.alert(e.response?.data?.error || 'Hata')
    }
  }

  function actionButton(bag) {
    switch (bag.status) {
      case 'pending_collection':
        return <button onClick={() => collect(bag)} style={miniBtn('#15803d')}>Topla →</button>
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
