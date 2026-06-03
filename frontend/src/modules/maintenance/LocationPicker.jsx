// Blok tipi → blok → kat → oda zinciriyle "X Kat N Oda M" konum metni üreten input.
// Yeni arıza formunda kullanılır.
import { useState } from 'react'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, expectedRoomNos as expectedRoomNosFromConfig } from '../../shared/blocks.js'
import { BLOCK_TYPES } from './shared.jsx'

export default function LocationPicker({ value, onChange }) {
  // Match herhangi bir blok adi (M1-M3, S1-S3, A, A1-A4, B, C, D, E, F, G, H, J)
  const match = value.match(/^([A-Z][0-9]?)\s+Kat\s*(\d)\s+Oda\s*(\d+)$/i)
  const initialBlock = match ? match[1].toUpperCase() : null
  const initialType = initialBlock ? (BLOCK_BY_NAME[initialBlock]?.type ?? 'M') : 'M'
  const [pickedType, setPickedType] = useState(initialType)
  const [pickedBlock, setPickedBlock] = useState(initialBlock)
  const [pickedFloor, setPickedFloor] = useState(match ? +match[2] : null)

  const pickType = t => { setPickedType(t); setPickedBlock(null); setPickedFloor(null); onChange('') }
  const pickBlock = b => { setPickedBlock(b); setPickedFloor(null); onChange('') }
  const pickFloor = f => { setPickedFloor(f); onChange('') }
  const pickRoom = rno => onChange(`${pickedBlock} Kat ${pickedFloor} Oda ${rno}`)

  const cfg = pickedBlock ? BLOCK_BY_NAME[pickedBlock] : null
  const floorList = cfg ? Array.from({ length: cfg.floors }, (_, i) => i + 1) : []
  const roomNos = pickedBlock && pickedFloor
    ? expectedRoomNosFromConfig(pickedBlock, pickedFloor).map(n => String(n))
    : []
  const selRoom = match ? match[3] : null

  return (
    <div>
      <label className="form-label">Konum</label>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
        {BLOCK_TYPES.map(t => (
          <button key={t} type="button" onClick={() => pickType(t)} style={{
            padding: '5px 14px', borderRadius: '5px', cursor: 'pointer',
            border: pickedType === t ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: pickedType === t ? 'rgba(99,102,241,.12)' : 'transparent',
            color: pickedType === t ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--display)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px',
          }}>{t} BLOK</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {BLOCKS_BY_TYPE[pickedType].map(b => (
          <button key={b} type="button" onClick={() => pickBlock(b)} style={{
            padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
            border: pickedBlock === b ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: pickedBlock === b ? 'rgba(99,102,241,.12)' : 'transparent',
            color: pickedBlock === b ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--display)', fontSize: '13px', fontWeight: 600, letterSpacing: '1px',
          }}>{b}</button>
        ))}
      </div>
      {pickedBlock && floorList.length > 0 && (
        <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
          {floorList.map(f => (
            <button key={f} type="button" onClick={() => pickFloor(f)} style={{
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer',
              border: pickedFloor === f ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: pickedFloor === f ? 'rgba(99,102,241,.12)' : 'transparent',
              color: pickedFloor === f ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>KAT {f}</button>
          ))}
        </div>
      )}
      {pickedBlock && pickedFloor && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '10px',
          background: 'rgba(15,23,42,.3)', borderRadius: '8px', border: '1px solid var(--border)',
          maxHeight: '180px', overflowY: 'auto',
        }}>
          {roomNos.map(rno => (
            <button key={rno} type="button" onClick={() => pickRoom(rno)} style={{
              width: '48px', height: '34px', borderRadius: '5px', cursor: 'pointer',
              border: selRoom === rno ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: selRoom === rno ? 'rgba(99,102,241,.15)' : 'transparent',
              color: selRoom === rno ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600,
            }}>{rno}</button>
          ))}
        </div>
      )}
      {value && (
        <div style={{
          marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)',
          fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{value}</span>
          <button type="button" onClick={() => { onChange(''); setPickedBlock(null); setPickedFloor(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '12px' }}>✕</button>
        </div>
      )}
    </div>
  )
}
