import { getDB } from '../../shared/db/index.js'

// Kadro sayısı listeyle birlikte gelir; ekranda her proje için ayrı istek atılmasın.
export function listProjects({ includeInactive = false } = {}) {
  let sql = `
    SELECT p.*,
           (SELECT COUNT(*) FROM staff s WHERE s.project_id = p.id AND s.is_active = 1) AS staff_count
    FROM projects p
    WHERE 1=1
  `
  if (!includeInactive) sql += ' AND p.is_active = 1'
  sql += ' ORDER BY p.sort_order, p.name'
  return getDB().prepare(sql).all()
}

export function getProject(id) {
  return getDB().prepare('SELECT * FROM projects WHERE id=?').get(id)
}

export function findProjectByCode(code) {
  return getDB().prepare('SELECT * FROM projects WHERE code=?').get(code)
}

export function insertProject({ name, code, color_class, sort_order }) {
  const info = getDB().prepare(`
    INSERT INTO projects(name, code, color_class, sort_order)
    VALUES(?,?,?,?)
  `).run(name, code, color_class || 'bg-blue-500', sort_order ?? 0)
  return getProject(Number(info.lastInsertRowid))
}

export function updateProject(id, patch) {
  const alanlar = []
  const degerler = []
  for (const key of ['name', 'code', 'color_class', 'sort_order', 'is_active']) {
    if (patch[key] !== undefined) { alanlar.push(`${key}=?`); degerler.push(patch[key]) }
  }
  if (!alanlar.length) return getProject(id)
  getDB().prepare(`UPDATE projects SET ${alanlar.join(', ')} WHERE id=?`).run(...degerler, id)
  return getProject(id)
}

export function projectStaffCount(id) {
  return getDB().prepare('SELECT COUNT(*) AS n FROM staff WHERE project_id=?').get(id).n
}

export function deleteProject(id) {
  getDB().prepare('DELETE FROM projects WHERE id=?').run(id)
}

// Toplu kadro ataması. project_id null → kadrodan çıkarır (personel silinmez).
export function assignStaffToProject(staffIds, projectId) {
  const db = getDB()
  const stmt = db.prepare('UPDATE staff SET project_id=? WHERE id=?')
  let updated = 0
  db.transaction(() => {
    staffIds.forEach(id => { updated += stmt.run(projectId, id).changes })
  })()
  return updated
}
