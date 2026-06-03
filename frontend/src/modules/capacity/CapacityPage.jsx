// Kapasite yönetimi orkestratörü: blok/kat seçimi + filtreler + koridor planı,
// seçili oda detayı ve odasız personel havuzunu birbirine bağlar.
// Sunum/iş parçaları: ./CorridorPlan, ./RoomDetailPanel, ./UnassignedPool, ./shared.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import HelpHint from '../../shared/components/HelpHint.jsx'
import api from '../../shared/api/client.js'
import {
  BLOCKS_BY_TYPE,
  BLOCK_BY_NAME,
  getFloorLabel,
} from '../../shared/blocks.js'
import CorridorPlan from './CorridorPlan.jsx'
import RoomDetailPanel from './RoomDetailPanel.jsx'
import UnassignedPool from './UnassignedPool.jsx'

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CapacityPage() {
  const [searchParams] = useSearchParams()
  const blockParam = searchParams.get('block')

  const initialType = blockParam ? (BLOCK_BY_NAME[blockParam]?.type ?? 'M') : 'M'
  const [blockType, setBlockType] = useState(initialType)
  const [selectedBlock, setSelectedBlock] = useState(blockParam || 'M1')
  const [floor, setFloor] = useState(1)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [roomCompanyFilter, setRoomCompanyFilter] = useState('')
  const [swapSource, setSwapSource] = useState(null)
  const [dragOverRoomId, setDragOverRoomId] = useState(null)
  const [dropMsg, setDropMsg] = useState(null)
  const qc = useQueryClient()

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms', selectedBlock, emptyOnly, roomCompanyFilter],
    queryFn: () => {
      let url = `/capacity/rooms?block=${selectedBlock}`
      if (emptyOnly) url += '&empty_only=true'
      if (roomCompanyFilter) url += `&company=${encodeURIComponent(roomCompanyFilter)}`
      return api.get(url).then(r => r.data)
    },
    enabled: !!selectedBlock,
  })

  const { data: companySuggestions = [] } = useQuery({
    queryKey: ['company-suggestions'],
    queryFn: () => api.get('/checkin/company-suggestions').then(r => r.data),
  })

  const blocks = BLOCKS_BY_TYPE[blockType]

  function handleBlockChange(b) { setSelectedBlock(b); setFloor(1); setSelectedRoom(null) }
  function handleBlockTypeChange(t) {
    setBlockType(t)
    const firstBlock = BLOCKS_BY_TYPE[t][0]
    setSelectedBlock(firstBlock)
    setFloor(1)
    setSelectedRoom(null)
  }
  function handleRoomSelect(room) {
    setSelectedRoom(prev => prev?.id === room.id ? null : room)
  }
  const mutDropAssign = useMutation({
    mutationFn: ({ personnelId, roomId }) => api.post('/capacity/reassign', { personnel_id: personnelId, room_id: roomId }),
    onSuccess: () => {
      setDropMsg({ ok: true, msg: 'Personel odaya taşındı.' })
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      qc.invalidateQueries(['unassigned-personnel'])
      setTimeout(() => setDropMsg(null), 3000)
    },
    onError: (e) => {
      setDropMsg({ ok: false, msg: e.response?.data?.error || 'Taşıma başarısız.' })
      setTimeout(() => setDropMsg(null), 4000)
    },
  })

  function handleDropPersonnel(personnelId, roomId) {
    mutDropAssign.mutate({ personnelId, roomId })
  }

  function handleRoomUpdated() {
    qc.invalidateQueries(['rooms', selectedBlock])
    // Re-fetch to update selectedRoom data
    setSelectedRoom(prev => prev ? { ...prev } : null)
  }

  // sync selectedRoom from fresh rooms data
  const currentRoom = selectedRoom
    ? rooms.find(r => r.id === selectedRoom.id) || selectedRoom
    : null

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '4px', color: 'var(--text)' }}>
            KAPASİTE YÖNETİMİ<HelpHint topic="capacity" title="KAPASİTE" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            KORIDOR PLANI · ODA VE YATAK DURUMU · PERSONEL YÖNETİMİ
          </p>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)',
          border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px',
          lineHeight: 1.8,
        }}>
          <div><span style={{ color: 'var(--blue)' }}>■</span> M1/M2/M3 — 30 ODA/KAT · 6 KİŞİLİK · ORTAK WC/BANYO</div>
          <div><span style={{ color: 'var(--purple)' }}>■</span> S1/S3 — 24 ODA/KAT · 6 KİŞİLİK · ÖZEL BANYO</div>
          <div><span style={{ color: 'var(--accent)' }}>■</span> S2 — 24 ODA/KAT · KAT 2: 4 KİŞİLİK, KAT 1: 6 KİŞİLİK · ÖZEL BANYO</div>
          <div><span style={{ color: 'var(--green)' }}>■</span> A/A1-A4/B/C/D/E/F/G/H/J — KAPASİTE PLACEHOLDER · ÖZEL BANYO</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Block type switcher */}
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: '8px',
          padding: '3px', border: '1px solid var(--border)',
        }}>
          {['M', 'S', 'Y'].map(t => (
            <button
              key={t}
              onClick={() => handleBlockTypeChange(t)}
              style={{
                padding: '7px 22px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--display)', fontSize: '15px', fontWeight: 700, letterSpacing: '2px',
                transition: 'all 0.15s',
                background: blockType === t ? 'var(--accent)' : 'transparent',
                color: blockType === t ? '#000' : 'var(--text2)',
              }}
            >
              {t} BLOK
            </button>
          ))}
        </div>

        {/* Block selector */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {blocks.map(b => (
            <button
              key={b}
              onClick={() => handleBlockChange(b)}
              className={`filter-chip${selectedBlock === b ? ' active' : ''}`}
              style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Floor selector — dinamik */}
        {(() => {
          const cfg = BLOCK_BY_NAME[selectedBlock]
          const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
          if (floorList.length <= 1) return null
          return (
            <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
              {floorList.map(f => (
                <button
                  key={f}
                  onClick={() => { setFloor(f); setSelectedRoom(null) }}
                  className={`filter-chip${floor === f ? ' active' : ''}`}
                >
                  KAT {f}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
                    {getFloorLabel(selectedBlock, f)}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => { setEmptyOnly(v => !v); setSelectedRoom(null) }}
          className={`filter-chip${emptyOnly ? ' active' : ''}`}
          style={{ background: emptyOnly ? 'var(--green)' : undefined, borderColor: emptyOnly ? 'var(--green)' : undefined, color: emptyOnly ? '#000' : undefined }}
        >
          {emptyOnly ? '✓ ' : ''}Bos Odalar
        </button>
        <select
          className="form-select"
          value={roomCompanyFilter}
          onChange={e => { setRoomCompanyFilter(e.target.value); setSelectedRoom(null) }}
          style={{ fontSize: '12px', padding: '6px 10px', minWidth: '160px', maxWidth: '260px' }}
        >
          <option value="">Tum Sirketler</option>
          {companySuggestions.map(c => (
            <option key={c.company || c} value={c.company || c}>{c.company || c}</option>
          ))}
        </select>
        {(emptyOnly || roomCompanyFilter) && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => { setEmptyOnly(false); setRoomCompanyFilter(''); setSelectedRoom(null) }}
            style={{ fontSize: '9px' }}
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Plan panel */}
      <div className="panel" style={{ marginBottom: '0' }}>
        <div style={{ height: '2px', background:
          blockType === 'M' ? 'linear-gradient(90deg,var(--blue),var(--purple))' :
          blockType === 'S' ? 'linear-gradient(90deg,var(--purple),var(--teal))' :
                              'linear-gradient(90deg,var(--teal),var(--green))'
        }} />
        <div className="panel-header">
          <div>
            <div className="panel-title" style={{ fontSize: '17px' }}>{selectedBlock} BLOK — KAT {floor}</div>
            <div className="panel-subtitle">
              KORİDOR PLANI · ODA {getFloorLabel(selectedBlock, floor) || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className={`tag tag-${blockType.toLowerCase()}`}>{blockType}</span>
            {selectedBlock === 'S2' && floor === 2 && <span className="tag tag-exc">4K · İSTİSNA</span>}
            {selectedRoom && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', letterSpacing: '1px' }}>
                ODA {selectedRoom.room_no} SEÇİLİ
              </span>
            )}
          </div>
        </div>
        <div className="panel-body">
          <CorridorPlan
            block={selectedBlock}
            floor={floor}
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelect={handleRoomSelect}
            onDropPersonnel={handleDropPersonnel}
            dragOverRoomId={dragOverRoomId}
            onDragOverRoom={setDragOverRoomId}
          />
        </div>
      </div>

      {/* Drop feedback message */}
      {dropMsg && (
        <div className={`alert ${dropMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '12px' }}>
          <span>{dropMsg.ok ? '✓' : '!'}</span><span>{dropMsg.msg}</span>
        </div>
      )}

      {/* Swap mode banner at page level */}
      {swapSource && !currentRoom && (
        <div className="panel fade-up" style={{ marginTop: '18px', padding: '14px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(142,68,230,.1)', border: '1px solid rgba(142,68,230,.4)',
            borderRadius: '7px', padding: '10px 14px',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--purple)', fontWeight: 600 }}>
              TAKAS MODU: {swapSource.name} ({swapSource.roomLabel}) secildi — baska bir oda secip hedef kisiyi secin
            </span>
            <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto', fontSize: '9px' }} onClick={() => setSwapSource(null)}>
              IPTAL
            </button>
          </div>
        </div>
      )}

      {/* Room detail panel */}
      {currentRoom && (
        <RoomDetailPanel
          key={currentRoom.id}
          room={currentRoom}
          onClose={() => setSelectedRoom(null)}
          onRoomUpdated={handleRoomUpdated}
          swapSource={swapSource}
          onSwapSelect={(person) => setSwapSource(person)}
          onSwapCancel={() => setSwapSource(null)}
        />
      )}

      {/* Unassigned personnel pool */}
      <UnassignedPool
        selectedRoom={currentRoom}
        onAssigned={handleRoomUpdated}
      />
    </div>
  )
}
