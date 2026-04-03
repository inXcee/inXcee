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
  batchDeliver: (data) => api.post('/laundry/items/batch-deliver', data).then(r => r.data),
  batchAssign: (item_ids, machine_id, timer_minutes) => api.post('/laundry/items/batch-assign', { item_ids, machine_id, timer_minutes }).then(r => r.data),
  batchLost: (item_ids, notes) => api.post('/laundry/items/batch-lost', { item_ids, notes }).then(r => r.data),
  reportDamage: (id, data) => api.post(`/laundry/items/${id}/damages`, data).then(r => r.data),
  createVerification: (id, data) => api.post(`/laundry/items/${id}/verify`, data).then(r => r.data),
  getVerifications: (id) => api.get(`/laundry/items/${id}/verifications`).then(r => r.data),
  getArchive: (params) => api.get('/laundry/items/archive', { params }).then(r => r.data),

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

  // ── Reports ────────────────────────────────────────────────────────────
  getStats: (params) => api.get('/laundry/reports/stats', { params }).then(r => r.data),
  exportCsv: (params) => api.get('/laundry/reports/export', { params, responseType: 'blob' }).then(r => r.data),

  // ── Person History ─────────────────────────────────────────────────────────
  getPersonHistory: (name) => api.get(`/laundry/person/${encodeURIComponent(name)}`).then(r => r.data),

  // ── Found ─────────────────────────────────────────────────────────────────
  markFound: (id, send_whatsapp = false) => api.post(`/laundry/items/${id}/found`, { send_whatsapp }).then(r => r.data),

  // ── WhatsApp ───────────────────────────────────────────────────────────
  notifyWhatsApp: (id, phone) => api.post(`/laundry/items/${id}/notify-whatsapp`, { phone }).then(r => r.data),
  getRoomOccupant: (roomId) => api.get(`/laundry/room-occupant/${roomId}`).then(r => r.data).catch(() => ({})),

  // ── Settings ───────────────────────────────────────────────────────────
  getLaundrySettings: () => api.get('/laundry/settings').then(r => r.data),
  updateLaundrySetting: (key, value) => api.put(`/laundry/settings/${encodeURIComponent(key)}`, { value }).then(r => r.data),

  // ── Messages ───────────────────────────────────────────────────────────
  getMessages: (params = {}) => api.get('/laundry/messages', { params }).then(r => r.data),
  sendMessage: (data) => api.post('/laundry/messages', data).then(r => r.data),
  deleteMessage: (id) => api.delete(`/laundry/messages/${id}`).then(r => r.data),
  pinMessage: (id, is_pinned) => api.patch(`/laundry/messages/${id}/pin`, { is_pinned }).then(r => r.data),

  // ── Photo Upload ───────────────────────────────────────────────────────
  uploadPhoto: (file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return api.post('/laundry/upload-photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
}
