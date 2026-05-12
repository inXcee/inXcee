import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCKS, BLOCK_BY_NAME } from '../../../shared/blocks.js'
import PersonPanel from './PersonPanel.jsx'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import ColorPatternPicker, { ColorPatternDisplay, parseColors } from './ColorPatternPicker.jsx'

// Imza gereken bloklar — kiosk constants ile birebir
const SIGN_BLOCKS = new Set(['M1', 'M2', 'M3', 'S1', 'S2', 'S3', 'G', 'C'])
const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']

const STATUS_LABEL = {
  dirty: 'Sepette', pending_collection: 'Bekliyor', washing: 'Yıkanıyor',
  ironing: 'Ütüde', ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
}
const STATUS_COLOR = {
  dirty: 'var(--accent)', pending_collection: 'var(--accent3)', washing: 'var(--blue)',
  ironing: '#a78bfa', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

const PIN_STORAGE_KEY = 'laundry-rooms-pins-v1'

function loadPins() {
  try { return new Set(JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || '[]')) }
  catch { return new Set() }
}
function savePins(set) {
  try { localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...set])) } catch {}
}

const DOW_LABELS = ['Pzr', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

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

function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffH = (Date.now() - d.getTime()) / 36e5
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}dk önce`
  if (diffH < 24) return `${Math.round(diffH)}sa önce`
  const diffD = diffH / 24
  if (diffD < 30) return `${Math.round(diffD)}g önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })
}

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

// ── Room card ────────────────────────────────────────────────────────────────

function RoomCard({ room, onClick, pinned, onPin }) {
  const active = (room.active_count || 0) > 0
  const urgent = (room.urgent_active || 0) > 0
  const never = (room.total_count || 0) === 0

  let borderColor = 'var(--border)'
  if (urgent) borderColor = 'var(--red)'
  else if (active) borderColor = 'var(--accent)'
  else if (never) borderColor = 'transparent'

  return (
    <div className="panel" style={{
      padding: '12px 12px 10px', textAlign: 'left', cursor: 'pointer',
      borderLeft: `3px solid ${borderColor}`, position: 'relative',
      transition: 'all 0.15s', background: never ? 'transparent' : 'var(--surface)',
      opacity: never ? 0.55 : 1,
    }}
    onClick={onClick}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = '' }}>
      <button type="button"
        onClick={e => { e.stopPropagation(); onPin?.() }}
        title={pinned ? 'Favoriden çıkar' : 'Favorilere ekle'}
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
          background: pinned ? 'rgba(240,165,0,0.18)' : 'transparent',
          color: pinned ? 'var(--accent)' : 'var(--text3)',
          fontSize: 12, padding: 0, zIndex: 2,
        }}>
        {pinned ? '★' : '☆'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, paddingRight: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--text)', lineHeight: 1 }}>
            {room.block}<span style={{ color: 'var(--text3)', fontSize: 14, margin: '0 4px' }}>·</span>{room.room_no}
          </div>
        </div>
        {active && (
          <span style={{
            background: urgent ? 'var(--red)' : 'var(--accent)', color: '#000',
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 10,
            padding: '2px 6px', borderRadius: 4, marginRight: 28,
          }}>
            {urgent && '⚡ '}{room.active_count}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Sparkline points={[
          room.today_count || 0,
          Math.max(0, (room.last_7d_count || 0) - (room.today_count || 0)),
          Math.max(0, (room.last_30d_count || 0) - (room.last_7d_count || 0)),
          Math.max(0, (room.total_count || 0) - (room.last_30d_count || 0)),
        ].reverse()} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          {room.total_count || 0} toplam
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        <Stat label="7G" value={room.last_7d_count || 0} color="var(--blue)" />
        <Stat label="TES" value={room.delivered_count || 0} color="var(--green)" />
        <Stat label="KYP" value={room.lost_count || 0} color={(room.lost_count || 0) > 0 ? 'var(--red)' : 'var(--text3)'} />
      </div>

      <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 0.5 }}>
        {room.last_intake_at ? `son: ${formatRelative(room.last_intake_at)}` : 'henüz giriş yok'}
        {room.avg_hours != null && ` · ort ${room.avg_hours}s`}
      </div>
    </div>
  )
}

