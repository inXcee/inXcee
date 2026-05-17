import * as queries from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { createNotification } from '../../shared/notifications/service.js'
import { EVENT_KINDS } from '../../shared/notifications/events.js'

export function listItems(category) {
  return queries.getAllItems(category)
}

export function listItemsPaginated(category, limit, offset) {
  return queries.getAllItemsPaginated(category, limit, offset)
}

export function search(query) {
  return queries.searchItems(query)
}

export function addItem(data, userId) {
  const id = queries.createItem(data)
  queries.addMovement(id, 'initial', data.quantity || 0, data.quantity || 0, 'Ilk kayit', userId)
  logAudit(userId, 'inventory_add', 'inventory', id, `${data.item_name} (${data.quantity} ${data.unit})`)
  return id
}

export function editItem(id, data, userId) {
  queries.updateItem(id, data)
  logAudit(userId, 'inventory_update', 'inventory', id, `${data.item_name}: ${data.quantity} ${data.unit}`)
}

export function removeItem(id) {
  queries.deleteItem(id)
}

export function adjustStock(id, delta, reason, userId, locationId = null) {
  const item = queries.getItemById(id)
  if (!item) return { error: 'Urun bulunamadi', status: 404 }

  const newQty = item.quantity + delta
  if (newQty < 0) return { error: 'Stok negatif olamaz', status: 400 }

  if (item.track_locations && !locationId) {
    return { error: 'Bu urun lokasyon takipli — lokasyon secimi gerekli', status: 400 }
  }

  // Lokasyon takipliyse once orada islem yap (yetersizse hata)
  if (item.track_locations && locationId) {
    const db = queries.getStockByLocation(id)
    if (delta < 0) {
      const row = db.find(r => r.location_id === +locationId)
      if (!row || row.quantity < Math.abs(delta)) {
        return { error: 'Secilen lokasyonda yetersiz stok', status: 400 }
      }
    }
  }

  queries.adjustQuantity(id, newQty)
  if (item.track_locations && locationId) {
    queries.adjustLocationStock(id, +locationId, delta)
  }
  queries.addMovement(id, delta > 0 ? 'in' : 'out', delta, newQty, reason, userId, locationId)
  logAudit(userId, delta > 0 ? 'inventory_in' : 'inventory_out', 'inventory', id,
    `${item.item_name}: ${delta > 0 ? '+' : ''}${delta} ${item.unit} (${reason || '-'})`)

  // A→Z: her hareket bildirim akışına düşer (info — kullanıcı tercihi kontrol eder)
  createNotification({
    message: `${delta > 0 ? '➕' : '➖'} ${item.item_name}: ${delta > 0 ? '+' : ''}${delta} ${item.unit} (yeni: ${newQty})${reason ? ' — ' + reason : ''}`,
    event_kind: delta > 0 ? EVENT_KINDS.INVENTORY_MOVEMENT_ADDED : EVENT_KINDS.INVENTORY_MOVEMENT_REMOVED,
    target_role: 'campus_manager',
    entity_type: 'inventory_item', entity_id: id,
  })

  if (newQty <= item.reorder_threshold && item.reorder_threshold > 0) {
    createNotification({
      message: `Stok uyarisi: ${item.item_name} — ${newQty} ${item.unit} kaldi (esik: ${item.reorder_threshold})`,
      event_kind: newQty === 0 ? EVENT_KINDS.INVENTORY_STOCK_OUT : EVENT_KINDS.INVENTORY_STOCK_LOW,
      target_role: 'campus_manager',
      entity_type: 'inventory_item', entity_id: id,
      dedup_key: `stock_${newQty === 0 ? 'out' : 'low'}_${id}`,
    })
  }

  return { ok: true, quantity: newQty }
}

export function getItemMovements(itemId, limit) {
  return queries.getMovements(itemId, limit)
}

export function getRecentMovements(limit) {
  return queries.getRecentMovements(limit)
}

export function getStats() {
  return queries.getStats()
}

export function getStockByLocation(itemId) {
  return queries.getStockByLocation(itemId)
}

export function getForecast(userId) {
  const items = queries.getForecast()

  // severity ekle
  const result = items.map(item => ({
    ...item,
    severity: item.days_left <= 3 ? 'critical' : 'warning',
  }))

  // 24 saatte bir bildirim gönder
  if (result.length > 0 && userId) {
    const recent = queries.recentForecastNotify()

    if (!recent) {
      const criticals = result.filter(i => i.severity === 'critical')
      const warnings = result.filter(i => i.severity === 'warning')

      let msg = 'Stok tükenme uyarısı: '
      if (criticals.length > 0) {
        msg += `${criticals.length} ürün 3 gün içinde biter (${criticals.map(i => i.item_name).join(', ')})`
      }
      if (warnings.length > 0) {
        msg += `${criticals.length > 0 ? '; ' : ''}${warnings.length} ürün 7 gün içinde biter`
      }

      createNotification({
        message: msg,
        type: criticals.length > 0 ? 'critical' : 'warning',
        module: 'inventory',
        target_role: 'campus_manager',
      })

      logAudit(userId, 'inventory_forecast_notify', 'inventory', null, `${result.length} urun`)
    }
  }

  return result
}

