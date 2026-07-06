// CapacityPage'in paylaştığı sunum primitive'leri ve helper'lar.
// Koridor planı (CorridorPlan) ve oda detayı bu hücreleri/sınıf helper'ını kullanır.
import { BLOCK_BY_NAME } from '../../shared/blocks.js'

export function roomCls(room, defaultCap = 6) {
  if (room.status === 'maintenance') return 'r-maint'
  const occ = room.occupied || 0
  const cap = room.active_beds || room.capacity || defaultCap
  if (occ === 0) return 'r-empty'
  if (occ >= cap) return 'r-full'
  return 'r-partial'
}

// ── Room cell ────────────────────────────────────────────────────────────────
export function RoomCell({ room, selected, onClick, defaultCap, onDropPersonnel, dragOverRoomId, onDragOverRoom }) {
  const occ = room.occupied || 0
  const cap = room.active_beds || room.capacity || defaultCap
  const cls = roomCls(room, defaultCap)
  const isDND = room.is_dnd
  const shiftIcon = room.room_shift === 'night' ? '☾' : room.room_shift === 'day' ? '☀' : ''
  const isS = room.block && BLOCK_BY_NAME[room.block]?.type !== 'M'

  const isDropTarget = dragOverRoomId === room.id

  return (
    <div
      className={`r-cell ${cls} ${selected ? 'r-selected' : ''}`}
      onClick={() => onClick(room)}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverRoom?.(room.id) }}
      onDragLeave={() => onDragOverRoom?.(null)}
      onDrop={e => { e.preventDefault(); onDragOverRoom?.(null); const pid = e.dataTransfer.getData('personnel-id'); if (pid) onDropPersonnel?.(+pid, room.id) }}
      title={`Oda ${room.room_no} — ${occ}/${cap} kişi${room.room_shift ? ` · ${room.room_shift === 'night' ? 'Gece' : 'Gündüz'} vardiyası` : ''}${isDND ? ' · DND' : ''}${isS ? ' · Özel banyo' : ''}`}
      style={{
        width: '56px', height: '68px', aspectRatio: 'unset',
        flexDirection: 'column', gap: '2px', flexShrink: 0,
        borderRadius: '6px', cursor: 'pointer',
        position: 'relative',
        ...(isDND ? { boxShadow: 'inset 0 0 0 2px rgba(245,166,35,.5)' } : {}),
        ...(isDropTarget ? { boxShadow: '0 0 12px var(--accent)', border: '2px solid var(--accent)', transform: 'scale(1.08)', transition: 'all .15s' } : {}),
      }}
    >
      {isDND && (
        <div style={{
          position: 'absolute', top: '-4px', right: '-4px',
          background: 'var(--accent)', color: '#000', fontSize: '6px', fontWeight: 800,
          padding: '1px 3px', borderRadius: '3px', fontFamily: 'var(--mono)',
          letterSpacing: '0.5px', lineHeight: 1.2,
        }}>DND</div>
      )}
      {isS && (
        <div style={{
          position: 'absolute', bottom: '3px', right: '3px',
          fontSize: '9px', lineHeight: 1, opacity: 0.7,
        }} title="Özel banyo + tuvalet">🚿</div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, lineHeight: 1 }}>
        {room.room_no}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', opacity: 0.9 }}>
        {occ}/{cap}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', opacity: 0.6 }}>
        {room.status === 'maintenance' ? '⚙' : room.status === 'quarantine' ? '🔒' : occ > 0 && shiftIcon ? shiftIcon : ''}
      </div>
    </div>
  )
}

export function GhostCell({ roomNo }) {
  return (
    <div style={{
      width: '56px', height: '68px', flexShrink: 0, borderRadius: '6px',
      border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', fontWeight: 600 }}>{roomNo}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text4)' }}>—</div>
    </div>
  )
}

// Shared facility (M blocks only)
export function FacilityCell({ type, height = 34 }) {
  const isWC = type === 'WC'
  return (
    <div style={{
      height, width: '38px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '2px',
      background: isWC ? 'rgba(59,140,240,.1)' : 'rgba(26,188,156,.1)',
      border: `1px solid ${isWC ? 'rgba(59,140,240,.3)' : 'rgba(26,188,156,.3)'}`,
      borderRadius: '4px',
    }}>
      <span style={{ fontSize: '12px' }}>{isWC ? '🚽' : '🚿'}</span>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: '6px', letterSpacing: '0.3px',
        color: isWC ? 'var(--blue)' : 'var(--teal)', fontWeight: 700,
      }}>{type}</span>
    </div>
  )
}
