import { useEffect, useState } from 'react'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos } from '../../shared/blocks.js'

const STATUS_LABEL = {
  dirty: 'Kirli',
  pending_collection: 'Bekliyor',
  washing: 'Yıkanıyor',
  ironing: 'Ütüde',
  ready: 'Hazır',
  delivered: 'Teslim',
  lost: 'Kayıp',
}
const STATUS_COLOR = {
  dirty: '#94a3b8',
  pending_collection: '#fbbf24',
  washing: '#60a5fa',
  ironing: '#a78bfa',
  ready: '#4ade80',
  delivered: '#14b8a6',
  lost: '#f87171',
}

const card = { background: '#0f172a', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }

function allRoomNos(blockName) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const out = []
  for (let f = 1; f <= cfg.floors; f++) out.push(...expectedRoomNos(blockName, f))
  return out
}

// Props:
//   kioskApi
//   onPickRoom: ({ block, room_no }) => void   // "Yeni Giriş" — entry tab'a yönlendir
export default function RoomsView({ kioskApi, onPickRoom }) {
  const blockGroups = [
    { label: 'M (Merkezi)', keys: BLOCKS_BY_TYPE.M },
    { label: 'S (Sosyal)',  keys: BLOCKS_BY_TYPE.S },
    { label: 'Y (Yeni)',    keys: BLOCKS_BY_TYPE.Y },
  ]

  const [block, setBlock] = useState(blockGroups[0].keys[0])
  const [counts, setCounts] = useState({})  // room_no -> { active_count, total_count }
  const [loading, setLoading] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState(null)  // string room_no

  // Load active/total counts when block changes
  useEffect(() => {
    if (!block) return
    let cancelled = false
    setLoading(true)
    kioskApi.get(`/self-service/laundry-kiosk/block-room-counts?block=${encodeURIComponent(block)}`)
      .then(r => {
        if (cancelled) return
        const map = {}
        for (const row of r.data) map[String(row.room_no)] = row
        setCounts(map)
      })
      .catch(() => { if (!cancelled) setCounts({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [block, kioskApi])

  const rooms = block ? allRoomNos(block) : []

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#cbd5e1', margin: 0 }}>🏠 Odalar</h2>

      {/* Block selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {blockGroups.map(g => (
          <div key={g.label}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.keys.map(k => (
                <button key={k} type="button" onClick={() => { setBlock(k); setSelectedRoom(null) }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: block === k ? '#1d4ed8' : '#1e293b',
                    color: block === k ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 13,
                  }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Room grid */}
      {block && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
            {block} ODALARI {loading && <span style={{ color: '#475569' }}>· yükleniyor…</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {rooms.map(no => {
              const c = counts[String(no)] || { active_count: 0, total_count: 0 }
              const active = c.active_count > 0
              return (
                <button key={no} type="button" onClick={() => setSelectedRoom(String(no))}
                  style={{
                    padding: '12px 0', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer',
                    background: active ? '#7c2d12' : '#1e293b',
                    color: active ? '#fed7aa' : '#cbd5e1',
                    fontWeight: 700, fontSize: 13, position: 'relative',
                  }}>
                  {no}
                  {active && (
                    <span style={{
                      position: 'absolute', top: 4, right: 6,
                      fontSize: 9, fontWeight: 700, color: '#fff',
                      background: '#ea580c', borderRadius: 8, padding: '1px 5px', minWidth: 14,
                    }}>{c.active_count}</span>
                  )}
                  {!active && c.total_count > 0 && (
                    <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{c.total_count}↻</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Room detail slide-in panel */}
      {selectedRoom && (
        <RoomDetailPanel
          kioskApi={kioskApi}
          block={block}
          room_no={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onPickRoom={() => { onPickRoom?.({ block, room_no: selectedRoom }); setSelectedRoom(null) }}
        />
      )}
    </div>
  )
}

// ── Room detail panel ────────────────────────────────────────────────────────

function RoomDetailPanel({ kioskApi, block, room_no, onClose, onPickRoom }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [persons, setPersons] = useState([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      kioskApi.get(`/self-service/laundry-kiosk/room-history?block=${encodeURIComponent(block)}&room_no=${encodeURIComponent(room_no)}`),
      kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(block)}&room_no=${encodeURIComponent(room_no)}`),
    ])
      .then(([h, p]) => {
        if (cancelled) return
        setData(h.data)
        setPersons(p.data || [])
      })
      .catch(() => { if (!cancelled) setData({ summary: {}, items: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [kioskApi, block, room_no])

  const summary = data?.summary || {}
  const items = data?.items || []

  // Kişi bazlı aktif kırılım — aynı odada birden çok kişi torba verir;
  // "bu odada kimin kaç torbası içeride" tek bakışta görünsün
  const activeByPerson = (() => {
    const grouped = {}
    for (const it of items) {
      if (it.status === 'delivered' || it.status === 'lost') continue
      const name = it.intake_name || 'Kişisiz'
      if (!grouped[name]) grouped[name] = { name, count: 0, ready: 0 }
      grouped[name].count += 1
      if (it.status === 'ready') grouped[name].ready += 1
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count)
  })()

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100 }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 440, maxWidth: '94vw',
        background: '#0b1220', borderLeft: '1px solid #1e293b', zIndex: 1101,
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), transparent)',
        }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
              {block} · {room_no}
            </div>
            {persons.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                👥 {persons.map(p => p.full_name).join(', ')}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: '#1e293b', border: 'none', color: '#94a3b8',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'TOPLAM TORBA',  value: summary.total_given || 0,     color: '#38bdf8' },
              { label: 'TESLİM EDİLEN', value: summary.total_delivered || 0, color: '#4ade80' },
              { label: 'ORT. SÜRE',     value: summary.avg_hours != null ? `${summary.avg_hours}s` : '—', color: '#a78bfa' },
              { label: 'KAYIP',         value: summary.total_lost || 0,      color: (summary.total_lost || 0) > 0 ? '#f87171' : '#475569' },
            ].map(k => (
              <div key={k.label} style={{
                background: '#0f172a', border: '1px solid #1e293b', borderTop: `2px solid ${k.color}`,
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color, lineHeight: 1, marginBottom: 4 }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1.5 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Kişi bazlı aktif kırılım */}
          {activeByPerson.length > 0 && (
            <div style={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1.5, marginBottom: 6 }}>
                İÇERİDE — KİŞİ BAZLI
              </div>
              {activeByPerson.map(p => (
                <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#e2e8f0', padding: '3px 0' }}>
                  <span style={{ fontWeight: 600 }}>👤 {p.name}</span>
                  <span style={{ color: '#94a3b8' }}>
                    {p.count} torba{p.ready > 0 ? <span style={{ color: '#4ade80' }}> · {p.ready} hazır ✓</span> : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Aktif sayı + büyük yeni-giriş butonu */}
          <button onClick={onPickRoom}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#fff',
              fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 14,
              boxShadow: '0 4px 12px rgba(29,78,216,0.4)',
            }}>
            🧺 Bu odaya yeni giriş yap
            {summary.active_count > 0 && (
              <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 8, fontWeight: 600 }}>
                · şu an {summary.active_count} aktif torba
              </span>
            )}
          </button>

          {/* History list */}
          <div style={{ fontSize: 10, color: '#64748b', letterSpacing: 1.5, marginBottom: 8 }}>
            GEÇMİŞ ({items.length})
          </div>
          {loading && <div style={{ fontSize: 12, color: '#475569' }}>Yükleniyor…</div>}
          {!loading && items.length === 0 && (
            <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: 20 }}>
              Bu oda için kayıt yok
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(it => (
              <div key={it.id} style={{
                background: '#0f172a', borderRadius: 10, padding: '10px 12px',
                borderLeft: `3px solid ${STATUS_COLOR[it.status] || '#475569'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>{it.bag_no || `#${it.id}`}</span>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: '#1e293b', color: STATUS_COLOR[it.status] || '#94a3b8', fontWeight: 700, letterSpacing: 1 }}>
                    {STATUS_LABEL[it.status] || it.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                  {it.item_count} parça
                  {it.is_premium ? ' · 🟣' : ''}
                  {it.urgent ? ' · ⚡' : ''}
                  {it.file_count != null && it.file_count > 0 ? ` · ${it.file_count} file teslim` : ''}
                  {it.total_hours != null && ` · ${it.total_hours}s sürdü`}
                </div>
                {it.intake_name && (
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>👤 {it.intake_name}</div>
                )}
                {it.notes && (
                  <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    📝 {it.notes}
                  </div>
                )}
                <div style={{ fontSize: 9, color: '#475569', marginTop: 4, fontFamily: 'monospace' }}>
                  {new Date(it.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {it.delivered_at && ` → ${new Date(it.delivered_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
