import api from '../../shared/api/client.js'

export const laundryApi = {
  // ── Items ──────────────────────────────────────────────────────────────
  getItems: (params = {}) => api.get('/laundry/items', { params }).then(r => r.data),
  getItem: (id) => api.get(`/laundry/items/${id}`).then(r => r.data),
  getItemHistory: (id) => api.get(`/laundry/items/${id}/history`).then(r => r.data),
  getItemDamages: (id) => api.get(`/laundry/items/${id}/damages`).then(r => r.data),
  createItem: (data) => api.post('/laundry/items', data).then(r => r.data),
  advanceItem: (id, data) => api.patch(`/laundry/items/${id}/advance`, data).then(r => r.data),
  deliverItem: (id, data) => api.patch(`/laundry/items/${id}/deliver`, data).then(r => r.data),
  lostItem: (id, data) => api.patch(`/laundry/items/${id}/lost`, data).then(r => r.data),
  deleteItem: (id) => api.delete(`/laundry/items/${id}`).then(r => r.data),
  batchDeliver: (data) => api.post('/laundry/items/batch-deliver', data).then(r => r.data),
  reportDamage: (id, data) => api.post(`/laundry/items/${id}/damages`, data).then(r => r.data),

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

  // ── Photo Upload ───────────────────────────────────────────────────────
  uploadPhoto: (file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return api.post('/laundry/upload-photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },
}
