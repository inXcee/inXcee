import { useMemo, useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCKS } from '../../../shared/blocks.js'
import { RoomCard } from './roomsCards.jsx'
import RoomDetailPanel from './roomDetailPanel.jsx'

const PIN_STORAGE_KEY = 'laundry-rooms-pins-v1'

function loadPins() {
  try { return new Set(JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || '[]')) }
  catch { return new Set() }
}
function savePins(set) {
  try { localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...set])) } catch {}
}

const SORT_OPTIONS = [
  { key: 'activity',    label: 'Aktiviteye göre' },
  { key: 'recent',      label: 'Son giriş' },
  { key: 'most_lost',   label: 'En çok kayıp' },
  { key: 'most_total',  label: 'En çok torba' },
  { key: 'room',        label: 'Oda no' },
]

const FILTER_OPTIONS = [
  { key: 'all',        label: 'Tümü' },
  { key: 'active',     label: 'Aktifi var' },
  { key: 'urgent',     label: 'Acil var' },
  { key: 'premium',    label: 'Premium' },
  { key: 'lost',       label: 'Kaybı var' },
  { key: 'never',      label: 'Hiç giriş yok' },
]

export default function RoomsSection({ onOpenNewRecordForRoom }) {
  const [block, setBlock] = useState('all')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('activity')
  const [search, setSearch] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)  // { block, room_no }
  const [pins, setPins] = useState(loadPins)
  const [showHelp, setShowHelp] = useState(false)
  const searchRef = useRef(null)

  const togglePin = (block, room_no) => {
    const key = `${block}|${room_no}`
    setPins(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      savePins(next)
      return next
    })
  }

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['laundry-rooms-overview'],
    queryFn: laundryApi.getRoomsOverview,
    refetchInterval: 30000,
  })

  const filtered = useMemo(() => {
    let arr = [...rooms]
    if (block !== 'all') arr = arr.filter(r => r.block === block)
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(r => `${r.block} ${r.room_no}`.toLowerCase().includes(q))
    }
    switch (filter) {
      case 'active':  arr = arr.filter(r => r.active_count > 0); break
      case 'urgent':  arr = arr.filter(r => r.urgent_active > 0); break
      case 'premium': arr = arr.filter(r => r.premium_count > 0); break
      case 'lost':    arr = arr.filter(r => r.lost_count > 0); break
      case 'never':   arr = arr.filter(r => r.total_count === 0); break
    }
    arr.sort((a, b) => {
      switch (sort) {
        case 'activity':   return (b.active_count || 0) - (a.active_count || 0) || (new Date(b.last_intake_at || 0) - new Date(a.last_intake_at || 0))
        case 'recent':     return new Date(b.last_intake_at || 0) - new Date(a.last_intake_at || 0)
        case 'most_lost':  return (b.lost_count || 0) - (a.lost_count || 0)
        case 'most_total': return (b.total_count || 0) - (a.total_count || 0)
        case 'room':       return a.block.localeCompare(b.block) || (+a.room_no || 0) - (+b.room_no || 0)
        default: return 0
      }
    })
    return arr
  }, [rooms, block, filter, sort, search])

  // Pinli odalar — orijinal listeden ayır
  const pinnedKey = (r) => `${r.block}|${r.room_no}`
  const pinned = useMemo(() => rooms.filter(r => pins.has(pinnedKey(r))), [rooms, pins])
  const filteredKeys = useMemo(() => new Set(filtered.map(pinnedKey)), [filtered])

  // Klavye kısayolları
  useEffect(() => {
    const handler = (e) => {
      // Form input içindeyken devre dışı
      const t = e.target
      const inForm = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === '?' && !inForm) {
        e.preventDefault(); setShowHelp(s => !s)
      } else if (e.key === '/' && !inForm) {
        e.preventDefault(); searchRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false)
        else if (selectedRoom) setSelectedRoom(null)
      } else if ((e.key === 'j' || e.key === 'k') && !inForm && !selectedRoom) {
        // Listede yukarı/aşağı odaya geç
        e.preventDefault()
        if (filtered.length === 0) return
        const idx = filtered.findIndex(r => r.block === selectedRoom?.block && r.room_no === selectedRoom?.room_no)
        const nextIdx = e.key === 'j' ? Math.min(filtered.length - 1, (idx < 0 ? -1 : idx) + 1) : Math.max(0, idx - 1)
        const r = filtered[nextIdx]
        setSelectedRoom({ block: r.block, room_no: r.room_no })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, selectedRoom, showHelp])

  // Cross-block aggregate KPIs
  const agg = useMemo(() => {
    const visible = filtered
    return {
      rooms: visible.length,
      active: visible.reduce((s, r) => s + (r.active_count || 0), 0),
      today: visible.reduce((s, r) => s + (r.today_count || 0), 0),
      last_7d: visible.reduce((s, r) => s + (r.last_7d_count || 0), 0),
      lost: visible.reduce((s, r) => s + (r.lost_count || 0), 0),
      premium: visible.reduce((s, r) => s + (r.premium_count || 0), 0),
      no_activity: visible.filter(r => r.total_count === 0).length,
    }
  }, [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Aggregate KPI Strip */}
      <div className="panel" style={{ padding: 0 }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--blue),var(--accent3))' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, padding: '14px 20px' }}>
          {[
            { label: 'GÖRÜNEN ODA',  value: agg.rooms,      color: 'var(--text)' },
            { label: 'AKTİF TORBA',  value: agg.active,     color: 'var(--accent)' },
            { label: 'BUGÜN',        value: agg.today,      color: 'var(--green)' },
            { label: 'SON 7G',       value: agg.last_7d,    color: 'var(--blue)' },
            { label: 'KAYIP',        value: agg.lost,       color: agg.lost > 0 ? 'var(--red)' : 'var(--text3)' },
            { label: 'PREMIUM',      value: agg.premium,    color: 'var(--accent3)' },
            { label: 'HİÇ GİRİŞ',    value: agg.no_activity, color: 'var(--text3)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.5, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="panel" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Oda ara… (/ ile odakla)"
          className="form-input"
          style={{ flex: '0 0 220px', height: 32, padding: '4px 10px', fontSize: 12 }}
        />

        <select value={block} onChange={e => setBlock(e.target.value)}
          className="form-input"
          style={{ flex: '0 0 130px', height: 32, padding: '4px 10px', fontSize: 12 }}>
          <option value="all">Tüm Bloklar</option>
          {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
                background: filter === f.key ? 'rgba(240,165,0,0.12)' : 'transparent',
                border: `1px solid ${filter === f.key ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                color: filter === f.key ? 'var(--accent)' : 'var(--text3)',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <select value={sort} onChange={e => setSort(e.target.value)}
          className="form-input"
          style={{ flex: '0 0 170px', height: 32, padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>↓ {o.label}</option>)}
        </select>
        <button onClick={() => setShowHelp(true)}
          title="Kısayollar (?)"
          style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text3)', cursor: 'pointer', fontSize: 13,
          }}>?</button>
      </div>

      {/* Pinli odalar şeridi */}
      {pinned.length > 0 && (
        <div className="panel" style={{ padding: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent3)', letterSpacing: 1.5, marginBottom: 8 }}>
            ★ FAVORİLER ({pinned.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {pinned.map(r => (
              <RoomCard key={`pin-${r.block}-${r.room_no}`} room={r}
                pinned
                onPin={() => togglePin(r.block, r.room_no)}
                onClick={() => setSelectedRoom({ block: r.block, room_no: r.room_no })} />
            ))}
          </div>
        </div>
      )}

      {/* Rooms grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {isLoading && <div style={{ color: 'var(--text3)', fontSize: 12 }}>Yükleniyor…</div>}
        {!isLoading && filtered.length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 12, gridColumn: '1 / -1', textAlign: 'center', padding: 30 }}>
            Filtreye uyan oda yok
          </div>
        )}
        {filtered.map(r => (
          <RoomCard key={`${r.block}-${r.room_no}`} room={r}
            pinned={pins.has(pinnedKey(r))}
            onPin={() => togglePin(r.block, r.room_no)}
            onClick={() => setSelectedRoom({ block: r.block, room_no: r.room_no })} />
        ))}
      </div>

      {/* Help overlay */}
      {showHelp && (
        <HelpOverlay onClose={() => setShowHelp(false)} />
      )}

      {/* Detail panel */}
      {selectedRoom && (
        <RoomDetailPanel
          block={selectedRoom.block}
          room_no={selectedRoom.room_no}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </div>
  )
}

// ── Help overlay (klavye kısayolları) ────────────────────────────────────────

function HelpOverlay({ onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 460, maxWidth: '92vw', zIndex: 1201,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--text)', margin: 0, letterSpacing: 2 }}>
            KLAVYE KISAYOLLARI
          </h3>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['/', 'Arama kutusuna odaklan'],
            ['J / K', 'Sonraki / önceki oda (panel açıkken)'],
            ['Esc', 'Help veya paneli kapat'],
            ['?', 'Bu yardım ekranını aç/kapa'],
            ['☆ / ★', 'Oda kartında favorilere ekle/çıkar'],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <kbd style={{
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 8px', minWidth: 60, textAlign: 'center',
              }}>{key}</kbd>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

