// Bir blok+kat için koridor görünümü: tek/çift oda sıraları, M bloklarda ortak
// WC/banyo hücreleri, kat istatistik şeridi, DND uyarısı ve oda kutucukları.
import { BLOCK_BY_NAME, expectedRoomNos as expectedRoomNosFromConfig } from '../../shared/blocks.js'
import { roomNoFromQr, GhostTile, FacilityCell } from './shared.jsx'
import RoomTile from './RoomTile.jsx'

export default function BlockFloorView({ block, floor, tasks, dndRooms, blockRooms, selectedRoomNo, onSelect }) {
  const isM  = BLOCK_BY_NAME[block]?.type === 'M'
  const isS2Floor2 = block === 'S2' && floor === 2

  const roomTaskMap = {}
  tasks
    .filter(t => t.block === block && t.floor === floor && t.task_type === 'room')
    .forEach(t => {
      const rno = roomNoFromQr(t.qr_location)
      if (rno) roomTaskMap[rno] = t
    })

  const roomInfoMap = {}
  blockRooms.filter(r => r.floor === floor).forEach(r => { roomInfoMap[r.room_no] = r })

  const floorDnd = dndRooms.filter(r => r.block === block && r.floor === floor)
  const dndSet = new Set(floorDnd.filter(r => r.occupied_count > 0).map(r => r.room_no))
  const dndMap = {}
  floorDnd.forEach(r => { dndMap[r.room_no] = r })

  const allRoomNos  = expectedRoomNosFromConfig(block, floor).map(n => String(n))
  const roomTasks   = Object.values(roomTaskMap)
  const doneTasks   = roomTasks.filter(t => t.completed_at)
  const skippedTasks = roomTasks.filter(t => t.skipped)
  const pct         = roomTasks.length > 0 ? Math.round((doneTasks.length / roomTasks.length) * 100) : 0

  const oddNos  = allRoomNos.filter(n => Number(n) % 2 !== 0)
  const evenNos = allRoomNos.filter(n => Number(n) % 2 === 0)

  const legend = [
    { stripe: 'var(--green)',   label: 'TEMİZLENDİ' },
    { stripe: 'var(--blue)',    label: 'BEKLİYOR' },
    { stripe: 'var(--accent)',  label: 'DND' },
    { stripe: 'var(--border2)', label: 'ATLANDI' },
    { stripe: 'transparent',    label: 'GÖREV YOK' },
    { stripe: 'var(--red)',      label: 'ARIZA VAR', isFault: true },
  ]

  return (
    <div>
      {/* Stats + legend */}
      {roomTasks.length > 0 && (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
          {legend.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {l.isFault ? (
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#fff', fontWeight: 700 }}>!</div>
              ) : (
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', borderTop: `3px solid ${l.stripe}`, background: 'var(--surface2)', border: '1px solid var(--border)', borderTopColor: l.stripe }} />
              )}
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--text3)' }}>{l.label}</span>
            </div>
          ))}
          {!isM && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>🚿</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '8.5px', color: 'var(--teal)' }}>ÖZEL BANYO + TUVALET</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
            {doneTasks.length}/{roomTasks.length}
            {skippedTasks.length > 0 && ` · ${skippedTasks.length} atlandı`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '80px', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct===100 ? 'var(--green)' : 'var(--accent)', transition: 'width .5s' }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: pct===100 ? 'var(--green)' : 'var(--accent)' }}>%{pct}</span>
          </div>
        </div>
      )}

      {dndSet.size > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: '10px' }}>
          <span>🚫</span>
          <div>
            <strong>{dndSet.size} oda DND</strong>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px' }}>
              ☾ Gece vardiyası uyuyor: {floorDnd.map(r => r.room_no).sort().join(', ')}
            </div>
            {floorDnd.some(r => r.occupied_count === 0) && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '2px', color: 'var(--green)' }}>
                ✓ Boş odalar (temizlenebilir): {floorDnd.filter(r => r.occupied_count === 0).map(r => r.room_no).sort().join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {roomTasks.length === 0 ? (
        <div className="empty-state" style={{ padding: '20px 0' }}>
          <div className="empty-icon" style={{ fontSize: '28px' }}>◈</div>
          <div className="empty-sub">Görev yok — "Görev Oluştur" butonuna basın</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
          <div style={{ minWidth: 'max-content', userSelect: 'none' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '52px' }}>GİRİŞ →</div>
            {/* SOL — odd */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <div style={{ width: '44px', flexShrink: 0, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', lineHeight: 1.6 }}>SOL<br/>TEK</div>
              {isM && <FacilityCell type="BANYO" />}
              <div style={{ display: 'flex', gap: '3px' }}>
                {oddNos.map(n => {
                  const hasRoom = !!roomInfoMap[n]
                  const hasTask = !!roomTaskMap[n]
                  if (!hasRoom && !hasTask) return <GhostTile key={n} rno={n} />
                  return (
                    <RoomTile key={n} rno={n} task={roomTaskMap[n]} roomInfo={roomInfoMap[n]}
                      isDnd={dndSet.has(n)} dndInfo={dndMap[n]} isM={isM} isS2Floor2={isS2Floor2}
                      selected={selectedRoomNo === n} onSelect={onSelect}
                      faultCount={roomInfoMap[n]?.open_fault_count || 0} />
                  )
                })}
              </div>
              {isM && <FacilityCell type="WC" />}
            </div>
            {/* Corridor */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '24px', margin: '4px 0' }}>
              <div style={{ width: '44px', flexShrink: 0 }} />
              {isM && (
                <div style={{ width: '34px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.12)', border: '1px solid rgba(26,188,156,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.12)', border: '1px solid rgba(59,140,240,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                </div>
              )}
              <div style={{ flex: 1, height: '100%', background: 'linear-gradient(90deg,rgba(0,0,0,.25),rgba(35,45,63,.4),rgba(0,0,0,.25))', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '6px' }}>KORİDOR</span>
              </div>
              {isM && (
                <div style={{ width: '34px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(59,140,240,.12)', border: '1px solid rgba(59,140,240,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--blue)' }}>WC</div>
                  <div style={{ flex: 1, borderRadius: '2px', background: 'rgba(26,188,156,.12)', border: '1px solid rgba(26,188,156,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: '5.5px', color: 'var(--teal)' }}>BANYO</div>
                </div>
              )}
            </div>
            {/* SAĞ — even */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              <div style={{ width: '44px', flexShrink: 0, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', lineHeight: 1.6 }}>SAĞ<br/>ÇİFT</div>
              {isM && <FacilityCell type="WC" />}
              <div style={{ display: 'flex', gap: '3px' }}>
                {evenNos.map(n => {
                  const hasRoom = !!roomInfoMap[n]
                  const hasTask = !!roomTaskMap[n]
                  if (!hasRoom && !hasTask) return <GhostTile key={n} rno={n} />
                  return (
                    <RoomTile key={n} rno={n} task={roomTaskMap[n]} roomInfo={roomInfoMap[n]}
                      isDnd={dndSet.has(n)} dndInfo={dndMap[n]} isM={isM} isS2Floor2={isS2Floor2}
                      selected={selectedRoomNo === n} onSelect={onSelect}
                      faultCount={roomInfoMap[n]?.open_fault_count || 0} />
                  )
                })}
              </div>
              {isM && <FacilityCell type="BANYO" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