// Faz 3 — Y blok premium parça kartı
const GARMENT_STATUS_LABEL = {
  received: 'Alındı', washing: 'Yıkanıyor', ironing: 'Ütüde',
  ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
}
const GARMENT_STATUS_COLOR = {
  received: 'var(--accent3)', washing: 'var(--blue)', ironing: '#a78bfa',
  ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

function PremiumGarmentsCard({ items }) {
  const totalGarments = items.reduce((s, b) => s + b.garments.length, 0)
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent3)',
        letterSpacing: 1.5, marginBottom: 8,
      }}>
        🟣 PREMIUM PARÇALAR · {items.length} torba · {totalGarments} parça
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(bag => (
          <div key={bag.item_id} style={{
            background: 'var(--surface2)', borderRadius: 6,
            border: '1px solid var(--border)', padding: '8px 10px',
            borderLeft: `3px solid ${STATUS_COLOR[bag.status] || 'var(--accent3)'}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 6,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', fontWeight: 700 }}>
                {bag.bag_no || `#${bag.item_id}`}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px', borderRadius: 3,
                background: 'var(--surface)', color: STATUS_COLOR[bag.status] || 'var(--text3)',
                fontWeight: 700, letterSpacing: 1,
              }}>
                {STATUS_LABEL[bag.status] || bag.status} · {bag.garments.length} parça
              </span>
            </div>
            {bag.intake_name && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 6 }}>
                👤 {bag.intake_name}
              </div>
            )}
            {bag.garments.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>
                Henüz parça eklenmedi
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bag.garments.map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', background: 'var(--surface)', borderRadius: 4,
                  fontFamily: 'var(--mono)', fontSize: 10,
                }}>
                  <span style={{ color: 'var(--accent3)', fontWeight: 700, minWidth: 80 }}>
                    {g.garment_code}
                  </span>
                  <span style={{ color: 'var(--text)' }}>{g.garment_type}</span>
                  {g.brand && <span style={{ color: 'var(--text3)' }}>· {g.brand}{g.model ? ` ${g.model}` : ''}</span>}
                  {g.size && <span style={{ color: 'var(--text3)' }}>· {g.size}</span>}
                  {g.color && <span style={{ color: 'var(--text3)' }}>· {g.color}</span>}
                  {g.pattern && <span style={{ color: 'var(--text3)' }}>· {g.pattern}</span>}
                  <span style={{
                    marginLeft: 'auto', fontSize: 8, padding: '1px 5px', borderRadius: 3,
                    background: 'var(--surface2)',
                    color: GARMENT_STATUS_COLOR[g.status] || 'var(--text3)',
                    fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    {GARMENT_STATUS_LABEL[g.status] || g.status}
                  </span>
                  {g.condition_notes && (
                    <span title={g.condition_notes} style={{
                      fontSize: 10, color: 'var(--red)', cursor: 'help',
                    }}>⚠</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TlChipGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(([k, label]) => {
        const active = value === k
        return (
          <button key={k} onClick={() => onChange(k)} type="button"
            style={{
              padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.5, lineHeight: 1.4,
              background: active ? 'rgba(240,165,0,0.18)' : 'transparent',
              border: `1px solid ${active ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: active ? 'var(--accent)' : 'var(--text3)',
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '3px 0', background: 'var(--surface2)', borderRadius: 4 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)', letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function Sparkline({ points = [] }) {
  const max = Math.max(1, ...points)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20, flex: 1 }}>
      {points.map((p, i) => (
        <div key={i} style={{
          flex: 1, height: `${(p / max) * 100}%`, minHeight: 1,
          background: p > 0 ? 'var(--accent3)' : 'var(--border)',
          opacity: 0.4 + 0.6 * (i / Math.max(1, points.length - 1)),
          borderRadius: 1,
        }} title={`${p}`} />
      ))}
    </div>
  )
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function RoomDetailPanel({ block, room_no, onClose }) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['laundry-room-detail', block, room_no],
    queryFn: () => laundryApi.getRoomLaundryDetail(block, room_no),
  })
  const [personPanelName, setPersonPanelName] = useState(null)
  const [mode, setMode] = useState('detail')  // 'detail' | 'new'
  const [savedBanner, setSavedBanner] = useState(false)

  const summary = data?.summary || {}
  const items = data?.items || []
  const premiumItems = data?.premium_items || []
  const isYBlock = BLOCK_BY_NAME[block]?.type === 'Y'
  const trend = data?.trend || []
  const byPerson = data?.by_person || []
  const heatmap = data?.heatmap || []
  const hourDay = data?.hour_day || []
  const blockAvg = data?.block_avg || null
  const damages = data?.damages || []
  const slaViolations = data?.sla_violations || []
  const lastBag = data?.last_bag || null

  // Faz 3 — batch + actions
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [actionItem, setActionItem] = useState(null)        // expanded action panel
  const [batchAction, setBatchAction] = useState(null)      // 'deliver' | 'lost'
  const [batchInput, setBatchInput] = useState('')

  // Timeline filtreleri
  const [tlStatus, setTlStatus] = useState('all')   // all | active | delivered | lost
  const [tlType, setTlType]     = useState('all')   // all | urgent | ironing | premium
  const [tlRange, setTlRange]   = useState('all')   // 7 | 30 | 90 | all
  const [tlSearch, setTlSearch] = useState('')

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const advance = useMutation({
    mutationFn: ({ id }) => laundryApi.advanceItem(id, {}),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null) },
  })
  const markLost = useMutation({
    mutationFn: ({ id, notes }) => laundryApi.lostItem(id, { notes }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null) },
  })
  const deliver = useMutation({
    mutationFn: ({ id, delivered_to }) => laundryApi.deliverItem(id, { delivered_to }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null) },
  })
  const batchDeliverMut = useMutation({
    mutationFn: (delivered_to) => laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setSelectedIds(new Set()); setBatchAction(null); setBatchInput('') },
  })
  const batchLostMut = useMutation({
    mutationFn: (notes) => laundryApi.batchLost([...selectedIds], notes),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setSelectedIds(new Set()); setBatchAction(null); setBatchInput('') },
  })
  const occupants = data?.occupants || []

  // Status breakdown
  const byStatus = useMemo(() => {
    const map = {}
    for (const it of items) map[it.status] = (map[it.status] || 0) + 1
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [items])

  // Timeline filtreli liste
  const filteredItems = useMemo(() => {
    let arr = items
    if (tlStatus === 'active')         arr = arr.filter(it => it.status !== 'delivered' && it.status !== 'lost')
    else if (tlStatus === 'delivered') arr = arr.filter(it => it.status === 'delivered')
    else if (tlStatus === 'lost')      arr = arr.filter(it => it.status === 'lost')

    if (tlType === 'urgent')       arr = arr.filter(it => it.urgent)
    else if (tlType === 'ironing') arr = arr.filter(it => it.needs_ironing)
    else if (tlType === 'premium') arr = arr.filter(it => it.is_premium)

    if (tlRange !== 'all') {
      const cutoff = Date.now() - (+tlRange) * 86400000
      arr = arr.filter(it => new Date(it.created_at).getTime() >= cutoff)
    }

    const q = tlSearch.trim().toLowerCase()
    if (q) {
      arr = arr.filter(it =>
        (it.bag_no || '').toLowerCase().includes(q) ||
        (it.intake_name || '').toLowerCase().includes(q) ||
        (it.delivered_name || '').toLowerCase().includes(q) ||
        (it.delivered_to || '').toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q) ||
        (it.garments_json || '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [items, tlStatus, tlType, tlRange, tlSearch])

  const tlFilterActive = tlStatus !== 'all' || tlType !== 'all' || tlRange !== 'all' || tlSearch.trim() !== ''

  // 14g sparkline
  // Faz 2 — CSV export (filtre uygulanmışsa filtreliyi, değilse tümünü)
  const exportCsv = useCallback(() => {
    const rows = tlFilterActive ? filteredItems : items
    if (!rows.length) return
    const headers = [
      'bag_no','status','intake_name','intake_at','item_count',
      'urgent','premium','needs_ironing','file_count',
      'delivered_to','delivered_at','total_hours','notes','garments',
    ]
    const escape = (v) => {
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return /[",\n;]/.test(s) ? `"${s}"` : s
    }
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push([
        r.bag_no || `#${r.id}`,
        STATUS_LABEL[r.status] || r.status,
        r.intake_name,
        r.created_at,
        r.item_count,
        r.urgent ? '1' : '',
        r.is_premium ? '1' : '',
        r.needs_ironing ? '1' : '',
        r.file_count ?? '',
        r.delivered_to || r.delivered_name || '',
        r.delivered_at || '',
        r.total_hours ?? '',
        r.notes || '',
        r.garments_json || '',
      ].map(escape).join(','))
    }
    // Excel uyumu için UTF-8 BOM
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `oda-${block}-${room_no}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [items, filteredItems, tlFilterActive, block, room_no])

  const handlePrint = useCallback(() => { window.print() }, [])

  const sparkPoints = useMemo(() => {
    const map = {}
    for (const t of trend) map[t.day] = t.count
    const out = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const k = d.toISOString().slice(0, 10)
      out.push(map[k] || 0)
    }
    return out
  }, [trend])

  return (
    <>
      <div onClick={onClose} className="room-detail-overlay"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100 }} />
      <div className="room-detail-panel" style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 560, maxWidth: '96vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1101,
        display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 36px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.06), transparent)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 4, color: 'var(--text)', lineHeight: 1 }}>
              {block} · {room_no}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 6 }}>
              {BLOCK_BY_NAME[block]?.type === 'M' ? 'MERKEZİ · ORTAK BANYO' :
                BLOCK_BY_NAME[block]?.type === 'S' ? 'SOSYAL · ÖZEL BANYO' :
                'YENİ · PREMIUM'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} className="rooms-detail-actions">
            <button onClick={exportCsv} disabled={items.length === 0}
              title="CSV indir"
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: items.length ? 'var(--text2)' : 'var(--text3)',
                cursor: items.length ? 'pointer' : 'not-allowed',
                width: 30, height: 30, borderRadius: 6, fontSize: 14,
              }}>📥</button>
            <button onClick={handlePrint}
              title="Yazdır"
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text2)', cursor: 'pointer',
                width: 30, height: 30, borderRadius: 6, fontSize: 14,
              }}>🖨</button>
            <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Success banner */}
          {savedBanner && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', fontWeight: 700,
            }}>
              ✓ Kayıt eklendi
            </div>
          )}

          {/* Quick actions */}
          <div className="rooms-detail-no-print" style={{ display: 'flex', gap: 8 }}>
            {mode === 'detail' && (
              <button className="btn btn-primary" onClick={() => setMode('new')} style={{ flex: 1, letterSpacing: 1 }}>
                + YENİ KAYIT
              </button>
            )}
            {mode === 'new' && (
              <button className="btn btn-ghost" onClick={() => setMode('detail')} style={{ flex: 1, letterSpacing: 1 }}>
                ← GERİ
              </button>
            )}
          </div>

          {/* Inline new record */}
          {mode === 'new' && data?.room_id && (
            <InlineNewRecord
              roomId={data.room_id}
              block={block}
              room_no={room_no}
              occupants={data.occupants || []}
              lastBag={lastBag}
              onSaved={() => {
                setMode('detail')
                setSavedBanner(true)
                setTimeout(() => setSavedBanner(false), 2500)
                refetch()
                qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] })
                qc.invalidateQueries({ queryKey: ['laundry-items'] })
              }}
            />
          )}

          {mode === 'detail' && (<>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'TOPLAM',    value: summary.total_given || 0,     color: 'var(--blue)' },
              { label: 'AKTİF',     value: summary.active_count || 0,    color: 'var(--accent)' },
              { label: 'TESLİM',    value: summary.total_delivered || 0, color: 'var(--green)' },
              { label: 'KAYIP',     value: summary.total_lost || 0,      color: (summary.total_lost || 0) > 0 ? 'var(--red)' : 'var(--text3)' },
              { label: 'ORT. SÜRE', value: summary.avg_hours != null ? `${summary.avg_hours}s` : '—', color: '#a78bfa', span: 2 },
              { label: 'SON GİRİŞ', value: summary.last_intake_at ? formatRelative(summary.last_intake_at) : '—', color: 'var(--teal)', span: 2, small: true },
            ].map(k => (
              <div key={k.label} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderTop: `2px solid ${k.color}`, borderRadius: 8, padding: '10px 12px',
                gridColumn: k.span ? `span ${k.span}` : undefined,
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: k.small ? 14 : 24, color: k.color, lineHeight: 1, marginBottom: 4 }}>
                  {k.value}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.5 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* 14-day trend */}
          <div className="panel" style={{ padding: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
              SON 14 GÜN — GİRİŞ TRENDİ
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 50 }}>
              {sparkPoints.map((p, i) => {
                const max = Math.max(1, ...sparkPoints)
                return (
                  <div key={i} style={{
                    flex: 1, height: `${(p / max) * 100}%`, minHeight: 2,
                    background: p > 0 ? 'var(--accent3)' : 'var(--border)',
                    borderRadius: 2, position: 'relative',
                  }} title={`${p}`}>
                    {p > 0 && (
                      <span style={{
                        position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)',
                      }}>{p}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Faz 4 — Yıllık heatmap */}
          {heatmap.length > 0 && <YearHeatmap points={heatmap} />}

          {/* Faz 4 — Saat × gün matrisi */}
          {hourDay.length > 0 && <HourDayMatrix points={hourDay} />}

          {/* Faz 5 — Blok kıyas */}
          <BlockCompareCard blockAvg={blockAvg} summary={summary} />

          {/* Faz 5 — SLA ihlalleri */}
          <SlaCard violations={slaViolations} />

          {/* Faz 5 — Hasar raporları */}
          <DamagesCard damages={damages} />

          {/* Faz 3 — Y blok premium parça listesi */}
          {isYBlock && premiumItems.length > 0 && (
            <PremiumGarmentsCard items={premiumItems} />
          )}

          {/* Status breakdown */}
          {byStatus.length > 0 && (
            <div className="panel" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
                DURUM DAĞILIMI
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {byStatus.map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'var(--surface2)', borderRadius: 4, padding: '3px 8px',
                    border: `1px solid ${STATUS_COLOR[k] || 'var(--border)'}`,
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: STATUS_COLOR[k] || 'var(--text3)', fontWeight: 700 }}>{v}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{STATUS_LABEL[k] || k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Occupants */}
          {occupants.length > 0 && (
            <div className="panel" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
                ODA SAKİNLERİ ({occupants.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {occupants.map(p => {
                  const stats = byPerson.find(bp => bp.name === p.full_name)
                  return (
                    <button key={p.id} onClick={() => setPersonPanelName(p.full_name)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                      }}>
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
                          🛏 {p.bed_no} · {p.full_name}
                        </div>
                        {p.company && (
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{p.company}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {stats && (
                          <>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)' }}>{stats.total} torba</span>
                            {stats.lost > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>· {stats.lost} kayıp</span>}
                          </>
                        )}
                        <span style={{ color: 'var(--text3)', fontSize: 10 }}>→</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {byPerson.some(bp => !occupants.find(o => o.full_name === bp.name)) && (
                <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
                  GEÇMİŞTE TESLİM EDEN (artık odada değil)
                </div>
              )}
              {byPerson.filter(bp => !occupants.find(o => o.full_name === bp.name)).map(bp => (
                <button key={bp.name} onClick={() => setPersonPanelName(bp.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: '1px dashed var(--border)',
                    borderRadius: 6, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                    marginTop: 4,
                  }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', opacity: 0.7 }}>{bp.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{bp.total} torba</span>
                </button>
              ))}
            </div>
          )}

          {/* Timeline + batch mode + per-item actions (Faz 3) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>
                TÜM GEÇMİŞ ({tlFilterActive ? `${filteredItems.length}/${items.length}` : items.length})
              </div>
              <button onClick={() => { setBatchMode(b => !b); setSelectedIds(new Set()); setBatchAction(null) }}
                className="rooms-detail-no-print"
                style={{
                  fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', cursor: 'pointer',
                  background: batchMode ? 'rgba(240,165,0,0.18)' : 'var(--surface2)',
                  border: `1px solid ${batchMode ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                  color: batchMode ? 'var(--accent)' : 'var(--text3)', borderRadius: 4, letterSpacing: 1,
                }}>
                {batchMode ? '✓ TOPLU' : '☐ TOPLU SEÇ'}
              </button>
            </div>

            {/* Faz 1 — Timeline filtre çubuğu */}
            {items.length > 0 && (
              <div className="rooms-detail-no-print" style={{
                display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                marginBottom: 8, padding: '8px 10px',
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              }}>
                <TlChipGroup value={tlStatus} onChange={setTlStatus} options={[
                  ['all', 'Tümü'], ['active', 'Aktif'], ['delivered', 'Teslim'], ['lost', 'Kayıp'],
                ]} />
                <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <TlChipGroup value={tlType} onChange={setTlType} options={[
                  ['all', '·'], ['urgent', '⚡'], ['ironing', '🫧'], ['premium', '🟣'],
                ]} />
                <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <TlChipGroup value={tlRange} onChange={setTlRange} options={[
                  ['all', 'Hepsi'], ['7', '7G'], ['30', '30G'], ['90', '90G'],
                ]} />
                <input value={tlSearch} onChange={e => setTlSearch(e.target.value)}
                  placeholder="Ara…"
                  className="form-input"
                  style={{ flex: '1 1 100px', minWidth: 80, height: 24, padding: '2px 8px', fontSize: 10, marginLeft: 'auto' }} />
                {tlFilterActive && (
                  <button onClick={() => { setTlStatus('all'); setTlType('all'); setTlRange('all'); setTlSearch('') }}
                    title="Filtreleri temizle"
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                      color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '2px 6px',
                    }}>✕</button>
                )}
              </div>
            )}

            {/* Batch action bar */}
            {batchMode && selectedIds.size > 0 && (
              <div className="panel rooms-detail-no-print" style={{
                padding: 10, marginBottom: 8, background: 'rgba(240,165,0,0.05)',
                border: '1px solid rgba(240,165,0,0.2)',
                display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                  {selectedIds.size} seçili
                </span>
                {batchAction === null && (
                  <>
                    <button onClick={() => setBatchAction('deliver')} className="btn btn-primary btn-xs" style={{ marginLeft: 'auto' }}>
                      🚚 Toplu Teslim
                    </button>
                    <button onClick={() => setBatchAction('lost')} className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>
                      ✕ Toplu Kayıp
                    </button>
                  </>
                )}
                {batchAction === 'deliver' && (
                  <>
                    <input className="form-input" value={batchInput} autoFocus
                      onChange={e => setBatchInput(e.target.value)}
                      placeholder="Teslim alan adı..."
                      style={{ flex: 1, minWidth: 120, height: 28, fontSize: 11 }} />
                    <button onClick={() => batchInput.trim() && batchDeliverMut.mutate(batchInput.trim())}
                      disabled={!batchInput.trim() || batchDeliverMut.isPending}
                      className="btn btn-primary btn-xs">✓ Teslim et</button>
                    <button onClick={() => { setBatchAction(null); setBatchInput('') }} className="btn btn-ghost btn-xs">İptal</button>
                  </>
                )}
                {batchAction === 'lost' && (
                  <>
                    <input className="form-input" value={batchInput} autoFocus
                      onChange={e => setBatchInput(e.target.value)}
                      placeholder="Kayıp notu (opsiyonel)..."
                      style={{ flex: 1, minWidth: 120, height: 28, fontSize: 11 }} />
                    <button onClick={() => batchLostMut.mutate(batchInput.trim() || null)}
                      disabled={batchLostMut.isPending}
                      className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                      ✕ Kayıp işaretle
                    </button>
                    <button onClick={() => { setBatchAction(null); setBatchInput('') }} className="btn btn-ghost btn-xs">İptal</button>
                  </>
                )}
              </div>
            )}

            {isLoading && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div>}
            {!isLoading && items.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Bu oda için kayıt yok
              </div>
            )}
            {!isLoading && items.length > 0 && filteredItems.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Filtreye uyan kayıt yok
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredItems.map(it => {
                const selected = selectedIds.has(it.id)
                const expanded = actionItem === it.id
                const isFinal = it.status === 'delivered' || it.status === 'lost'
                return (
                  <div key={it.id} style={{
                    background: selected ? 'rgba(240,165,0,0.10)' : 'var(--surface2)',
                    borderRadius: 6, padding: '8px 12px',
                    borderLeft: `3px solid ${STATUS_COLOR[it.status] || 'var(--border)'}`,
                    border: selected ? '1px solid rgba(240,165,0,0.4)' : '1px solid transparent',
                    cursor: batchMode || !isFinal ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (batchMode) toggleSelect(it.id)
                    else if (!isFinal) setActionItem(expanded ? null : it.id)
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {batchMode && (
                          <input type="checkbox" checked={selected} readOnly
                            style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
                        )}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)' }}>
                          {it.bag_no || `#${it.id}`}
                        </span>
                      </div>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px', borderRadius: 3,
                        background: 'var(--surface)', color: STATUS_COLOR[it.status] || 'var(--text3)',
                        fontWeight: 700, letterSpacing: 1,
                      }}>
                        {STATUS_LABEL[it.status] || it.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
                      {it.item_count} parça
                      {it.is_premium ? ' · 🟣' : ''}
                      {it.urgent ? ' · ⚡' : ''}
                      {it.needs_ironing ? ' · 🫧' : ''}
                      {it.file_count != null && it.file_count > 0 ? ` · ${it.file_count} file teslim` : ''}
                      {it.total_hours != null && ` · ${it.total_hours}s`}
                    </div>
                    {it.intake_name && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)', marginTop: 2 }}>
                        👤 <button onClick={(e) => { e.stopPropagation(); setPersonPanelName(it.intake_name) }}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}>
                          {it.intake_name}
                        </button>
                      </div>
                    )}
                    {it.notes && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginTop: 2, fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        📝 {it.notes}
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 3 }}>
                      {new Date(it.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {it.delivered_at && ` → teslim ${new Date(it.delivered_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </div>

                    {/* Per-item action menu (Faz 3) */}
                    {expanded && !batchMode && (
                      <ItemActionMenu
                        item={it}
                        onAdvance={() => advance.mutate({ id: it.id })}
                        onDeliver={(name) => deliver.mutate({ id: it.id, delivered_to: name })}
                        onLost={(note) => markLost.mutate({ id: it.id, notes: note })}
                        onClose={() => setActionItem(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          </>)}
        </div>
      </div>

      {personPanelName && <PersonPanel name={personPanelName} onClose={() => setPersonPanelName(null)} />}
    </>
  )
}

// ── Inline new-record form (panel içi) ───────────────────────────────────────

const QUICK_TYPES = ['Pantolon', 'Gömlek', 'T-Shirt', 'İç Çamaşırı', 'Çorap', 'Havlu', 'Eşofman', 'Mont']

// Compact signature pad (panel-friendly height)
function CompactSigPad({ sigRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  useEffect(() => {
    if (sigRef) sigRef.current = {
      isEmpty: () => !hasSig,
      toDataURL: () => canvasRef.current?.toDataURL(),
      clear: () => {
        canvasRef.current?.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        setHasSig(false)
      },
    }
  })

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    return {
      x: (touch.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (touch.clientY - rect.top) * (canvasRef.current.height / rect.height),
    }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault(); drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
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
      <canvas ref={canvasRef} width={520} height={110}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, display: 'block', cursor: 'crosshair', touchAction: 'none', width: '100%' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      {hasSig && (
        <button type="button" onClick={() => sigRef.current?.clear()}
          style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Temizle
        </button>
      )}
    </div>
  )
}

function InlineNewRecord({ roomId, block, room_no, occupants, lastBag, onSaved }) {
  const needsSig  = SIGN_BLOCKS.has(block)
  const isPremium = BLOCK_BY_NAME[block]?.type === 'Y'

  const [intakeName, setIntakeName] = useState('')
  const [phoneOverride, setPhoneOverride] = useState('')
  const [clothing, setClothing] = useState([])         // [{type, qty, colors:[], pattern:''}]
  const [premiumRows, setPremiumRows] = useState([])    // [{garment_type, brand, model, size, color, pattern, condition_notes}]
  const [itemCount, setItemCount] = useState(1)
  const [notes, setNotes] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [needsIroning, setNeedsIroning] = useState(isPremium)  // premium → varsayılan açık
  const [expandedIdx, setExpandedIdx] = useState(null)  // hangi clothing item açık
  const [error, setError] = useState('')
  const sigRef = useRef(null)

  // Premium parça inline form state
  const [premType, setPremType] = useState('')
  const [premBrand, setPremBrand] = useState('')
  const [premModel, setPremModel] = useState('')
  const [premSize, setPremSize] = useState('')
  const [premColors, setPremColors] = useState([])
  const [premPattern, setPremPattern] = useState('')
  const [premNotes, setPremNotes] = useState('')
  const [premQty, setPremQty] = useState(1)

  // Otomatik telefon fetch
  useEffect(() => {
    if (!roomId) return
    laundryApi.getRoomOccupant(roomId)
      .then(data => { if (data?.phone_number) setPhoneOverride(data.phone_number) })
      .catch(() => {})
  }, [roomId])

  const totalCount = isPremium && premiumRows.length > 0
    ? premiumRows.length
    : (clothing.length > 0 ? clothing.reduce((s, c) => s + (c.qty || 1), 0) : itemCount)

  const create = useMutation({
    mutationFn: async () => {
      let intake_signature = null
      if (needsSig) {
        if (sigRef.current?.isEmpty()) throw new Error('İmza gerekli')
        intake_signature = sigRef.current?.toDataURL() || null
      }
      // Renk/desen → SQL'in beklediği "color" string + "pattern"
      const clothing_items = clothing.length > 0
        ? clothing.map(c => ({
            type: c.type,
            color: (c.colors || []).join(', '),
            pattern: c.pattern || '',
            qty: c.qty,
          }))
        : undefined

      const item = await laundryApi.createItem({
        room_id: roomId,
        item_count: totalCount,
        urgent: urgent ? 1 : 0,
        needs_ironing: needsIroning ? 1 : 0,
        notes: notes.trim() || undefined,
        intake_name: intakeName.trim() || undefined,
        phone_override: phoneOverride.trim() || undefined,
        intake_signature: intake_signature || undefined,
        clothing_items,
      })
      if (isPremium && premiumRows.length > 0) {
        await laundryApi.addPremiumGarments(item.id, premiumRows)
      }
      return item
    },
    onSuccess: () => onSaved?.(),
    onError: (e) => setError(e.response?.data?.error || e.message || 'Kayıt eklenemedi'),
  })

  const addType = (type) => {
    setClothing(prev => {
      const existing = prev.find(c => c.type === type)
      if (existing) return prev.map(c => c.type === type ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { type, qty: 1, colors: [], pattern: '' }]
    })
  }
  const updateQty = (i, delta) => setClothing(prev =>
    prev.map((c, idx) => idx === i ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
  )
  const removeItem = (i) => setClothing(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, patch) => setClothing(prev =>
    prev.map((c, idx) => idx === i ? { ...c, ...patch } : c)
  )

  const addPremiumRow = () => {
    if (!premType.trim()) return
    const row = {
      garment_type: premType.trim(),
      brand: premBrand.trim() || undefined,
      model: premModel.trim() || undefined,
      size: premSize || undefined,
      color: premColors.length > 0 ? premColors.join(', ') : undefined,
      pattern: premPattern || undefined,
      condition_notes: premNotes.trim() || undefined,
    }
    setPremiumRows(prev => [...prev, ...Array.from({ length: premQty }, () => ({ ...row }))])
    setPremType(''); setPremBrand(''); setPremModel(''); setPremSize('')
    setPremColors([]); setPremPattern(''); setPremNotes(''); setPremQty(1)
  }
  const removePremiumRow = (i) => setPremiumRows(prev => prev.filter((_, idx) => idx !== i))

  const isValid = totalCount >= 1 && (!needsSig || sigRef.current?.isEmpty() === false)

  return (
    <div className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>
          YENİ KAYIT — {block} · {room_no}
        </div>
        {isPremium && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent3)',
            background: 'rgba(240,165,0,0.12)', padding: '2px 8px', borderRadius: 4,
            letterSpacing: 1, fontWeight: 700,
          }}>★ PREMIUM</span>
        )}
      </div>

      {/* Faz 6 — Geçen seferki gibi otomatik doldur */}
      {lastBag && (
        <button type="button"
          onClick={() => {
            setIntakeName(lastBag.intake_name || '')
            setUrgent(lastBag.urgent === 1)
            setNeedsIroning(lastBag.needs_ironing === 1)
            try {
              if (lastBag.clothing_items) {
                const arr = typeof lastBag.clothing_items === 'string' ? JSON.parse(lastBag.clothing_items) : lastBag.clothing_items
                if (Array.isArray(arr)) {
                  setClothing(arr.map(c => ({
                    type: c.type,
                    qty: c.qty || 1,
                    colors: c.color ? parseColors(c.color) : [],
                    pattern: c.pattern || '',
                  })))
                }
              }
              if (lastBag.garments_json && isPremium) {
                const g = JSON.parse(lastBag.garments_json)
                // garments_json structure varies; just hint user
                if (Array.isArray(g)) setPremiumRows(g.map(x => ({
                  garment_type: x.type_name || x.garment_type || 'Premium',
                  color: Array.isArray(x.colors) ? x.colors.map(c => c.label || c).join(', ') : x.color,
                  pattern: x.pattern_label || x.pattern,
                })))
              }
              if (lastBag.notes) setNotes(lastBag.notes)
            } catch {}
          }}
          style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
            background: 'rgba(240,165,0,0.06)', border: '1px dashed rgba(240,165,0,0.3)',
            borderRadius: 6, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
          }}>
          ↻ Geçen seferki gibi doldur ({new Date(lastBag.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} · {lastBag.item_count} parça{lastBag.intake_name ? ` · ${lastBag.intake_name}` : ''})
        </button>
      )}

      {/* Teslim eden */}
      <div>
        <label className="form-label" style={{ fontSize: 9 }}>TESLİM EDEN</label>
        {occupants.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {occupants.map(p => (
              <button key={p.id} type="button" onClick={() => setIntakeName(p.full_name)}
                style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5,
                  background: intakeName === p.full_name ? 'rgba(240,165,0,0.18)' : 'var(--surface2)',
                  border: `1px solid ${intakeName === p.full_name ? 'rgba(240,165,0,0.5)' : 'var(--border)'}`,
                  color: intakeName === p.full_name ? 'var(--accent)' : 'var(--text2)',
                }}>
                🛏 {p.bed_no} · {p.full_name}
              </button>
            ))}
          </div>
        )}
        <input className="form-input" value={intakeName}
          onChange={e => setIntakeName(e.target.value)}
          placeholder="Veya isim yaz…" style={{ fontSize: 12 }} />
      </div>

      {/* Telefon (otomatik dolu, düzeltilebilir) */}
      <div>
        <label className="form-label" style={{ fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
          <span>TELEFON (WHATSAPP)</span>
          {phoneOverride && (
            <a href={`https://wa.me/${phoneOverride.replace(/\D/g,'').replace(/^0/,'90')}`}
              target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none' }}>
              WA →
            </a>
          )}
        </label>
        <input className="form-input" value={phoneOverride}
          onChange={e => setPhoneOverride(e.target.value)}
          placeholder="Otomatik yüklenir…" style={{ fontSize: 12 }} />
      </div>

      {/* Standart parça akışı — premium DEĞİLSE veya premium ama henüz hiç satır yoksa */}
      {!isPremium && <>
        <div>
          <label className="form-label" style={{ fontSize: 9 }}>HIZLI PARÇA EKLE</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {QUICK_TYPES.map(t => (
              <button key={t} type="button" onClick={() => addType(t)}
                style={{
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 0.5,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text2)',
                }}>
                <span style={{ marginRight: 4 }}>{CLOTHING_ICONS[t] || '👕'}</span>{t} +
              </button>
            ))}
          </div>
        </div>

        {clothing.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {clothing.map((c, i) => {
              const isOpen = expandedIdx === i
              return (
                <div key={i} style={{
                  background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)',
                  padding: '6px 10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setExpandedIdx(isOpen ? null : i)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: 0 }}>
                      {isOpen ? '▾' : '▸'}
                    </button>
                    <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
                      {CLOTHING_ICONS[c.type] || '👕'} {c.type}
                    </span>
                    {(c.colors?.length > 0 || c.pattern) && (
                      <ColorPatternDisplay color={(c.colors || []).join(', ')} pattern={c.pattern || ''} />
                    )}
                    <button type="button" onClick={() => updateQty(i, -1)}
                      style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>−</button>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', minWidth: 18, textAlign: 'center' }}>{c.qty}</span>
                    <button type="button" onClick={() => updateQty(i, 1)}
                      style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>+</button>
                    <button type="button" onClick={() => removeItem(i)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <ColorPatternPicker
                        colors={c.colors || []}
                        pattern={c.pattern || ''}
                        onChange={({ colors, pattern }) => updateItem(i, { colors, pattern })}
                        compact
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'right' }}>
              toplam {totalCount} parça
            </div>
          </div>
        )}

        {clothing.length === 0 && (
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>TOPLAM PARÇA</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => setItemCount(c => Math.max(1, c - 1))}
                style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--accent)', minWidth: 28, textAlign: 'center' }}>{itemCount}</span>
              <button type="button" onClick={() => setItemCount(c => Math.min(99, c + 1))}
                style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>+</button>
            </div>
          </div>
        )}
      </>}

      {/* Premium parça akışı */}
      {isPremium && <>
        <div className="panel" style={{ padding: 10, background: 'rgba(240,165,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent3)', letterSpacing: 1.5, marginBottom: 8 }}>
            PREMIUM PARÇA DETAYI
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input className="form-input" value={premType}
              onChange={e => setPremType(e.target.value)}
              placeholder="Tip (Pantolon, Gömlek…)" style={{ fontSize: 11 }} />
            <input className="form-input" value={premBrand}
              onChange={e => setPremBrand(e.target.value)}
              placeholder="Marka" style={{ fontSize: 11 }} />
            <input className="form-input" value={premModel}
              onChange={e => setPremModel(e.target.value)}
              placeholder="Model" style={{ fontSize: 11 }} />
            <select className="form-input" value={premSize}
              onChange={e => setPremSize(e.target.value)}
              style={{ fontSize: 11 }}>
              <option value="">Beden seç</option>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <ColorPatternPicker
            colors={premColors}
            pattern={premPattern}
            onChange={({ colors, pattern }) => { setPremColors(colors); setPremPattern(pattern) }}
            compact
          />
          <input className="form-input" value={premNotes}
            onChange={e => setPremNotes(e.target.value)}
            placeholder="Durum notu (örn. yıpranmış, lekeli…)"
            style={{ fontSize: 11, marginTop: 6 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Adet:</span>
            <button type="button" onClick={() => setPremQty(q => Math.max(1, q - 1))}
              style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>−</button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', minWidth: 18, textAlign: 'center' }}>{premQty}</span>
            <button type="button" onClick={() => setPremQty(q => q + 1)}
              style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>+</button>
            <button type="button" onClick={addPremiumRow} disabled={!premType.trim()}
              className="btn btn-primary btn-xs"
              style={{ marginLeft: 'auto', opacity: premType.trim() ? 1 : 0.4 }}>
              + Ekle
            </button>
          </div>
        </div>

        {premiumRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {premiumRows.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
              }}>
                <span style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--text)' }}>{p.garment_type}</strong>
                  {p.brand && ` · ${p.brand}`}
                  {p.size && ` · ${p.size}`}
                  {p.color && ` · ${p.color}`}
                  {p.pattern && ` · ${p.pattern}`}
                  {p.condition_notes && <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}> · {p.condition_notes}</span>}
                </span>
                <button type="button" onClick={() => removePremiumRow(i)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✕</button>
              </div>
            ))}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'right' }}>
              toplam {premiumRows.length} premium parça
            </div>
          </div>
        )}
      </>}

      {/* Notlar */}
      <div>
        <label className="form-label" style={{ fontSize: 9 }}>NOT / YAZIYLA</label>
        <textarea className="form-input" value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Kelime hatası olsa da kaydedilir, sonra düzeltebilirsin…"
          rows={2}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }} />
      </div>

      {/* Toggle'lar */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: urgent ? 'var(--red)' : 'var(--text2)', fontWeight: urgent ? 700 : 400 }}>⚡ Acil</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={needsIroning} onChange={e => setNeedsIroning(e.target.checked)} style={{ width: 14, height: 14 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: needsIroning ? '#a78bfa' : 'var(--text2)' }}>🫧 Ütü</span>
        </label>
      </div>

      {/* İmza */}
      {needsSig && (
        <div>
          <label className="form-label" style={{ fontSize: 9 }}>İMZA <span style={{ color: 'var(--red)' }}>(gerekli)</span></label>
          <CompactSigPad sigRef={sigRef} />
        </div>
      )}

      {error && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>{error}</div>
      )}

      <button className="btn btn-primary" onClick={() => create.mutate()}
        disabled={create.isPending || totalCount < 1}
        style={{ letterSpacing: 1, opacity: create.isPending ? 0.6 : 1 }}>
        {create.isPending ? 'Kaydediliyor…' : '✓ KAYDET'}
      </button>
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

