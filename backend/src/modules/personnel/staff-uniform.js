import { getDB } from '../../shared/db/index.js'

const CATEGORY_LABELS = { clothing: 'Kıyafet', footwear: 'Ayakkabı', ppe: 'KKD', other: 'Diğer' }
const VALID_CATEGORIES = new Set(['clothing', 'footwear', 'ppe', 'other'])
const VALID_SIZE_KINDS = new Set(['text', 'numeric', 'none'])

function fail(message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function requireStaff(db, staffId) {
  const staff = db.prepare('SELECT id FROM staff WHERE id=?').get(staffId)
  if (!staff) throw fail('Personel bulunamadı', 404)
}

function activeItemKeys(db) {
  return new Set(db.prepare('SELECT item_key FROM uniform_items WHERE is_active=1').all().map(r => r.item_key))
}

export function listUniform(staffId) {
  const db = getDB()
  requireStaff(db, staffId)
  const items = db.prepare(`
    SELECT item_key, label, category, size_kind, sort_order
    FROM uniform_items WHERE is_active=1
    ORDER BY sort_order, label
  `).all()
  const sizeRows = db.prepare(
    'SELECT item_key, size, note, updated_at FROM staff_uniform_sizes WHERE staff_id=?'
  ).all(staffId)
  const sizeByKey = new Map(sizeRows.map(row => [row.item_key, row]))

  // Aktif zimmet (iade edilmemiş) adetleri tür bazında.
  const activeIssues = db.prepare(`
    SELECT item_key, SUM(quantity) AS qty
    FROM staff_uniform_issues WHERE staff_id=? AND returned_at IS NULL
    GROUP BY item_key
  `).all(staffId)
  const activeByKey = new Map(activeIssues.map(row => [row.item_key, row.qty]))

  const mergedItems = items.map(item => ({
    item_key: item.item_key,
    label: item.label,
    category: item.category,
    category_label: CATEGORY_LABELS[item.category] || item.category,
    size_kind: item.size_kind,
    size: sizeByKey.get(item.item_key)?.size ?? null,
    note: sizeByKey.get(item.item_key)?.note ?? null,
    active_quantity: activeByKey.get(item.item_key) || 0,
  }))

  const issues = db.prepare(`
    SELECT ui.id, ui.item_key, ui.size, ui.quantity, ui.note, ui.issued_at, ui.returned_at,
      COALESCE(itm.label, ui.item_key) AS label,
      iu.full_name AS issued_by_name, ru.full_name AS returned_by_name
    FROM staff_uniform_issues ui
    LEFT JOIN uniform_items itm ON itm.item_key=ui.item_key
    LEFT JOIN users iu ON iu.id=ui.issued_by
    LEFT JOIN users ru ON ru.id=ui.returned_by
    WHERE ui.staff_id=?
    ORDER BY ui.returned_at IS NOT NULL, ui.issued_at DESC, ui.id DESC
  `).all(staffId)

  return {
    items: mergedItems,
    issues,
    summary: {
      total_types: mergedItems.length,
      sized: mergedItems.filter(item => item.size).length,
      active_issues: issues.filter(issue => !issue.returned_at).length,
    },
  }
}

// Toplu beden kaydı: gönderilen her { item_key, size, note } upsert edilir.
// Boş size gönderilirse o türün bedeni silinir (temizlenir).
export function saveUniformSizes(staffId, sizes, { userId } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  if (!Array.isArray(sizes)) throw fail('Beden listesi gerekli')
  const valid = activeItemKeys(db)
  const upsert = db.prepare(`
    INSERT INTO staff_uniform_sizes(staff_id, item_key, size, note, updated_by, updated_at)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(staff_id, item_key) DO UPDATE SET
      size=excluded.size, note=excluded.note, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP
  `)
  const remove = db.prepare('DELETE FROM staff_uniform_sizes WHERE staff_id=? AND item_key=?')
  let saved = 0
  db.transaction(() => {
    for (const entry of sizes) {
      const key = String(entry.item_key || '')
      if (!valid.has(key)) continue
      const size = entry.size != null ? String(entry.size).trim().slice(0, 40) : ''
      const note = entry.note != null ? String(entry.note).trim().slice(0, 200) : null
      if (!size && !note) { remove.run(staffId, key); continue }
      upsert.run(staffId, key, size || null, note, userId ?? null)
      saved += 1
    }
  })()
  return { ok: true, saved }
}

export function issueUniform(staffId, data, { userId } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  const key = String(data.item_key || '')
  if (!activeItemKeys(db).has(key)) throw fail('Geçersiz kıyafet türü')
  const quantity = Math.max(1, Number.parseInt(data.quantity, 10) || 1)
  const size = data.size != null ? String(data.size).trim().slice(0, 40) : null
  const result = db.prepare(`
    INSERT INTO staff_uniform_issues(staff_id, item_key, size, quantity, note, issued_by)
    VALUES(?,?,?,?,?,?)
  `).run(staffId, key, size, quantity, data.note ? String(data.note).slice(0, 200) : null, userId ?? null)
  return { id: result.lastInsertRowid }
}

export function returnUniformIssue(issueId, { userId } = {}) {
  const db = getDB()
  const issue = db.prepare('SELECT id, returned_at FROM staff_uniform_issues WHERE id=?').get(issueId)
  if (!issue) throw fail('Zimmet kaydı bulunamadı', 404)
  if (issue.returned_at) throw fail('Bu zimmet zaten iade edilmiş')
  db.prepare('UPDATE staff_uniform_issues SET returned_at=CURRENT_TIMESTAMP, returned_by=? WHERE id=?')
    .run(userId ?? null, issueId)
  return { ok: true }
}

/* ─── Tür kataloğu yönetimi (yalnız müdür) ─────────────────── */
export function listUniformItems() {
  const db = getDB()
  return {
    items: db.prepare(`
      SELECT id, item_key, label, category, size_kind, sort_order, is_active
      FROM uniform_items ORDER BY is_active DESC, sort_order, label
    `).all(),
    categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  }
}

function slugify(value) {
  return String(value || '').trim().toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export function createUniformItem(data, { userId } = {}) {
  const db = getDB()
  const label = String(data.label || '').trim()
  if (!label) throw fail('Tür adı gerekli')
  const category = VALID_CATEGORIES.has(data.category) ? data.category : 'clothing'
  const sizeKind = VALID_SIZE_KINDS.has(data.size_kind) ? data.size_kind : 'text'
  const itemKey = slugify(data.item_key || label)
  if (!itemKey) throw fail('Geçerli bir tür anahtarı üretilemedi')
  try {
    const result = db.prepare(`
      INSERT INTO uniform_items(item_key, label, category, size_kind, sort_order, created_by)
      VALUES(?,?,?,?,?,?)
    `).run(itemKey, label, category, sizeKind,
      Number.parseInt(data.sort_order, 10) || 200, userId ?? null)
    return { id: result.lastInsertRowid, item_key: itemKey }
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw fail('Bu tür anahtarı zaten mevcut')
    throw e
  }
}

export function updateUniformItem(id, data) {
  const db = getDB()
  const existing = db.prepare('SELECT id FROM uniform_items WHERE id=?').get(id)
  if (!existing) throw fail('Tür bulunamadı', 404)
  const fields = []
  const params = []
  const set = (column, value) => { fields.push(`${column}=?`); params.push(value) }
  if (data.label != null) {
    const label = String(data.label).trim()
    if (!label) throw fail('Tür adı boş olamaz')
    set('label', label.slice(0, 80))
  }
  if (data.category != null && VALID_CATEGORIES.has(data.category)) set('category', data.category)
  if (data.size_kind != null && VALID_SIZE_KINDS.has(data.size_kind)) set('size_kind', data.size_kind)
  if (data.sort_order != null) set('sort_order', Number.parseInt(data.sort_order, 10) || 200)
  if (data.is_active != null) set('is_active', data.is_active ? 1 : 0)
  if (!fields.length) return { ok: true, unchanged: true }
  params.push(id)
  db.prepare(`UPDATE uniform_items SET ${fields.join(', ')} WHERE id=?`).run(...params)
  return { ok: true }
}

export function deleteUniformItem(id) {
  const db = getDB()
  const item = db.prepare('SELECT item_key FROM uniform_items WHERE id=?').get(id)
  if (!item) throw fail('Tür bulunamadı', 404)
  // Kişi bedeni veya zimmet varsa silme yerine pasife almak güvenli — veri kaybı olmaz.
  const used = db.prepare('SELECT COUNT(*) AS c FROM staff_uniform_sizes WHERE item_key=?').get(item.item_key).c
    + db.prepare('SELECT COUNT(*) AS c FROM staff_uniform_issues WHERE item_key=?').get(item.item_key).c
  if (used > 0) {
    db.prepare('UPDATE uniform_items SET is_active=0 WHERE id=?').run(id)
    return { ok: true, deactivated: true }
  }
  db.prepare('DELETE FROM uniform_items WHERE id=?').run(id)
  return { ok: true }
}
