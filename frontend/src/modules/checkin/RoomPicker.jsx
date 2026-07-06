// Koridor düzeninde boş/dolu/önerilen odaları gösteren oda seçici.
// Check-in oda atama adımında kullanılır; opsiyonel "hızlı ekle" tetikler.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, getCapacity } from '../../shared/blocks.js'

export default function RoomPicker({ onSelect, selectedRoom, suggestedRoom, onQuickFill }) {
  const initialBlock = suggestedRoom?.block || 'M1'
  const initialType = BLOCK_BY_NAME[initialBlock]?.type ?? 'M'
  const [blockType, setBlockType] = useState(initialType)
  const [block, setBlock] = useState(initialBlock)
  const [floor, setFloor] = useState(suggestedRoom?.floor || 1)

  const { data: rooms = [] } = useQuery({
    queryKey: ['available-rooms', block],
    queryFn: () => api.get(`/checkin/available-rooms?block=${block}`).then(r => r.data),
  })

  const cfg = BLOCK_BY_NAME[block]
  const floorRooms = rooms.filter(r => r.floor === floor)
  const isM = cfg?.type === 'M'
  const isS2Floor2 = block === 'S2' && floor === 2
  const isPlaceholder = cfg?.isPlaceholder
  const defaultCap = getCapacity(block, floor)

  const oddRooms = floorRooms.filter(r => Number(r.room_no) % 2 !== 0)
  const evenRooms = floorRooms.filter(r => Number(r.room_no) % 2 === 0)

  return (
    <div>
      {/* Block type tab + block + floor selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: '7px',
          padding: '2px', border: '1px solid var(--border)',
        }}>
          {['M', 'S', 'Y'].map(t => (
            <button key={t}
              onClick={() => {
                setBlockType(t)
                const first = BLOCKS_BY_TYPE[t][0]
                setBlock(first)
                setFloor(1)
              }}
              style={{
                padding: '5px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--display)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
                background: blockType === t ? 'var(--accent)' : 'transparent',
                color: blockType === t ? '#000' : 'var(--text2)',
              }}>{t}</button>
          ))}
        </div>
        {BLOCKS_BY_TYPE[blockType].map(b => (
          <button key={b} onClick={() => { setBlock(b); setFloor(1) }}
            className={`filter-chip${block === b ? ' active' : ''}`}
            style={{ fontFamily: 'var(--display)', fontSize: '12px', letterSpacing: '1px', padding: '5px 12px' }}>
            {b}
          </button>
        ))}
        {(() => {
          const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
          if (floorList.length <= 1) return null
          return (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
              {floorList.map(f => (
                <button key={f} onClick={() => setFloor(f)}
                  className={`filter-chip${floor === f ? ' active' : ''}`}
                  style={{ padding: '5px 10px', fontSize: '11px' }}>KAT {f}</button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Block info */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '8px' }}>
        {block} BLOK · KAT {floor} · {isM ? 'ORTAK BANYO' : 'ÖZEL BANYO'}
        {isS2Floor2 ? ' · 4 KİŞİLİK' : ` · ${defaultCap} KİŞİLİK`}
        {isPlaceholder ? ' · ⚠ KAPASİTE PLACEHOLDER' : ''}
        {' · '}{floorRooms.filter(r => r.current_count < r.active_beds).length} BOŞ ODA
      </div>

      {/* Room grid - corridor layout */}
      <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
        <div style={{ minWidth: 'max-content' }}>
          {/* SOL — odd */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
            <div style={{ width: '32px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', textAlign: 'center', lineHeight: 1.4, alignSelf: 'center' }}>SOL<br/>TEK</div>
            {oddRooms.map(r => {
              const full = r.current_count >= r.active_beds
              const sel = selectedRoom?.room_id === r.room_id
              const isSuggested = suggestedRoom?.room_id === r.room_id
              return (
                <div key={r.room_id} onClick={() => !full && onSelect(r)}
                  title={`${r.room_no} — ${r.current_count}/${r.active_beds}`}
                  style={{
                    width: '48px', height: '52px', borderRadius: '5px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                    cursor: full ? 'not-allowed' : 'pointer',
                    background: sel ? 'rgba(240,165,0,.2)' : full ? 'rgba(231,76,60,.1)' : isSuggested ? 'rgba(59,140,240,.12)' : r.current_count > 0 ? 'rgba(240,165,0,.06)' : 'rgba(39,201,106,.06)',
                    border: `${sel ? '2px' : '1px'} solid ${sel ? 'var(--accent)' : full ? 'rgba(231,76,60,.3)' : isSuggested ? 'rgba(59,140,240,.5)' : r.current_count > 0 ? 'rgba(240,165,0,.2)' : 'rgba(39,201,106,.2)'}`,
                    opacity: full ? 0.5 : 1, transition: 'all .12s',
                  }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: sel ? 'var(--accent)' : full ? 'var(--red)' : isSuggested ? 'var(--blue)' : 'var(--text)' }}>{r.room_no}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: full ? 'var(--red)' : 'var(--text3)' }}>{r.current_count}/{r.active_beds}</div>
                  {isSuggested && !sel && <div style={{ fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--blue)', letterSpacing: '0.5px' }}>ÖNERİ</div>}
                </div>
              )
            })}
          </div>
          {/* Corridor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '16px', margin: '2px 0' }}>
            <div style={{ width: '32px', flexShrink: 0 }} />
            <div style={{ flex: 1, height: '100%', background: 'linear-gradient(90deg,rgba(0,0,0,.25),rgba(35,45,63,.4),rgba(0,0,0,.25))', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '6px', color: 'var(--text4)', letterSpacing: '4px' }}>KORİDOR</span>
            </div>
          </div>
          {/* SAĞ — even */}
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '32px', flexShrink: 0, fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)', textAlign: 'center', lineHeight: 1.4, alignSelf: 'center' }}>SAĞ<br/>ÇİFT</div>
            {evenRooms.map(r => {
              const full = r.current_count >= r.active_beds
              const sel = selectedRoom?.room_id === r.room_id
              const isSuggested = suggestedRoom?.room_id === r.room_id
              return (
                <div key={r.room_id} onClick={() => !full && onSelect(r)}
                  title={`${r.room_no} — ${r.current_count}/${r.active_beds}`}
                  style={{
                    width: '48px', height: '52px', borderRadius: '5px', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                    cursor: full ? 'not-allowed' : 'pointer',
                    background: sel ? 'rgba(240,165,0,.2)' : full ? 'rgba(231,76,60,.1)' : isSuggested ? 'rgba(59,140,240,.12)' : r.current_count > 0 ? 'rgba(240,165,0,.06)' : 'rgba(39,201,106,.06)',
                    border: `${sel ? '2px' : '1px'} solid ${sel ? 'var(--accent)' : full ? 'rgba(231,76,60,.3)' : isSuggested ? 'rgba(59,140,240,.5)' : r.current_count > 0 ? 'rgba(240,165,0,.2)' : 'rgba(39,201,106,.2)'}`,
                    opacity: full ? 0.5 : 1, transition: 'all .12s',
                  }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: sel ? 'var(--accent)' : full ? 'var(--red)' : isSuggested ? 'var(--blue)' : 'var(--text)' }}>{r.room_no}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: full ? 'var(--red)' : 'var(--text3)' }}>{r.current_count}/{r.active_beds}</div>
                  {isSuggested && !sel && <div style={{ fontFamily: 'var(--mono)', fontSize: '5px', color: 'var(--blue)', letterSpacing: '0.5px' }}>ÖNERİ</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {onQuickFill && selectedRoom && (
        <button
          onClick={e => { e.stopPropagation(); onQuickFill(selectedRoom) }}
          style={{
            marginTop: '8px', padding: '6px 12px', borderRadius: '6px', border: 'none',
            background: 'rgba(59,130,246,.15)', color: '#60a5fa', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
          }}>
          ⚡ HIZLI EKLE — {selectedRoom.block} {selectedRoom.room_no}
        </button>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
        {[
          ['rgba(39,201,106,.2)', 'BOŞ'],
          ['rgba(240,165,0,.25)', 'KISMİ DOLU'],
          ['rgba(231,76,60,.3)', 'DOLU'],
          ['rgba(59,140,240,.5)', 'ÖNERİLEN'],
          ['var(--accent)', 'SEÇİLİ'],
        ].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', border: `2px solid ${c}` }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
