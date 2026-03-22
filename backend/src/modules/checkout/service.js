import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { broadcastOccupancy } from '../../shared/notifications/service.js'

export function getCheckoutPreviewService(personnelId) {
  return q.getCheckoutPreview(personnelId)
}

export function processCheckoutService(personnelId, zimmetActions, userId) {
  q.processCheckout(personnelId, zimmetActions, userId)
  logAudit(userId, 'personnel_checkout', 'checkout', personnelId, 'Cikis islemi tamamlandi')
  broadcastOccupancy()
}

export const getRecentCheckoutsService = q.getRecentCheckouts
