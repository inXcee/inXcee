import { useEffect, useState } from 'react'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, blockDisplayName, expectedRoomNos } from '../../shared/blocks.js'
import { parseRoomShortcut } from './quickParse.js'

// Bir bloğun tüm katlarındaki oda numaralarını düzleştir
function allRoomNos(blockName) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const out = []
  for (let f = 1; f <= cfg.floors; f++) out.push(...expectedRoomNos(blockName, f))
  return out
}

// Props:
//   value: { block, room_no, person } | null
//   onChange: ({ block, room_no, person }) => void
//   kioskApi: { get, post, put }
export default function RoomGridPicker({ value, onChange, kioskApi }) {
  const block = value?.block || null
  const room_no = value?.room_no || null
  const person = value?.person || null

  const [activeBagRooms, setActiveBagRooms] = useState(new Set())
  const [persons, setPersons] = useState([])
  const [loadingPersons, setLoadingPersons] = useState(false)
  const [quickRoom, setQuickRoom] = useState('')
  const [manualRoom, setManualRoom] = useState('')
  const quickParsed = parseRoomShortcut(quickRoom)
  const manualConfig = block ? BLOCK_BY_NAME[block] : null
  const manualRoomNumber = /^\d+$/.test(manualRoom) ? Number(manualRoom) : null
  const manualRoomValid = Boolean(
    manualConfig?.manualRoomEntry && manualRoomNumber >= 1 && manualRoomNumber <= manualConfig.perFloor
  )

  function applyQuickRoom() {
    if (!quickParsed) return
    onChange({ block: quickParsed.block, room_no: quickParsed.room_no, person: null })
    setQuickRoom('')
  }

  function applyManualRoom() {
    if (!manualRoomValid) return
    onChange({ block, room_no: String(manualRoomNumber), person: null })
  }

  // Block changed → fetch active bags for that block
  useEffect(() => {
    if (!block) { setActiveBagRooms(new Set()); return }
    let cancelled = false
    kioskApi.get(`/self-service/laundry-kiosk/bags?block=${encodeURIComponent(block)}`)
      .then(r => {
        if (cancelled) return
        const rooms = new Set(r.data.map(b => String(b.room_no)))
        setActiveBagRooms(rooms)
      })
      .catch(() => { if (!cancelled) setActiveBagRooms(new Set()) })
    return () => { cancelled = true }
  }, [block, kioskApi])

  // Room changed → fetch persons
  useEffect(() => {
    if (!block || !room_no) { setPersons([]); return }
    let cancelled = false
    setLoadingPersons(true)
    kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(block)}&room_no=${encodeURIComponent(room_no)}`)
      .then(r => {
        if (cancelled) return
        setPersons(r.data)
        // Auto-select if exactly one person
        if (r.data.length === 1 && !person) {
          onChange({ block, room_no, person: r.data[0] })
        }
      })
      .catch(() => { if (!cancelled) setPersons([]) })
      .finally(() => { if (!cancelled) setLoadingPersons(false) })
    return () => { cancelled = true }
  }, [block, room_no])  // eslint-disable-line react-hooks/exhaustive-deps

  const blockGroups = [
    { label: 'M', keys: BLOCKS_BY_TYPE.M },
    { label: 'S', keys: BLOCKS_BY_TYPE.S },
    { label: 'Y', keys: BLOCKS_BY_TYPE.Y },
    { label: 'FAZ 2', keys: BLOCKS_BY_TYPE.F2 },
  ]

  const rooms = block ? allRoomNos(block) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ⚡ Hızlı oda — "M1 205" yaz + Enter, blok+oda tek adımda */}
      <div>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>⚡ HIZLI ODA</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={quickRoom}
            onChange={e => setQuickRoom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyQuickRoom() } }}
            placeholder="M1 205 yaz + Enter"
            autoFocus
            style={{
              flex: 1, boxSizing: 'border-box',
              background: '#1e293b',
              border: `1px solid ${quickRoom.trim() ? (quickParsed ? '#16a34a' : '#b45309') : '#334155'}`,
              borderRadius: 10, padding: '10px 12px',
              color: '#f1f5f9', fontSize: 14, outline: 'none',
            }}
          />
          <button type="button" onClick={applyQuickRoom} disabled={!quickParsed}
            style={{
              padding: '10px 14px', borderRadius: 10, border: 'none',
              background: quickParsed ? '#16a34a' : '#1e293b',
              color: quickParsed ? '#fff' : '#475569',
              fontWeight: 700, fontSize: 14, cursor: quickParsed ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}>
            {quickParsed ? `→ ${quickParsed.block}-${quickParsed.room_no}` : 'Seç'}
          </button>
        </div>
        {quickRoom.trim() && !quickParsed && (
          <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>Oda bulunamadı — blok + oda no yazın (ör. M1 205, A 12)</div>
        )}
      </div>

      {/* Block chips */}
      <div>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>BLOK</div>
        {blockGroups.map(g => (
          <div key={g.label} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.keys.map(k => (
                <button key={k} type="button" onClick={() => {
                  setManualRoom('')
                  onChange({ block: k, room_no: null, person: null })
                }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: block === k ? '#1d4ed8' : '#1e293b',
                    color: block === k ? '#fff' : '#94a3b8',
                    fontWeight: 700, fontSize: 13,
                  }}>
                  {blockDisplayName(k)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Faz 2'de oda numaraları sahada düzensizdir; 80 düğme yerine doğrudan yazılır. */}
      {block && manualConfig?.manualRoomEntry && (
        <div style={{
          padding: 12, borderRadius: 12, background: 'rgba(249,115,22,.08)',
          border: '1px solid rgba(249,115,22,.3)',
        }}>
          <div style={{ fontSize: 11, color: '#fdba74', letterSpacing: 1, marginBottom: 7 }}>
            {blockDisplayName(block).toUpperCase()} · ODA NUMARASINI YAZIN
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={manualConfig.perFloor}
              value={manualRoom}
              onChange={event => setManualRoom(event.target.value.replace(/\D/g, '').slice(0, 2))}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); applyManualRoom() }
              }}
              placeholder="1-80"
              aria-label={`${blockDisplayName(block)} oda numarası`}
              style={{
                flex: 1, minWidth: 0, borderRadius: 10, border: `1px solid ${manualRoom ? (manualRoomValid ? '#16a34a' : '#dc2626') : '#475569'}`,
                background: '#111827', color: '#f8fafc', padding: '12px 14px', fontSize: 18, fontWeight: 800,
              }}
            />
            <button type="button" onClick={applyManualRoom} disabled={!manualRoomValid}
              style={{
                border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800,
                background: manualRoomValid ? '#ea580c' : '#1e293b',
                color: manualRoomValid ? '#fff' : '#64748b', cursor: manualRoomValid ? 'pointer' : 'default',
              }}>
              Odayı seç
            </button>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 7 }}>
            Oda numarası 1 ile 80 arasında olabilir; bütün odaları tek tek göstermek yerine numarayı doğrudan yazın.
            {room_no && <strong style={{ color: '#fdba74' }}> · Seçili oda: {room_no}</strong>}
          </div>
        </div>
      )}

      {/* Room grid */}
      {block && !manualConfig?.manualRoomEntry && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>
            ODA {activeBagRooms.size > 0 && (
              <span style={{ color: '#f87171', fontSize: 10 }}>· 🔴 {activeBagRooms.size} aktif</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {rooms.map(no => {
              const isActive = activeBagRooms.has(String(no))
              const isSelected = room_no === String(no)
              return (
                <button key={no} type="button" onClick={() => onChange({ block, room_no: String(no), person: null })}
                  style={{
                    padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: isSelected ? '#1d4ed8' : '#1e293b',
                    color: isSelected ? '#fff' : '#cbd5e1',
                    fontWeight: 600, fontSize: 13,
                    position: 'relative',
                  }}>
                  {no}
                  {isActive && !isSelected && (
                    <span style={{
                      position: 'absolute', top: 2, right: 4,
                      width: 6, height: 6, borderRadius: '50%', background: '#f87171',
                    }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Persons */}
      {block && room_no && (
        <div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>KİŞİ</div>
          {loadingPersons && <div style={{ color: '#475569', fontSize: 12 }}>Yükleniyor…</div>}
          {!loadingPersons && persons.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, marginBottom: 6 }}>Bu odada kayıtlı kişi yok</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" onClick={() => onChange({ block, room_no, person: null })}
              style={{
                padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: person === null ? '#334155' : '#1e293b',
                color: person === null ? '#e2e8f0' : '#64748b',
                fontWeight: 600, fontSize: 13, textAlign: 'left',
              }}>
              Kişisiz
            </button>
            {persons.map(p => (
              <button key={p.id} type="button" onClick={() => onChange({ block, room_no, person: p })}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: person?.id === p.id ? '#1d4ed8' : '#1e293b',
                  color: person?.id === p.id ? '#fff' : '#94a3b8',
                  fontWeight: 600, fontSize: 13, textAlign: 'left',
                }}>
                {p.full_name}{p.company ? ` · ${p.company}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