// ── Year heatmap (53 hafta × 7 gün) ──────────────────────────────────────────

function YearHeatmap({ points = [] }) {
  // points: [{day: 'YYYY-MM-DD', count: N}]
  const map = useMemo(() => {
    const m = {}
    for (const p of points) m[p.day] = p.count
    return m
  }, [points])

  // 53 hafta'lık grid — bugünden geriye
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks = []
  // En sağdaki hafta — bugünü içerecek; bu hafta cumartesi ile biter
  const dayOfWeek = today.getDay() // 0=Sun
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + (6 - dayOfWeek)) // bu haftanın Cumartesisi
  const cursor = new Date(endDate)
  cursor.setDate(cursor.getDate() - 53 * 7 + 1)
  for (let w = 0; w < 53; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10)
      const count = map[key] || 0
      const future = cursor.getTime() > today.getTime()
      days.push({ key, count, future })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(days)
  }

  const maxCount = Math.max(1, ...points.map(p => p.count))
  const cellSize = 9

  function color(count, future) {
    if (future) return 'transparent'
    if (count === 0) return 'var(--surface2)'
    const intensity = Math.min(1, count / maxCount)
    if (intensity < 0.25) return 'rgba(96,165,250,0.35)'
    if (intensity < 0.5)  return 'rgba(96,165,250,0.55)'
    if (intensity < 0.75) return 'rgba(96,165,250,0.75)'
    return 'rgba(96,165,250,0.95)'
  }

  // Ay etiketleri — her 4 haftada bir hafta'nın ilk gününün ay'ını yaz
  const monthLabels = weeks.map((w, i) => {
    if (i % 4 !== 0) return null
    const d = new Date(w[0].key)
    return d.toLocaleDateString('tr-TR', { month: 'short' })
  })

  return (
    <div className="panel" style={{ padding: 12, overflowX: 'auto' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        SON 12 AY — YILLIK ISI HARİTASI
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 'fit-content' }}>
        <div style={{ display: 'flex', gap: 2, paddingLeft: 16 }}>
          {monthLabels.map((m, i) => (
            <div key={i} style={{ width: cellSize, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)' }}>
              {m || ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)' }}>
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Pzt</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Çar</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize, lineHeight: `${cellSize}px` }}>Cum</div>
            <div style={{ height: cellSize }} />
            <div style={{ height: cellSize }} />
          </div>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {w.map(d => (
                <div key={d.key} title={`${d.key}: ${d.count} torba`}
                  style={{ width: cellSize, height: cellSize, borderRadius: 2, background: color(d.count, d.future) }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>az</span>
          {[0, 0.25, 0.5, 0.75, 1].map(i => (
            <div key={i} style={{ width: cellSize, height: cellSize, borderRadius: 2, background: color(i * maxCount, false) }} />
          ))}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>çok</span>
        </div>
      </div>
    </div>
  )
}

// ── Hour × Day matrix ────────────────────────────────────────────────────────

function HourDayMatrix({ points = [] }) {
  // points: [{dow, hour, count}]
  const matrix = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const p of points) m[p.dow][p.hour] = p.count
    return m
  }, [points])

  const max = Math.max(1, ...points.map(p => p.count))

  function color(count) {
    if (count === 0) return 'var(--surface2)'
    const intensity = Math.min(1, count / max)
    if (intensity < 0.25) return 'rgba(168,85,247,0.30)'
    if (intensity < 0.5)  return 'rgba(168,85,247,0.55)'
    if (intensity < 0.75) return 'rgba(168,85,247,0.80)'
    return 'rgba(168,85,247,1)'
  }

  // Pzt (1) → Pzr (0) sıralaması iş günlerini önce göstermek için
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div className="panel" style={{ padding: 12, overflowX: 'auto' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        SAAT × GÜN PATTERN'İ
      </div>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 2, paddingLeft: 30 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ width: 11, fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text3)', textAlign: 'center' }}>
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {dowOrder.map(dow => (
          <div key={dow} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <div style={{ width: 28, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{DOW_LABELS[dow]}</div>
            {matrix[dow].map((c, h) => (
              <div key={h} title={`${DOW_LABELS[dow]} ${h}:00 — ${c} torba`}
                style={{ width: 11, height: 11, borderRadius: 2, background: color(c) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Block compare card ───────────────────────────────────────────────────────

function BlockCompareCard({ blockAvg, summary }) {
  if (!blockAvg || blockAvg.room_count == null) return null
  const rows = [
    { label: 'Toplam torba',     mine: summary.total_given || 0,   block: blockAvg.avg_total || 0 },
    { label: '30 günlük',        mine: null /* eklenebilir */,     block: blockAvg.avg_last_30d || 0 },
    { label: 'Kayıp adedi',      mine: summary.total_lost || 0,    block: blockAvg.avg_lost || 0,    inverse: true },
    { label: 'Ort. teslim (s)',  mine: summary.avg_hours || 0,     block: blockAvg.avg_delivery_hours || 0, inverse: true },
  ].filter(r => r.mine != null)

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        BLOK ORTALAMASIYLA KIYAS ({blockAvg.room_count} oda)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const delta = r.block > 0 ? ((r.mine - r.block) / r.block) * 100 : 0
          const better = r.inverse ? delta < 0 : delta > 0
          const same = Math.abs(delta) < 5
          const color = same ? 'var(--text3)' : (better ? 'var(--green)' : 'var(--red)')
          return (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--text)', minWidth: 40, textAlign: 'right' }}>
                {Number(r.mine).toFixed?.(r.label.includes('s)') ? 1 : 0) ?? r.mine}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>vs</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>
                {Number(r.block).toFixed?.(1) ?? r.block}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color, minWidth: 56, textAlign: 'right', fontWeight: 700 }}>
                {same ? '~aynı' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SLA card ─────────────────────────────────────────────────────────────────

function SlaCard({ violations }) {
  if (!violations || violations.length === 0) return null
  return (
    <div className="panel" style={{ padding: 12, borderLeft: '3px solid var(--red)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', letterSpacing: 1.5, marginBottom: 8 }}>
        ⚠ SLA İHLALİ ({violations.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {violations.map(v => {
          const critical = v.hours >= (v.critical_hours || Infinity)
          return (
            <div key={v.id} style={{
              padding: '6px 10px', borderRadius: 6,
              background: critical ? 'rgba(220,38,38,0.12)' : 'rgba(240,165,0,0.08)',
              border: `1px solid ${critical ? 'rgba(220,38,38,0.3)' : 'rgba(240,165,0,0.2)'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)' }}>{v.bag_no || `#${v.id}`}</span>
              <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                {v.status} · {v.hours}s
                {v.intake_name && ` · ${v.intake_name}`}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: critical ? 'var(--red)' : 'var(--accent)' }}>
                {critical ? 'KRİTİK' : 'UYARI'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Item action menu (Faz 3) ─────────────────────────────────────────────────

const NEXT_STATUS_LABEL = {
  dirty: 'Yıkamaya al',
  pending_collection: 'Topla',
  washing: 'Rafa al',
  ironing: 'Ütüyü tamamla',
  ready: 'Teslim et',
}

function ItemActionMenu({ item, onAdvance, onDeliver, onLost, onClose }) {
  const [mode, setMode] = useState(null)  // null | 'deliver' | 'lost'
  const [input, setInput] = useState('')
  const nextLabel = NEXT_STATUS_LABEL[item.status]
  return (
    <div onClick={e => e.stopPropagation()}
      style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      }}>
      {mode === null && (
        <>
          {nextLabel && item.status !== 'ready' && (
            <button onClick={onAdvance} className="btn btn-ghost btn-xs"
              style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>
              → {nextLabel}
            </button>
          )}
          {item.status === 'ready' && (
            <button onClick={() => setMode('deliver')} className="btn btn-primary btn-xs">
              🚚 Teslim et
            </button>
          )}
          <button onClick={() => setMode('lost')} className="btn btn-ghost btn-xs"
            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            ✕ Kayıp
          </button>
          <button onClick={onClose} className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }}>Kapat</button>
        </>
      )}
      {mode === 'deliver' && (
        <>
          <input className="form-input" value={input} autoFocus
            onChange={e => setInput(e.target.value)}
            placeholder="Teslim alan adı..."
            style={{ flex: 1, minWidth: 100, height: 26, fontSize: 11 }} />
          <button onClick={() => input.trim() && onDeliver(input.trim())}
            disabled={!input.trim()}
            className="btn btn-primary btn-xs">✓</button>
          <button onClick={() => { setMode(null); setInput('') }} className="btn btn-ghost btn-xs">İptal</button>
        </>
      )}
      {mode === 'lost' && (
        <>
          <input className="form-input" value={input} autoFocus
            onChange={e => setInput(e.target.value)}
            placeholder="Kayıp notu (opsiyonel)..."
            style={{ flex: 1, minWidth: 100, height: 26, fontSize: 11 }} />
          <button onClick={() => onLost(input.trim() || null)}
            className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
            ✕ Kayıp işaretle
          </button>
          <button onClick={() => { setMode(null); setInput('') }} className="btn btn-ghost btn-xs">İptal</button>
        </>
      )}
    </div>
  )
}

// ── Damages card ─────────────────────────────────────────────────────────────

function DamagesCard({ damages }) {
  if (!damages || damages.length === 0) return null
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        🔧 HASAR RAPORLARI ({damages.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {damages.slice(0, 10).map(d => (
          <div key={d.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
            {d.photo_url && (
              <img src={d.photo_url} alt="hasar"
                style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--blue)' }}>{d.bag_no || `#${d.item_id}`}</span>
                {d.at_intake ? ' · giriş anında' : ' · sonradan'}
                {d.intake_name && ` · ${d.intake_name}`}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', marginTop: 2 }}>
                {d.description}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 2 }}>
                {d.reported_by_name && `${d.reported_by_name} · `}
                {new Date(d.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
