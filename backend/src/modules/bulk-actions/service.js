import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { broadcastOccupancy } from '../../shared/notifications/service.js'
import { sendWhatsAppText } from '../../shared/notifications/whatsapp-send.js'

export function listActivePersonnelService(filters) {
  return q.listActivePersonnel(filters)
}

export function listStatsService(filters) {
  return q.listStats(filters)
}

function validateIds(ids, opts = {}) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'En az bir personel seçin', status: 400 }
  const max = opts.max || 200
  if (ids.length > max) return { error: `Tek seferde en fazla ${max} personel`, status: 400 }
  return { clean: [...new Set(ids.map(Number).filter(Number.isInteger))] }
}

export function bulkTransferService(ids, target, userId) {
  const v = validateIds(ids, { max: 100 })
  if (v.error) return v
  if (!target?.target_block && !target?.target_room_id) return { error: 'Hedef blok veya oda gerekli', status: 400 }
  try {
    const result = q.bulkTransferTx(v.clean, target, userId)
    if (result.success.length > 0) {
      logAudit(userId, 'bulk_transfer', 'room_assignments', null,
        `${result.success.length} kisi transfer (${target.target_room_id ? 'oda#' + target.target_room_id : 'blok ' + target.target_block})`)
      try { broadcastOccupancy() } catch {}
    }
    return result
  } catch (e) { return { error: e.message, status: 400 } }
}

export function bulkCheckoutService(ids, userId) {
  const v = validateIds(ids, { max: 100 })
  if (v.error) return v
  const result = q.bulkCheckoutTx(v.clean)
  if (result.success.length > 0) {
    logAudit(userId, 'bulk_checkout', 'checkout', null, `${result.success.length} kisi cikis, ${result.skipped.length} atlanan`)
    try { broadcastOccupancy() } catch {}
  }
  return result
}

export function bulkSetShiftService(ids, shiftType, userId) {
  if (!['day', 'night'].includes(shiftType)) return { error: 'shift_type day/night olmali', status: 400 }
  const v = validateIds(ids, { max: 200 })
  if (v.error) return v
  const result = q.bulkSetShiftTx(v.clean, shiftType)
  if (result.success.length > 0) {
    logAudit(userId, 'bulk_set_shift', 'shifts', null, `${result.success.length} kisi -> ${shiftType}`)
  }
  return result
}

export function bulkBlacklistService(ids, blacklisted, reason, userId) {
  const v = validateIds(ids, { max: 100 })
  if (v.error) return v
  if (blacklisted && (!reason || reason.trim().length < 3)) {
    return { error: 'Kara liste sebebi en az 3 karakter olmalı', status: 400 }
  }
  const result = q.bulkBlacklistTx(v.clean, !!blacklisted, reason || null, userId)
  if (result.success.length > 0) {
    logAudit(userId, blacklisted ? 'bulk_blacklist_add' : 'bulk_blacklist_remove', 'personnel', null,
      `${result.success.length} kisi · ${reason || ''}`)
  }
  return result
}

export function bulkDisciplineService(ids, points, reason, userId) {
  const v = validateIds(ids, { max: 100 })
  if (v.error) return v
  const p = +points
  if (!Number.isInteger(p) || p < 1 || p > 100) return { error: 'Puan 1-100 arası tam sayı olmalı', status: 400 }
  if (!reason || reason.trim().length < 3) return { error: 'Disiplin sebebi en az 3 karakter olmalı', status: 400 }
  const result = q.bulkDisciplineTx(v.clean, p, reason.trim(), userId)
  if (result.success.length > 0) {
    logAudit(userId, 'bulk_discipline', 'discipline_records', null,
      `${result.success.length} kisi · +${p} · ${reason.slice(0, 60)}`)
  }
  return result
}

export async function bulkWhatsAppService(ids, message, userId) {
  const v = validateIds(ids, { max: 100 })
  if (v.error) return v
  if (!message || message.trim().length < 3) return { error: 'Mesaj en az 3 karakter olmalı', status: 400 }
  if (message.length > 1000) return { error: 'Mesaj en fazla 1000 karakter olabilir', status: 400 }
  const people = q.getPhonesByIds(v.clean)
  const success = []
  const skipped = []
  for (const p of people) {
    if (!p.phone_number) {
      skipped.push({ id: p.id, name: p.full_name, reason: 'telefon yok' })
      continue
    }
    try {
      const r = await sendWhatsAppText(p.phone_number, `[YYS] ${message.trim()}`)
      if (r.sent) success.push({ id: p.id, name: p.full_name, phone: p.phone_number })
      else skipped.push({ id: p.id, name: p.full_name, reason: r.skipped || r.error || 'gönderilemedi' })
    } catch (e) {
      skipped.push({ id: p.id, name: p.full_name, reason: e.message })
    }
  }
  logAudit(userId, 'bulk_whatsapp', 'whatsapp_outbound_log', null,
    `${success.length} gonderildi, ${skipped.length} atlandi · ${message.slice(0, 60)}`)
  return { success, skipped }
}

export function bulkSetCompanyService(ids, companyId, userId) {
  const v = validateIds(ids, { max: 200 })
  if (v.error) return v
  try {
    const result = q.bulkSetCompanyTx(v.clean, companyId ? +companyId : null)
    if (result.success.length > 0) {
      logAudit(userId, 'bulk_set_company', 'personnel', null,
        `${result.success.length} kisi -> firma#${companyId || 'temizlendi'}`)
    }
    return result
  } catch (e) { return { error: e.message, status: 400 } }
}
