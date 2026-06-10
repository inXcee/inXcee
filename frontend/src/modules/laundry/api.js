import api from '../../shared/api/client.js'

export const laundryApi = {
  // ── Items ──────────────────────────────────────────────────────────────
  getItems: (params = {}) => api.get('/laundry/items', { params }).then(r => r.data),
  getItem: (id) => api.get(`/laundry/items/${id}`).then(r => r.data),
  getItemHistory: (id) => api.get(`/laundry/items/${id}/history`).then(r => r.data),
  getItemDamages: (id) => api.get(`/laundry/items/${id}/damages`).then(r => r.data),
  createItem: (data) => api.post('/laundry/items', data).then(r => r.data),
  advanceItem: (id, data) => api.patch(`/laundry/items/${id}/advance`, data).then(r => r.data),
  revertItem: (id, targetStatus) => api.patch(`/laundry/items/${id}/revert`, { target_status: targetStatus }).then(r => r.data),
  deliverItem: (id, data) => api.patch(`/laundry/items/${id}/deliver`, data).then(r => r.data),
  lostItem: (id, data) => api.patch(`/laundry/items/${id}/lost`, data).then(r => r.data),
  deleteItem: (id) => api.delete(`/laundry/items/${id}`).then(r => r.data),
  collectItem: (id) => api.post(`/laundry/items/${id}/collect`).then(r => r.data),
  batchDeliver: (data) => api.post('/laundry/items/batch-deliver', data).then(r => r.data),
  batchAssign: (item_ids, machine_id, timer_minutes) => api.post('/laundry/items/batch-assign', { item_ids, machine_id, timer_minutes }).then(r => r.data),
  batchLost: (item_ids, notes) => api.post('/laundry/items/batch-lost', { item_ids, notes }).then(r => r.data),
  reportDamage: (id, data) => api.post(`/laundry/items/${id}/damages`, data).then(r => r.data),
  deleteDamage: (damageId) => api.delete(`/laundry/damages/${damageId}`).then(r => r.data),
  createVerification: (id, data) => api.post(`/laundry/items/${id}/verify`, data).then(r => r.data),
  getVerifications: (id) => api.get(`/laundry/items/${id}/verifications`).then(r => r.data),
  getArchive: (params) => api.get('/laundry/items/archive', { params }).then(r => r.data),
  setCompensation: (id, data) => api.patch(`/laundry/items/${id}/compensation`, data).then(r => r.data),

  // ── Machines ───────────────────────────────────────────────────────────
  getMachines: () => api.get('/laundry/machines').then(r => r.data),
  createMachine: (data) => api.post('/laundry/machines', data).then(r => r.data),
  updateMachine: (id, data) => api.patch(`/laundry/machines/${id}`, data).then(r => r.data),
  deleteMachine: (id) => api.delete(`/laundry/machines/${id}`).then(r => r.data),

  // ── Queue ──────────────────────────────────────────────────────────────
  getQueue: (machineId) => api.get('/laundry/queue', { params: machineId ? { machine_id: machineId } : {} }).then(r => r.data),
  addToQueue: (data) => api.post('/laundry/queue', data).then(r => r.data),
  removeFromQueue: (id) => api.delete(`/laundry/queue/${id}`).then(r => r.data),

  // ── SLA ────────────────────────────────────────────────────────────────
  getSlaConfig: () => api.get('/laundry/sla-config').then(r => r.data),
  updateSlaConfig: (data) => api.put('/laundry/sla-config', data).then(r => r.data),
  getSlaViolations: () => api.get('/laundry/sla/violations').then(r => r.data),
  getSlaPreWarnings: () => api.get('/laundry/sla/pre-warnings').then(r => r.data),

  // ── Reports ────────────────────────────────────────────────────────────
  getStats: (params) => api.get('/laundry/reports/stats', { params }).then(r => r.data),
  getBusyness: (days = 30) => api.get(`/laundry/busyness?days=${days}`).then(r => r.data),
  getOperatorSummary: (days = 7) => api.get(`/laundry/operator-summary?days=${days}`).then(r => r.data),
  exportCsv: (params) => api.get('/laundry/reports/export', { params, responseType: 'blob' }).then(r => r.data),
  getPremiumReport: (params) => api.get('/laundry/reports/premium', { params }).then(r => r.data),
  exportPremiumCsv: (params) => api.get('/laundry/reports/export-premium', { params, responseType: 'blob' }).then(r => r.data),

  // ── Person History ─────────────────────────────────────────────────────────
  getPersonHistory: (name) => api.get(`/laundry/person/${encodeURIComponent(name)}`).then(r => r.data),
  getRoomsOverview: () => api.get('/laundry/rooms-overview').then(r => r.data),
  getRoomLaundryDetail: (block, room_no) => api.get(`/laundry/rooms/${encodeURIComponent(block)}/${encodeURIComponent(room_no)}/detail`).then(r => r.data),

  // ── Found ─────────────────────────────────────────────────────────────────
  markFound: (id, send_whatsapp = false) => api.post(`/laundry/items/${id}/found`, { send_whatsapp }).then(r => r.data),

  // ── WhatsApp ───────────────────────────────────────────────────────────
  notifyWhatsApp: (id, phone) => api.post(`/laundry/items/${id}/notify-whatsapp`, { phone }).then(r => r.data),
  remindRoomReady: (block, room_no, person_name) =>
    api.post(`/laundry/rooms/${encodeURIComponent(block)}/${encodeURIComponent(room_no)}/remind-ready`, { person_name }).then(r => r.data),
  sendNotify: (phone, message) => api.post('/laundry/notify', { phone, message }).then(r => r.data),
  notifyRoomPerson: (block, room_no, person_name, message) =>
    api.post(`/laundry/rooms/${encodeURIComponent(block)}/${encodeURIComponent(room_no)}/notify-person`, { person_name, message }).then(r => r.data),
  getRoomOccupant: (roomId) => api.get(`/laundry/room-occupant/${roomId}`).then(r => r.data).catch(() => ({})),

  // ── Settings ───────────────────────────────────────────────────────────
  getLaundrySettings: () => api.get('/laundry/settings').then(r => r.data),
  updateLaundrySetting: (key, value) => api.put(`/laundry/settings/${encodeURIComponent(key)}`, { value }).then(r => r.data),

  // ── Premium Garments ───────────────────────────────────────────────────
  getPremiumGarments: (item_id) => api.get(`/laundry/items/${item_id}/garments`).then(r => r.data),
  addPremiumGarments: (item_id, garments) => api.post(`/laundry/items/${item_id}/garments`, garments).then(r => r.data),
  getPremiumGarmentByCode: (code) => api.get(`/laundry/garments/by-code/${encodeURIComponent(code)}`).then(r => r.data),
  advancePremiumGarment: (id) => api.patch(`/laundry/garments/${id}/advance`).then(r => r.data),
  bulkAdvancePremiumGarments: (item_id, garment_ids, to_status) => api.post(`/laundry/items/${item_id}/garments/bulk-advance`, { garment_ids, to_status }).then(r => r.data),
  deliverPremiumGarment: (id, data) => api.patch(`/laundry/garments/${id}/deliver`, data).then(r => r.data),
  bulkDeliverPremiumGarments: (item_id, garment_ids, delivered_to, signature_data) => api.post(`/laundry/items/${item_id}/premium-deliver`, { garment_ids, delivered_to, signature_data }).then(r => r.data),
  getPremiumDeliveryReceipt: (item_id) => api.get(`/laundry/items/${item_id}/delivery-receipt`).then(r => r.data),
  searchPremiumGarments: (params) => api.get('/laundry/garments/search', { params }).then(r => r.data),
  getRoomGarmentHistory: (room_id, params) => api.get(`/laundry/rooms/${room_id}/garment-history`, { params }).then(r => r.data),

  // ── Block Config ───────────────────────────────────────────────────────
  getBlockConfig: () => api.get('/laundry/block-config').then(r => r.data),
  updateBlockConfig: (block, is_premium) => api.put(`/laundry/block-config/${block}`, { is_premium }).then(r => r.data),

  // ── Messages ───────────────────────────────────────────────────────────
  getMessages: (params = {}) => api.get('/laundry/messages', { params }).then(r => r.data),
  sendMessage: (data) => api.post('/laundry/messages', data).then(r => r.data),
  deleteMessage: (id) => api.delete(`/laundry/messages/${id}`).then(r => r.data),
  pinMessage: (id, is_pinned) => api.patch(`/laundry/messages/${id}/pin`, { is_pinned }).then(r => r.data),

  // ── Rooms ──────────────────────────────────────────────────────────────────
  getRooms: () => api.get('/laundry/rooms').then(r => r.data),
  getRoomForScan: (block, room_no) => api.get('/laundry/rooms-scan', { params: { block, room_no } }).then(r => r.data),
  scanAction: (data) => api.post('/laundry/garments/scan-action', data).then(r => r.data),

  // ── Supplies ───────────────────────────────────────────────────────────
  getSupplies: (includeInactive = false) =>
    api.get('/laundry/supplies', { params: includeInactive ? { include_inactive: 1 } : {} }).then(r => r.data),
  getSupplyAlerts: () => api.get('/laundry/supplies/alerts').then(r => r.data),
  createSupply: (data) => api.post('/laundry/supplies', data).then(r => r.data),
  updateSupply: (id, data) => api.patch(`/laundry/supplies/${id}`, data).then(r => r.data),
  addStock: (id, amount, note) => api.post(`/laundry/supplies/${id}/add-stock`, { amount, note }).then(r => r.data),
  setStock: (id, new_stock) => api.post(`/laundry/supplies/${id}/set-stock`, { new_stock }).then(r => r.data),
  getSupplyLog: (id) => api.get(`/laundry/supplies/${id}/log`).then(r => r.data),
  setMachineSupply: (machine_id, supply_id, per_wash_amount) =>
    api.put(`/laundry/machines/${machine_id}/supplies/${supply_id}`, { per_wash_amount }).then(r => r.data),
  deleteMachineSupply: (machine_id, supply_id) =>
    api.delete(`/laundry/machines/${machine_id}/supplies/${supply_id}`).then(r => r.data),

  // ── Garment Types ──────────────────────────────────────────────────────
  getGarmentTypes: () => api.get('/laundry/garment-types').then(r => r.data),
  getGarmentTypesAll: () => api.get('/laundry/garment-types/all').then(r => r.data),
  createGarmentType: (data) => api.post('/laundry/garment-types', data).then(r => r.data),
  updateGarmentType: (id, data) => api.patch(`/laundry/garment-types/${id}`, data).then(r => r.data),
  reorderGarmentTypes: (items) => api.post('/laundry/garment-types/reorder', { items }).then(r => r.data),

  // ── Photo Upload ───────────────────────────────────────────────────────
  uploadPhoto: (file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return api.post('/laundry/upload-photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
}
