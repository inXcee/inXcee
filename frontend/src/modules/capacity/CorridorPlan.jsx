// Bir blok-kat için koridor düzeni planı (SOL/SAĞ oda sıraları + M bloklarda ortak WC/banyo).
import {
  BLOCK_BY_NAME,
  expectedRoomNos as expectedRoomNosFromConfig,
  getCapacity as getCapacityFromConfig,
} from '../../shared/blocks.js'
import { RoomCell, GhostCell, FacilityCell } from './shared.jsx'

export default function CorridorPlan({ block, floor, rooms, selectedRoom, onSelect, onDropPersonnel, dragOverRoomId, onDragOverRoom }) {
  const cfg = BLOCK_BY_NAME[block]
  const isM = cfg?.type === 'M'
  const isS2Floor2 = block === 'S2' && floor === 2
  const defaultCap = getCapacityFromConfig(block, floor)

  const floorRooms = rooms.filter(r => r.floor === floor)
  const byNo = Object.fromEntries(floorRooms.map(r => [r.room_no, r]))

  const allNos = expectedRoomNosFromConfig(block, floor)
  const oddNos  = allNos.filter(n => n % 2 !== 0)   // SOL — odd
  const evenNos = allNos.filter(n => n % 2 === 0)   // SAĞ — even

  const totalCap = floorRooms.reduce((s, r) => s + (r.active_beds || r.capacity || defaultCap), 0)
  const totalOcc = floorRooms.reduce((s, r) => s + (r.occupied || 0), 0)
  const pct = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0
  const progCls = pct >= 90 ? 'prog-red' : pct >= 70 ? 'prog-amber' : 'prog-green'

  const rowH = 68

  return (
    <div>
      {/* S2 Floor 2 warning */}
      {isS2Floor2 && (
        <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
          <span>⚠</span>
          <span>
            <strong>S2 KAT 2 İSTİSNA:</strong> Odalar 4 kişilik · Her odada özel banyo
          </span>
        </div>
      )}

      {/* Y blok placeholder warning */}
      {cfg?.isPlaceholder && (
        <div className="alert alert-warn" style={{ marginBottom: '12px' }}>
          <span>⚠</span>
          <span>
            <strong>PLACEHOLDER:</strong> Bu bloğun kapasitesi henüz girilmedi (1 kişilik). Doğru yatak sayılarını oda detayından düzenleyin.
          </span>
        </div>
      )}

      {/* Floor stats */}
      {floorRooms.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100px, 100%), 1fr))', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: 'TOPLAM YATAK', value: totalCap, color: 'var(--text)' },
              { label: 'DOLU YATAK',   value: totalOcc, color: 'var(--accent)' },
              { label: 'BOŞ YATAK',    value: totalCap - totalOcc, color: 'var(--green)' },
              { label: 'DOLULUK',      value: `%${pct}`, color: pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--accent)' : 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '3px' }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="prog-bar" style={{ marginBottom: '14px' }}>
            <div className={`prog-fill ${progCls}`} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[['r-empty','BOŞ'],['r-partial','KISMİ'],['r-full','DOLU'],['r-maint','BAKIM']].map(([cls,lbl]) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className={`r-cell ${cls}`} style={{ width: '14px', height: '14px', aspectRatio: 'unset', fontSize: 0, flexShrink: 0, borderRadius: '3px' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{lbl}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
          {isM ? 'ORTAK WC/BANYO' : 'HER ODADA ÖZEL BANYO'}
        </div>
      </div>

      {/* ── Corridor layout ── */}
      <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
        <div style={{ minWidth: 'max-content', userSelect: 'none' }}>

          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px', paddingLeft: isM ? '58px' : '58px' }}>
            GİRİŞ →
          </div>

          {/* SOL (odd) row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
            <div style={{
              width: '50px', flexShrink: 0, textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', lineHeight: 1.5,
            }}>
              SOL<br/>TEK
            </div>
            {isM && <FacilityCell type="BANYO" height={rowH} />}
            <div style={{ display: 'flex', gap: '3px' }}>
              {oddNos.map(no => {
                const key = String(no)
                const room = byNo[key]
                return room
                  ? <RoomCell key={no} room={room} selected={selectedRoom?.id === room.id} onClick={onSelect} defaultCap={defaultCap} onDropPersonnel={onDropPersonnel} dragOverRoomId={dragOverRoomId} onDragOverRoom={onDragOverRoom} />
                  : <GhostCell key={no} roomNo={no} />
              })}
            </div>
            {isM && <FacilityCell type="WC" height={rowH} />}
          </div>

          {/* CORRIDOR strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '28px', margin: '3px 0' }}>
            <div style={{ width: '50px', flexShrink: 0 }} />
            {isM && (
              <div style={{ width: '38px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.15)', border: '1px solid rgba(26,188,156,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.15)', border: '1px solid rgba(59,140,240,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
              </div>
            )}
            <div style={{
              flex: 1, height: '100%',
              background: 'linear-gradient(90deg, rgba(0,0,0,.3), rgba(35,45,63,.4), rgba(0,0,0,.3))',
              borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '6px' }}>KORİDOR</span>
            </div>
            {isM && (
              <div style={{ width: '38px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.15)', border: '1px solid rgba(59,140,240,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.15)', border: '1px solid rgba(26,188,156,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
              </div>
            )}
          </div>

          {/* SAĞ (even) row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
            <div style={{
              width: '50px', flexShrink: 0, textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1px', lineHeight: 1.5,
            }}>
              SAĞ<br/>ÇİFT
            </div>
            {isM && <FacilityCell type="WC" height={rowH} />}
            <div style={{ display: 'flex', gap: '3px' }}>
              {evenNos.map(no => {
                const key = String(no)
                const room = byNo[key]
                return room
                  ? <RoomCell key={no} room={room} selected={selectedRoom?.id === room.id} onClick={onSelect} defaultCap={defaultCap} onDropPersonnel={onDropPersonnel} dragOverRoomId={dragOverRoomId} onDragOverRoom={onDragOverRoom} />
                  : <GhostCell key={no} roomNo={no} />
              })}
            </div>
            {isM && <FacilityCell type="BANYO" height={rowH} />}
          </div>

          {/* Footer info */}
          <div style={{
            marginTop: '10px', paddingLeft: '54px',
            fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px',
            display: 'flex', gap: '20px',
          }}>
            <span>{block} BLOK — KAT {floor}</span>
            <span>{allNos.length} ODA</span>
            <span>{isM ? 'ORTAK BANYO/WC' : 'HER ODADA ÖZEL BANYO'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
