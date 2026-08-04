import * as q from './queries.js'

function normalizeCode(value) {
  // Kod ekranlarda ve dışa aktarımda kullanılıyor; boşluksuz ve büyük harf tutulur.
  return String(value || '').trim().toLocaleUpperCase('tr').replace(/\s+/g, '_').slice(0, 24)
}

export function listService(options) {
  return q.listProjects(options)
}

export function createService(data) {
  const name = String(data?.name || '').trim()
  const code = normalizeCode(data?.code || data?.name)
  if (!name || !code) return { error: 'Proje adı ve kodu gerekli', status: 400 }
  if (q.findProjectByCode(code)) return { error: 'Bu kod zaten kullanılıyor', status: 409 }
  return { project: q.insertProject({ ...data, name, code }) }
}

export function updateService(id, data) {
  const mevcut = q.getProject(id)
  if (!mevcut) return { error: 'Proje bulunamadı', status: 404 }
  const patch = {}
  if (data.name !== undefined) {
    const name = String(data.name).trim()
    if (!name) return { error: 'Proje adı boş olamaz', status: 400 }
    patch.name = name
  }
  if (data.code !== undefined) {
    const code = normalizeCode(data.code)
    if (!code) return { error: 'Proje kodu boş olamaz', status: 400 }
    const cakisan = q.findProjectByCode(code)
    if (cakisan && cakisan.id !== id) return { error: 'Bu kod zaten kullanılıyor', status: 409 }
    patch.code = code
  }
  if (data.color_class !== undefined) patch.color_class = data.color_class
  if (data.sort_order !== undefined) patch.sort_order = Number(data.sort_order) || 0
  if (data.is_active !== undefined) patch.is_active = data.is_active ? 1 : 0
  return { project: q.updateProject(id, patch) }
}

export function deleteService(id) {
  if (!q.getProject(id)) return { error: 'Proje bulunamadı', status: 404 }
  // Kadrosu olan proje silinirse o personel sessizce kadrosuz kalır; önce
  // boşaltılmasını isteyerek bunu görünür kılıyoruz.
  const kadro = q.projectStaffCount(id)
  if (kadro > 0) {
    return { error: `Bu projede ${kadro} personel var. Önce başka projeye taşıyın veya kadrodan çıkarın.`, status: 409 }
  }
  q.deleteProject(id)
  return { ok: true }
}

export function assignService({ staff_ids, project_id }) {
  const ids = Array.isArray(staff_ids) ? staff_ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length) return { error: 'En az bir personel seçin', status: 400 }
  if (project_id != null && !q.getProject(Number(project_id))) {
    return { error: 'Proje bulunamadı', status: 404 }
  }
  return { updated: q.assignStaffToProject(ids, project_id == null ? null : Number(project_id)) }
}
