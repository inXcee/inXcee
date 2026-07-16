import * as q from './queries.js'
import { humanize } from './units.js'
import { normalizeIntakeLot } from './lot-fields.js'
import { reconcileProductAllocations } from './movements.js'
import { isIsoDate } from '../../shared/validation/date.js'

const LOT_STATUSES = new Set(['active', 'quarantined'])
const LOT_FILTERS = new Set(['all', 'critical', 'expired', 'expiring', 'quarantined', 'missing', 'healthy'])

const errorWithStatus = (message, statusCode) => Object.assign(new Error(message), { statusCode })

function signedDaysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime()
  const to = new Date(`${toIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / 86400000)
}

function lotHealth(row, today) {
  const daysToExpiry = row.expiry_date ? signedDaysBetween(today, row.expiry_date) : null
  let health = 'healthy'
  if (row.lot_status === 'quarantined') health = 'quarantined'
  else if (row.expiry_tracking && !row.expiry_date) health = 'missing'
  else if (daysToExpiry != null && daysToExpiry < 0) health = 'expired'
  else if (daysToExpiry != null && daysToExpiry <= Number(row.expiry_warning_days || 0)) health = 'expiring'
  return { health, days_to_expiry: daysToExpiry }
}

function serializeLot(row, today) {
  const status = lotHealth(row, today)
  return {
    ...row,
    ...status,
    remaining_human: humanize(row, row.remaining_base),
    allocated_human: humanize(row, row.allocated_base),
    received_human: humanize(row, row.qty_base),
  }
}

export function intakeLotsService({ today, status = 'all', product_id } = {}) {
  const day = isIsoDate(today) ? today : new Date().toLocaleDateString('sv-SE')
  const normalizedStatus = LOT_FILTERS.has(status) ? status : 'all'
  const allRows = q.listIntakeLots({ product_id }).map(row => serializeLot(row, day))
  const rows = normalizedStatus === 'all'
    ? allRows
    : normalizedStatus === 'critical'
      ? allRows.filter(row => row.health !== 'healthy')
      : allRows.filter(row => row.health === normalizedStatus)

  const summary = {
    all: allRows.length,
    expired: 0,
    expiring: 0,
    quarantined: 0,
    missing: 0,
    healthy: 0,
    blocked_base: 0,
    expiring_base: 0,
  }
  for (const row of allRows) {
    summary[row.health] += 1
    if (['expired', 'quarantined', 'missing'].includes(row.health)) summary.blocked_base += row.remaining_base
    if (row.health === 'expiring') summary.expiring_base += row.remaining_base
  }
  summary.critical = summary.expired + summary.expiring + summary.quarantined + summary.missing

  return { date: day, status: normalizedStatus, summary, rows }
}

export function updateIntakeLotService(id, data, userId) {
  const existing = q.getIntakeLot(id)
  if (!existing) throw errorWithStatus('Giriş lotu bulunamadı', 404)

  const has = key => Object.prototype.hasOwnProperty.call(data || {}, key)
  const lotStatus = data?.lot_status || existing.lot_status || 'active'
  if (!LOT_STATUSES.has(lotStatus)) throw errorWithStatus('Geçersiz lot durumu', 400)
  const statusChanged = lotStatus !== existing.lot_status
  if (existing.remaining_base <= 0 && !(statusChanged && lotStatus === 'quarantined')) {
    throw errorWithStatus('Tamamı dağıtılmış lot düzenlenemez', 409)
  }
  const metadata = normalizeIntakeLot({
    lot_no: has('lot_no') ? data.lot_no : existing.lot_no,
    production_date: has('production_date') ? data.production_date : existing.production_date,
    expiry_date: has('expiry_date') ? data.expiry_date : existing.expiry_date,
  }, existing, existing.move_date)
  const rawStatusNote = has('lot_status_note') ? data.lot_status_note : existing.lot_status_note
  const statusNote = rawStatusNote == null ? '' : String(rawStatusNote).trim()
  if (statusNote.length > 500) throw errorWithStatus('Lot durum açıklaması en fazla 500 karakter olabilir', 400)
  if (lotStatus === 'quarantined' && !statusNote) throw errorWithStatus('Karantina gerekçesi zorunlu', 400)

  const result = q.runInTransaction(() => {
    const releasedAllocations = statusChanged && lotStatus === 'quarantined'
      ? q.releaseIntakeAllocations(id)
      : []
    if (!q.updateIntakeLot(id, {
      ...metadata,
      lot_status: lotStatus,
      lot_status_note: statusNote || null,
      lot_status_updated_by: userId || null,
    })) throw errorWithStatus('Lot güncellenemedi', 500)
    const affectedDistributionIds = [...new Set(releasedAllocations.map(row => Number(row.out_movement_id)))]
    const matched = (lotStatus === 'active' || affectedDistributionIds.length)
      ? reconcileProductAllocations(existing.product_id)
      : 0
    if (affectedDistributionIds.length) q.flagReviewForUnallocated(affectedDistributionIds)
    return {
      after: q.getIntakeLot(id),
      matched,
      affected_distribution_ids: affectedDistributionIds,
      released_base: releasedAllocations.reduce((sum, row) => sum + Number(row.qty_base || 0), 0),
    }
  })

  return { before: existing, ...result }
}
