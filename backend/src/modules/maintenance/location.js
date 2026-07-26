import { BLOCK_BY_NAME } from '../../shared/blocks.js'

const KNOWN_BLOCKS = Object.keys(BLOCK_BY_NAME).sort((left, right) => right.length - left.length)

export function blockFromLegacyLocation(location) {
  const normalized = String(location || '').trim()
  if (!normalized) return null
  return KNOWN_BLOCKS.find(block => (
    normalized === block
    || normalized.startsWith(`${block} `)
    || normalized.startsWith(`${block}-`)
  )) || null
}

function roomNumberFromLocation(location, block) {
  const normalized = String(location || '').trim()
  if (!normalized || !block) return null
  const escapedBlock = block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const compactMatch = normalized.match(new RegExp(`^${escapedBlock}-(\\d+)$`, 'i'))
  if (compactMatch) return compactMatch[1]
  const suffixMatch = normalized.match(/(?:^|[\s-])(\d+)\s*$/)
  return suffixMatch?.[1] || null
}

export function resolveMaintenanceLocation(db, { location, block, roomId, room_id } = {}) {
  const requestedRoomId = roomId ?? room_id ?? null
  if (requestedRoomId != null) {
    const room = db.prepare('SELECT id, block FROM rooms WHERE id=?').get(requestedRoomId)
    if (!room) throw new Error('Oda bulunamadi')
    if (block && String(block).trim() !== room.block) throw new Error('Oda secilen blokta degil')
    return { block: room.block, roomId: room.id }
  }

  const normalizedBlock = String(block || '').trim() || blockFromLegacyLocation(location)
  if (!normalizedBlock || !BLOCK_BY_NAME[normalizedBlock]) {
    return { block: null, roomId: null }
  }

  const roomNo = roomNumberFromLocation(location, normalizedBlock)
  if (!roomNo) return { block: normalizedBlock, roomId: null }
  const room = db.prepare('SELECT id FROM rooms WHERE block=? AND room_no=?').get(normalizedBlock, roomNo)
  return { block: normalizedBlock, roomId: room?.id || null }
}

export function canonicalMaintenanceRow(db, row) {
  if (!row) return { canonical_block: null, canonical_room_id: null }
  const knownBlock = BLOCK_BY_NAME[row.block] ? row.block : null
  if (knownBlock && row.room_id) {
    return { ...row, canonical_block: row.block, canonical_room_id: row.room_id }
  }
  const resolved = resolveMaintenanceLocation(db, { ...row, block: knownBlock })
  return {
    ...row,
    canonical_block: knownBlock || resolved.block,
    canonical_room_id: row.room_id || resolved.roomId,
  }
}
