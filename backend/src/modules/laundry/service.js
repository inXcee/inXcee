import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'

export const generateBagService = q.generateBag
export const getBagByQRService = q.getBagByQR
export function collectBagService(qrCode, userId) {
  const bag = q.collectBag(qrCode, userId)
  logAudit(userId, 'bag_collect', 'laundry', null, qrCode)
  return bag
}
export const loadMachineService = q.loadMachine
export const finishWashService = q.finishWash
export const getDistributionRouteService = q.getDistributionRoute
export const distributeBagService = q.distributeBag