export function bulkStockCount(items, userId) {
  const result = queries.bulkCount(items, userId)
  logAudit(userId, 'inventory_count', 'inventory', null, `Toplu sayim: ${result.updated} urun guncellendi`)
  return result
}

// ── Checkout (Malzeme Teslim — AVS personeli) ───────────────────────────────

export function searchStaff(query) {
  return queries.searchStaff(query)
}

export function checkoutToStaff(itemId, staffId, qty, note, userId, fromLocationId = null) {
  const result = queries.checkoutItem(itemId, staffId, qty, note, userId, fromLocationId)
  const item = queries.getItemById(itemId)
  logAudit(userId, 'inventory_checkout', 'inventory', itemId,
    `Teslim: ${item?.item_name} x${qty} (${note || '-'})`)

  if (item && item.quantity <= item.reorder_threshold && item.reorder_threshold > 0) {
    createNotification({
      message: `Stok uyarisi: ${item.item_name} — ${item.quantity} ${item.unit} kaldi`,
      event_kind: item.quantity === 0 ? EVENT_KINDS.INVENTORY_STOCK_OUT : EVENT_KINDS.INVENTORY_STOCK_LOW,
      target_role: 'campus_manager',
      entity_type: 'inventory_item', entity_id: itemId,
      dedup_key: `stock_${item.quantity === 0 ? 'out' : 'low'}_${itemId}`,
    })
  }
  return result
}

export function returnFromPersonnel(checkoutId, returnQty, userId) {
  const result = queries.returnItem(checkoutId, returnQty, userId)
  logAudit(userId, 'inventory_return', 'inventory', checkoutId, `Iade: ${returnQty || 'tam'} adet`)
  return result
}

export function getActiveCheckouts() {
  return queries.getActiveCheckouts()
}

export function getCheckoutHistory(limit) {
  return queries.getCheckoutHistory(limit)
}

export function getStaffCheckouts(staffId) {
  return queries.getStaffCheckouts(staffId)
}

export function getCheckoutReport() {
  return queries.getCheckoutReport()
}

// ── Hasarli / Kayip stok dusumu ──────────────────────────────────────────────

export function writeOff(itemId, qty, type, reason, userId) {
  if (!['damage', 'loss'].includes(type)) throw new Error('Gecersiz tip')
  if (!qty || qty <= 0) throw new Error('Miktar gerekli')
  const item = queries.getItemById(itemId)
  if (!item) throw new Error('Urun bulunamadi')
  if (item.quantity < qty) throw new Error(`Yetersiz stok: ${item.quantity} ${item.unit}`)

  const newQty = item.quantity - qty
  queries.adjustQuantity(itemId, newQty)
  queries.addMovement(itemId, type, -qty, newQty, reason || (type === 'damage' ? 'Hasarli' : 'Kayip'), userId)
  logAudit(userId, `inventory_${type}`, 'inventory', itemId,
    `${item.item_name}: ${qty} ${item.unit} (${reason || '-'})`)

  if (newQty <= item.reorder_threshold && item.reorder_threshold > 0) {
    createNotification({
      message: `Stok uyarisi: ${item.item_name} — ${newQty} ${item.unit} kaldi`,
      event_kind: newQty === 0 ? EVENT_KINDS.INVENTORY_STOCK_OUT : EVENT_KINDS.INVENTORY_STOCK_LOW,
      target_role: 'campus_manager',
      entity_type: 'inventory_item', entity_id: itemId,
      dedup_key: `stock_${newQty === 0 ? 'out' : 'low'}_${itemId}`,
    })
  }
  return { ok: true, quantity: newQty }
}

// ── Goods Receipts (Mal Giris) ───────────────────────────────────────────────

export function createReceipt(supplier, invoiceNo, receiptDate, notes, items, userId) {
  const result = queries.createReceipt(supplier, invoiceNo, receiptDate, notes, items, userId)
  logAudit(userId, 'goods_receipt', 'inventory', result.id,
    `Mal giris: ${result.receipt_no} — ${supplier} — ${items.length} kalem — ${result.total_value.toLocaleString('tr-TR')} TL`)
  return result
}

export function getReceipts(limit) {
  return queries.getReceipts(limit)
}

export function getReceiptDetail(id) {
  return queries.getReceiptDetail(id)
}

export function deleteReceipt(id, userId) {
  const receipt = queries.getReceiptDetail(id)
  if (receipt) {
    queries.deleteReceipt(id)
    logAudit(userId, 'goods_receipt_delete', 'inventory', id, `Mal giris silindi: ${receipt.receipt_no}`)
  }
}
