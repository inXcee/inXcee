import * as queries from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { createNotification } from '../../shared/notifications/service.js'

export function listItems(category) {
  return queries.getAllItems(category)
}

export function addItem(data, userId) {
  const id = queries.createItem(data)
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

export function adjustStock(id, delta, reason, userId) {
  const item = queries.getItemById(id)
  if (!item) return { error: 'Ürün bulunamadı', status: 404 }

  const newQty = item.quantity + delta
  if (newQty < 0) return { error: 'Stok negatif olamaz', status: 400 }

  queries.adjustQuantity(id, newQty)
  logAudit(userId, delta > 0 ? 'inventory_in' : 'inventory_out', 'inventory', id,
    `${item.item_name}: ${delta > 0 ? '+' : ''}${delta} ${item.unit} (${reason || '-'})`)

  if (newQty <= item.reorder_threshold && item.reorder_threshold > 0) {
    createNotification({
      message: `Stok uyarısı: ${item.item_name} — ${newQty} ${item.unit} kaldı (eşik: ${item.reorder_threshold})`,
      type: 'critical',
      module: 'inventory',
      target_role: 'campus_manager',
    })
  }

  return { ok: true, quantity: newQty }
}
