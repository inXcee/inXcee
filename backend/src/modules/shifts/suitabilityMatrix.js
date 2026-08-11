import { getDB } from '../../shared/db/index.js'
import { isIsoDate } from './dailyOperations.js'
import { evaluateSuitability } from './suitability.js'

// Faz 11 — Personel uygunluk matrisi.
//
// Tek kişilik uygunluk (Faz 10) "bu adayı seçebilir miyim" sorusunu cevaplıyor.
// Planlayıcının sorusu farklı: "bu gün bu vardiyaya KİMLERİ koyabilirim".
// Matris tüm kadroyu tek tabloda, kontrol kontrol gösterir.
//
// Sıralama uygun → uyarılı → ölçülemeyen → engelli. Engelli kişi listeden
// ÇIKARILMAZ; neden çıkarıldığı görünmezse amir aramaya devam eder.

const SATIR_SINIRI = 300   // tek istekte değerlendirilecek en fazla personel

export function buildSuitabilityMatrix({
  date, shift_def_id = null, role_id = null, work_location_id = null,
  dept_id = null, project_id = null, only_eligible = false,
} = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })

  const kosullar = ['s.is_active = 1']
  const params = []
  if (dept_id != null) { kosullar.push('s.department_id = ?'); params.push(Number(dept_id)) }
  if (project_id != null) { kosullar.push('s.project_id = ?'); params.push(Number(project_id)) }

  let kadro
  try {
    kadro = db.prepare(`
      SELECT s.id, s.full_name, d.name AS dept_name, r.name AS role_name
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN staff_roles r ON r.id = s.role_id
      WHERE ${kosullar.join(' AND ')}
      ORDER BY s.full_name
      LIMIT ${SATIR_SINIRI + 1}
    `).all(...params)
  } catch (err) {
    throw Object.assign(new Error(`Kadro okunamadı: ${err.message}`), { statusCode: 500 })
  }

  // Kırpma sessiz kalırsa liste tam sanılır ve eksik kişi gözden kaçar.
  const truncated = kadro.length > SATIR_SINIRI
  if (truncated) kadro = kadro.slice(0, SATIR_SINIRI)

  const satirlar = kadro.map(k => {
    let u
    try {
      u = evaluateSuitability({ staff_id: k.id, date, shift_def_id, role_id, work_location_id }, db)
    } catch (err) {
      return {
        staff_id: k.id, full_name: k.full_name, dept_name: k.dept_name, role_name: k.role_name,
        eligible: false, fully_verified: false, blockers: [], warnings: [], unknown: [],
        checks: [], error: err.message,
      }
    }
    return {
      staff_id: k.id,
      full_name: k.full_name,
      dept_name: k.dept_name,
      role_name: k.role_name,
      eligible: u.eligible,
      fully_verified: u.fully_verified,
      blockers: u.blockers,
      warnings: u.warnings,
      unknown: u.unknown,
      checks: u.checks,
    }
  })

  // Uygun → uyarılı → ölçülemeyen → engelli
  const oncelik = s => (s.blockers.length ? 3 : s.unknown.length ? 2 : s.warnings.length ? 1 : 0)
  satirlar.sort((a, b) => oncelik(a) - oncelik(b) || a.full_name.localeCompare(b.full_name, 'tr'))

  const gorunen = only_eligible ? satirlar.filter(s => s.eligible) : satirlar

  return {
    date,
    filters: {
      shift_def_id: shift_def_id == null ? null : Number(shift_def_id),
      role_id: role_id == null ? null : Number(role_id),
      work_location_id: work_location_id == null ? null : Number(work_location_id),
      dept_id: dept_id == null ? null : Number(dept_id),
      project_id: project_id == null ? null : Number(project_id),
      only_eligible: !!only_eligible,
    },
    summary: {
      total: satirlar.length,
      eligible: satirlar.filter(s => s.eligible).length,
      blocked: satirlar.filter(s => s.blockers.length).length,
      with_warnings: satirlar.filter(s => !s.blockers.length && s.warnings.length).length,
      // Ölçülemeyen kontrolü olan kişi "uygun" listesine güvenle konamaz.
      not_fully_verified: satirlar.filter(s => !s.fully_verified).length,
    },
    items: gorunen,
    truncated_at: truncated ? SATIR_SINIRI : null,
  }
}

export function listStaffConstraints(staffId, db = getDB()) {
  return db.prepare(`
    SELECT c.*, w.name AS location_name, sd.name AS shift_name
    FROM staff_work_constraints c
    LEFT JOIN work_locations w ON w.id = c.ref_id AND c.constraint_type LIKE 'location%'
    LEFT JOIN shift_definitions sd ON sd.id = c.ref_id AND c.constraint_type LIKE 'shift%'
    WHERE c.staff_id = ?
    ORDER BY c.constraint_type, c.id
  `).all(Number(staffId))
}

const TURLER = ['health', 'location_allow', 'location_block', 'shift_block', 'shift_prefer']

export function addStaffConstraint(input = {}, db = getDB(), userId = null) {
  const staffId = Number(input.staff_id)
  if (!Number.isFinite(staffId) || staffId <= 0) {
    throw Object.assign(new Error('Geçersiz personel'), { statusCode: 400 })
  }
  if (!TURLER.includes(input.constraint_type)) {
    throw Object.assign(new Error('Geçersiz kısıt türü'), { statusCode: 400 })
  }
  // Lokasyon/vardiya kısıtı ref_id'siz anlamsızdır: neyi kısıtladığı belirsiz
  // kalır ve motor onu hiçbir atamayla eşleştiremez.
  if (input.constraint_type !== 'health' && !Number.isFinite(Number(input.ref_id))) {
    throw Object.assign(new Error('Bu kısıt türünde lokasyon/vardiya seçilmelidir'), { statusCode: 400 })
  }
  for (const alan of ['valid_from', 'valid_to']) {
    if (input[alan] && !isIsoDate(input[alan])) {
      throw Object.assign(new Error(`Geçersiz tarih: ${alan}`), { statusCode: 400 })
    }
  }
  if (input.valid_from && input.valid_to && input.valid_to < input.valid_from) {
    throw Object.assign(new Error('Bitiş tarihi başlangıçtan önce olamaz'), { statusCode: 400 })
  }

  const bilgi = db.prepare(`
    INSERT INTO staff_work_constraints (staff_id, constraint_type, ref_id, note, valid_from, valid_to, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run(staffId, input.constraint_type,
    input.constraint_type === 'health' ? null : Number(input.ref_id),
    input.note || null, input.valid_from || null, input.valid_to || null, userId)

  return db.prepare('SELECT * FROM staff_work_constraints WHERE id = ?').get(bilgi.lastInsertRowid)
}

export function deleteStaffConstraint(id, db = getDB()) {
  const bilgi = db.prepare('DELETE FROM staff_work_constraints WHERE id = ?').run(Number(id))
  if (!bilgi.changes) throw Object.assign(new Error('Kısıt bulunamadı'), { statusCode: 404 })
  return { deleted: true }
}
