// Personel adı çözümleme + kalıcı ad eşleştirmeleri (staff_aliases).
//
// Dış kaynaklar (çizelge Excel'i, İK puantajı, föy) aynı kişiyi farklı yazabiliyor: "YASİNCAN BAYRAK" /
// "YASİN CAN BAYRAK", "MUHAMMET" / "MUHAMMED". Kullanıcı bir kez "aynı kişi" dediğinde bu eşleştirme
// saklanır; sonraki aktarımlar onu birebir eşleşme sayar (yeniden onay istemez).
import { getDB } from '../../shared/db/index.js'
import { normalizeName, foldName, validTc } from '../../shared/names.js'

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })
const SOURCES = new Set(['manual', 'cizelge', 'puantaj'])

function push(map, key, value) {
  if (!key) return
  const list = map.get(key)
  if (!list) map.set(key, [value])
  else if (!list.includes(value)) list.push(value)
}

// Çözümleme sırası: TC → birebir ad → kayıtlı eşleştirme → aksan-katlamalı ad → eşleştirmenin katlanmış hali.
// Bir adım birden çok personele çıkıyorsa 'ambiguous' döner; tahmin yapılmaz.
export function buildStaffResolver(db = getDB(), { includeInactive = false } = {}) {
  const staff = db.prepare(`
    SELECT id, full_name, tc_no, is_active, hire_date, position, project_id, archive_reason, archived_at,
      offboarding_started_at, exit_date, department_id, hr_roster_exempt
    FROM staff ${includeInactive ? '' : 'WHERE is_active=1'}
  `).all()
  const byId = new Map(staff.map(s => [s.id, s]))
  const byTc = new Map(), byExact = new Map(), byFold = new Map(), byAlias = new Map(), byAliasFold = new Map()
  for (const s of staff) {
    push(byTc, validTc(s.tc_no), s)
    push(byExact, normalizeName(s.full_name), s)
    push(byFold, foldName(s.full_name), s)
  }
  for (const a of db.prepare('SELECT staff_id, alias, alias_fold FROM staff_aliases').all()) {
    const s = byId.get(a.staff_id)
    if (!s) continue
    push(byAlias, a.alias_fold, s)
    push(byAliasFold, foldName(a.alias), s)
  }
  const resolve = (name, tc = null) => {
    const steps = [
      ['tc', byTc.get(validTc(tc))],
      ['exact', byExact.get(normalizeName(name))],
      ['alias', byAlias.get(normalizeName(name))],
      ['fold', byFold.get(foldName(name))],
      ['alias', byAliasFold.get(foldName(name))],
    ]
    for (const [method, hits] of steps) {
      if (!hits?.length) continue
      if (hits.length > 1) {
        // Arşivlenmiş mükerrer kayıt aynı adı taşıyabilir: tek aktif aday varsa o kişidir.
        const active = hits.filter(s => s.is_active)
        if (active.length === 1) return { staff: active[0], method }
        return { staff: null, method: 'ambiguous', candidates: hits }
      }
      return { staff: hits[0], method }
    }
    return { staff: null, method: null }
  }
  resolve.staff = staff
  resolve.byId = byId
  return resolve
}

export function listStaffAliases({ staffId } = {}) {
  const db = getDB()
  return db.prepare(`
    SELECT a.*, s.full_name, u.full_name AS created_by_name
    FROM staff_aliases a JOIN staff s ON s.id = a.staff_id
    LEFT JOIN users u ON u.id = a.created_by
    ${staffId ? 'WHERE a.staff_id = ?' : ''}
    ORDER BY s.full_name, a.alias
  `).all(...(staffId ? [Number(staffId)] : []))
}

// Aynı ad aynı kişiye yeniden bağlanırsa sessizce mevcut kayıt döner (idempotent).
export function addStaffAlias({ staffId, alias, source = 'manual' }, userId, db = getDB()) {
  const name = String(alias || '').trim().replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 160) throw fail('Eşleştirilecek ad 3–160 karakter olmalı')
  if (!SOURCES.has(source)) throw fail('Geçersiz kaynak')
  const staff = db.prepare('SELECT id, full_name FROM staff WHERE id=?').get(Number(staffId))
  if (!staff) throw fail('Personel bulunamadı', 404)
  const key = normalizeName(name)
  if (key === normalizeName(staff.full_name)) throw fail('Bu ad zaten personelin kendi adı')
  // Başka bir personelin gerçek adı eşleştirme olamaz: çözümleyici birebir adı önce bulur, eşleştirme hiç çalışmaz.
  const owner = db.prepare('SELECT id, full_name FROM staff WHERE id<>?').all(staff.id)
    .find(s => normalizeName(s.full_name) === key)
  if (owner) throw fail(`"${name}" başka bir personelin adı (#${owner.id} ${owner.full_name})`, 409)
  const existing = db.prepare('SELECT * FROM staff_aliases WHERE alias_fold=?').get(key)
  if (existing) {
    if (existing.staff_id === staff.id) return existing
    throw fail(`"${name}" zaten başka bir personele bağlı (#${existing.staff_id})`, 409)
  }
  const id = db.prepare(`INSERT INTO staff_aliases(staff_id, alias, alias_fold, source, created_by) VALUES(?,?,?,?,?)`)
    .run(staff.id, name, key, source, userId || null).lastInsertRowid
  return db.prepare('SELECT * FROM staff_aliases WHERE id=?').get(id)
}

export function deleteStaffAlias(id) {
  const db = getDB()
  const row = db.prepare('SELECT * FROM staff_aliases WHERE id=?').get(Number(id))
  if (!row) throw fail('Eşleştirme bulunamadı', 404)
  db.prepare('DELETE FROM staff_aliases WHERE id=?').run(row.id)
  return row
}

// Levenshtein benzerliği (0–1) — eşleşmeyen adlara "bunu mu demek istediniz" adayı önermek için.
export function nameSimilarity(a, b) {
  const x = foldName(a), y = foldName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length)
}
