import * as q from './queries.js'
import { humanize } from './units.js'
import { createNotification } from '../../shared/notifications/service.js'

export const WATER_OPERATION_ROLES = Object.freeze(['campus_manager', 'shift_supervisor'])

export function notifyWaterOperations({ dedup_key, ...notification }) {
  return WATER_OPERATION_ROLES.map((role, index) => createNotification({
    ...notification,
    target_role: role,
    dedup_key: dedup_key && index > 0 ? `${dedup_key}_${role}` : dedup_key,
  })).filter(Boolean)
}

export function checkLowStock(productIds) {
  const uniqueIds = [...new Set((Array.isArray(productIds) ? productIds : [productIds])
    .filter(Boolean)
    .map(Number))]

  for (const productId of uniqueIds) {
    const product = q.getProduct(productId)
    if (!product || !product.min_level || product.min_level <= 0) continue
    const balance = q.getProductBalance(productId)
    if (balance >= product.min_level) continue

    notifyWaterOperations({
      message: `Su stoğu düşük: ${product.name} — kalan ${humanize(product, balance)} (eşik ${humanize(product, product.min_level)})`,
      severity: 'warning',
      module: 'water',
      dedup_key: `water_low_${productId}`,
    })
  }
}
