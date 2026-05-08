import { BLOCK_BY_NAME } from '../blocks.js'

// QR formatlari (backend/src/modules/housekeeping/queries.js'de uretilir):
//   - Oda:        "{BLOCK}-{ROOM_NO}"        ornek: "M1-101", "B-201", "A4-105"
//   - Ortak alan: "{BLOCK}-{FLOOR}-common"   ornek: "M1-1-common"
//
// Donen obje:
//   { valid: true, block, floor, roomNo, isCommon, label }   parse basariliysa
//   { valid: false }                                         tanimsiz/hatali

function floorFromRoomNo(blockCfg, roomNo) {
  if (!blockCfg) return null
  const entries = Object.entries(blockCfg.startNo)
    .map(([f, start]) => ({ floor: Number(f), start, end: start + blockCfg.perFloor - 1 }))
    .sort((a, b) => a.start - b.start)
  const hit = entries.find(e => roomNo >= e.start && roomNo <= e.end)
  return hit ? hit.floor : null
}

export function parseQrLocation(qr) {
  if (!qr || typeof qr !== 'string') return { valid: false }
  const parts = qr.trim().split('-')
  if (parts.length < 2) return { valid: false }

  const block = parts[0]
  const cfg = BLOCK_BY_NAME[block]
  if (!cfg) return { valid: false }

  // Ortak alan: BLOCK-FLOOR-common
  if (parts.length === 3 && parts[2].toLowerCase() === 'common') {
    const floor = Number(parts[1])
    if (!Number.isFinite(floor)) return { valid: false }
    return {
      valid: true,
      block,
      floor,
      isCommon: true,
      roomNo: null,
      label: `${block} ${floor}.Kat — Ortak Alan`,
    }
  }

  // Oda: BLOCK-ROOM_NO
  if (parts.length === 2) {
    const roomNo = Number(parts[1])
    if (!Number.isFinite(roomNo)) return { valid: false }
    const floor = floorFromRoomNo(cfg, roomNo)
    return {
      valid: true,
      block,
      floor,
      isCommon: false,
      roomNo,
      label: floor != null
        ? `${block} Kat ${floor} — Oda ${roomNo}`
        : `${block} — Oda ${roomNo}`,
    }
  }

  return { valid: false }
}
