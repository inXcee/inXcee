import { getDB } from '../../shared/db/index.js'
import { isIsoDate, isoGun } from './dailyOperations.js'
import { evaluateSuitability } from './suitability.js'

// Faz 10 — Açık vardiya ve başvuru.
//
// Boş kalan vardiya için amir tek tek telefon ediyordu; kimin istekli olduğu
// hiçbir yerde durmuyordu. Açık vardiya ilan edilir, personel başvurur, amir
// adaylar arasından seçer — her adayın uygunluğu (çakışma, izin, dinlenme,
// haftalık süre, rol, belge) yanında yazar.
//
// Seçilmeyen başvuru SİLİNMEZ: kimin gönüllü olduğu kayıtta kalır.

const CALISAN = "('scheduled', 'worked', 'overtime')"

export function createOpenShift(input = {}, db = getDB(), userId = null) {
  const { work_date, shift_def_id = null, work_location_id = null, dept_id = null, role_id = null, note = null } = input
  if (!isIsoDate(work_date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  const slots = Number(input.slots ?? 1)
  if (!Number.isInteger(slots) || slots < 1) {
    throw Object.assign(new Error('Kişi sayısı en az 1 olmalı'), { statusCode: 400 })
  }
  const bilgi = db.prepare(`
    INSERT INTO open_shifts (work_date, shift_def_id, work_location_id, dept_id, role_id, slots, note, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(work_date, shift_def_id, work_location_id, dept_id, role_id, slots, note, userId)
  return getOpenShift(bilgi.lastInsertRowid, db)
}

export function getOpenShift(id, db = getDB()) {
  const satir = db.prepare(`
    SELECT o.*, sd.name AS shift_name, sd.start_hour, sd.end_hour,
           w.name AS location_name, d.name AS dept_name, r.name AS role_name
    FROM open_shifts o
    LEFT JOIN shift_definitions sd ON sd.id = o.shift_def_id
    LEFT JOIN work_locations w ON w.id = o.work_location_id
    LEFT JOIN departments d ON d.id = o.dept_id
    LEFT JOIN staff_roles r ON r.id = o.role_id
    WHERE o.id = ?
  `).get(id)
  if (!satir) throw Object.assign(new Error('Açık vardiya bulunamadı'), { statusCode: 404 })
  return satir
}

export function listOpenShifts({ from = null, to = null, status = 'open' } = {}, db = getDB()) {
  const kosullar = []
  const params = []
  if (status) { kosullar.push('o.status = ?'); params.push(status) }
  if (from) { kosullar.push('o.work_date >= ?'); params.push(from) }
  if (to) { kosullar.push('o.work_date <= ?'); params.push(to) }

  const satirlar = db.prepare(`
    SELECT o.*, sd.name AS shift_name, sd.start_hour, sd.end_hour,
           w.name AS location_name, d.name AS dept_name, r.name AS role_name,
           (SELECT COUNT(*) FROM open_shift_applications a WHERE a.open_shift_id = o.id AND a.status = 'applied') AS applicant_count,
           (SELECT COUNT(*) FROM open_shift_applications a WHERE a.open_shift_id = o.id AND a.status = 'selected') AS selected_count
    FROM open_shifts o
    LEFT JOIN shift_definitions sd ON sd.id = o.shift_def_id
    LEFT JOIN work_locations w ON w.id = o.work_location_id
    LEFT JOIN departments d ON d.id = o.dept_id
    LEFT JOIN staff_roles r ON r.id = o.role_id
    ${kosullar.length ? `WHERE ${kosullar.join(' AND ')}` : ''}
    ORDER BY o.work_date, o.id
  `).all(...params)
  return { items: satirlar }
}

export function applyToOpenShift({ open_shift_id, staff_id, note = null } = {}, db = getDB()) {
  const acik = getOpenShift(open_shift_id, db)
  if (acik.status !== 'open') throw Object.assign(new Error('Bu vardiya artık açık değil'), { statusCode: 409 })
  const staffId = Number(staff_id)
  if (!Number.isFinite(staffId) || staffId <= 0) throw Object.assign(new Error('Geçersiz personel'), { statusCode: 400 })

  const mevcut = db.prepare('SELECT id, status FROM open_shift_applications WHERE open_shift_id = ? AND staff_id = ?')
    .get(acik.id, staffId)
  if (mevcut && mevcut.status !== 'withdrawn') {
    throw Object.assign(new Error('Bu vardiyaya zaten başvurulmuş'), { statusCode: 409 })
  }
  // Geri çekilmiş başvuru yeniden açılır; yeni satır açmak geçmişi çoğaltırdı.
  if (mevcut) {
    db.prepare("UPDATE open_shift_applications SET status = 'applied', note = ?, decided_by = NULL, decided_at = NULL WHERE id = ?")
      .run(note, mevcut.id)
    return db.prepare('SELECT * FROM open_shift_applications WHERE id = ?').get(mevcut.id)
  }
  const bilgi = db.prepare('INSERT INTO open_shift_applications (open_shift_id, staff_id, note) VALUES (?,?,?)')
    .run(acik.id, staffId, note)
  return db.prepare('SELECT * FROM open_shift_applications WHERE id = ?').get(bilgi.lastInsertRowid)
}

export function withdrawApplication({ open_shift_id, staff_id } = {}, db = getDB()) {
  const bilgi = db.prepare(`
    UPDATE open_shift_applications SET status = 'withdrawn'
    WHERE open_shift_id = ? AND staff_id = ? AND status = 'applied'
  `).run(open_shift_id, Number(staff_id))
  if (!bilgi.changes) throw Object.assign(new Error('Geri çekilecek başvuru yok'), { statusCode: 404 })
  return { withdrawn: true }
}

// Adaylar uygunluk özetiyle birlikte döner: seçim yaparken çakışma, izin,
// dinlenme ve belge durumu aynı satırda görünür.
export function listApplicants(openShiftId, db = getDB()) {
  const acik = getOpenShift(openShiftId, db)
  const basvurular = db.prepare(`
    SELECT a.id, a.staff_id, a.note, a.status, a.created_at, a.seen_at,
           s.full_name, d.name AS dept_name, r.name AS role_name
    FROM open_shift_applications a
    JOIN staff s ON s.id = a.staff_id
    LEFT JOIN departments d ON d.id = s.department_id
    LEFT JOIN staff_roles r ON r.id = s.role_id
    WHERE a.open_shift_id = ? AND a.status != 'withdrawn'
    ORDER BY CASE a.status WHEN 'selected' THEN 0 WHEN 'applied' THEN 1 ELSE 2 END, a.created_at
  `).all(openShiftId)

  const items = basvurular.map(b => {
    let uygunluk = null
    try {
      uygunluk = evaluateSuitability({
        staff_id: b.staff_id, date: acik.work_date,
        shift_def_id: acik.shift_def_id, role_id: acik.role_id,
      }, db)
    } catch (err) {
      // Uygunluk çıkarılamadıysa aday "uygun" sayılmaz; sebebi yazılır.
      uygunluk = { eligible: false, fully_verified: false, checks: [], error: err.message }
    }
    return { ...b, suitability: uygunluk }
  })

  return { open_shift: acik, items }
}

// Seçim çizelgeye YAZAR: onaylanan aday gerçekten atanmış olur, yoksa "seçtim"
// ile "çizelgede var" birbirinden ayrı kalır ve kimse fark etmez.
export function selectApplicant({ open_shift_id, staff_id, force = false } = {}, db = getDB(), userId = null) {
  const acik = getOpenShift(open_shift_id, db)
  if (acik.status !== 'open') throw Object.assign(new Error('Bu vardiya artık açık değil'), { statusCode: 409 })

  const basvuru = db.prepare("SELECT * FROM open_shift_applications WHERE open_shift_id = ? AND staff_id = ? AND status IN ('applied','selected')")
    .get(open_shift_id, Number(staff_id))
  if (!basvuru) throw Object.assign(new Error('Bu personelin başvurusu yok'), { statusCode: 404 })

  const uygunluk = evaluateSuitability({
    staff_id, date: acik.work_date, shift_def_id: acik.shift_def_id, role_id: acik.role_id,
  }, db)
  // Engelli adayı sessizce atamak, kontrolü hiç yapmamakla aynı sonucu verir.
  if (!uygunluk.eligible && !force) {
    throw Object.assign(new Error(`Atama engelli: ${uygunluk.blockers.join(', ')}`), { statusCode: 409, suitability: uygunluk })
  }

  const yaz = db.transaction(() => {
    db.prepare("UPDATE open_shift_applications SET status = 'selected', decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(userId, basvuru.id)

    db.prepare(`
      INSERT INTO shift_schedule (staff_id, work_date, shift_def_id, work_location_id, dept_id, status)
      VALUES (?,?,?,?,?, 'scheduled')
    `).run(staff_id, acik.work_date, acik.shift_def_id, acik.work_location_id, acik.dept_id)

    const secilen = db.prepare("SELECT COUNT(*) c FROM open_shift_applications WHERE open_shift_id = ? AND status = 'selected'")
      .get(open_shift_id).c
    if (secilen >= acik.slots) {
      db.prepare("UPDATE open_shifts SET status = 'filled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(open_shift_id)
      db.prepare("UPDATE open_shift_applications SET status = 'not_selected' WHERE open_shift_id = ? AND status = 'applied'")
        .run(open_shift_id)
    }
  })
  yaz()

  return { selected: true, suitability: uygunluk, open_shift: getOpenShift(open_shift_id, db) }
}

// Takas/atama sonrası kapsama: aynı kural için önce ve sonra.
export function coverageComparison({ date, before = null } = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  const gun = isoGun(date)

  let kurallar
  try {
    kurallar = db.prepare(`
      SELECT r.id, r.name, r.min_staff, r.dept_id, r.shift_def_id, r.work_location_id,
             s.name AS shift_name, w.name AS location_name
      FROM shift_coverage_rules r
      LEFT JOIN shift_definitions s ON s.id = r.shift_def_id
      LEFT JOIN work_locations w ON w.id = r.work_location_id
      WHERE r.is_active = 1 AND (',' || r.days_of_week || ',') LIKE ?
    `).all(`%,${gun},%`)
  } catch (err) {
    return { date, available: false, reason: `Kapsama kuralları okunamadı: ${err.message}`, rules: [] }
  }

  const oncekiMap = new Map((before || []).map(r => [r.rule_id, r.assigned]))
  const rules = kurallar.map(kural => {
    const kosullar = ['ss.work_date = ?', `ss.status IN ${CALISAN}`]
    const params = [date]
    if (kural.dept_id) { kosullar.push('ss.dept_id = ?'); params.push(kural.dept_id) }
    if (kural.shift_def_id) { kosullar.push('ss.shift_def_id = ?'); params.push(kural.shift_def_id) }
    if (kural.work_location_id) { kosullar.push('ss.work_location_id = ?'); params.push(kural.work_location_id) }
    const atanan = db.prepare(`SELECT COUNT(*) c FROM shift_schedule ss WHERE ${kosullar.join(' AND ')}`).get(...params).c
    const gerekli = Number(kural.min_staff || 0)
    const onceki = oncekiMap.has(kural.id) ? oncekiMap.get(kural.id) : null
    return {
      rule_id: kural.id,
      rule_name: kural.name,
      shift_name: kural.shift_name || null,
      location: kural.location_name || null,
      required: gerekli,
      assigned: atanan,
      missing: Math.max(0, gerekli - atanan),
      previous: onceki,
      delta: onceki == null ? null : atanan - onceki,
    }
  })

  return {
    date,
    available: true,
    rules,
    total_missing: rules.reduce((t, r) => t + r.missing, 0),
    improved: rules.filter(r => r.delta != null && r.delta > 0).length,
    worsened: rules.filter(r => r.delta != null && r.delta < 0).length,
  }
}

// Bildirimin görüldüğü teyit edilmezse "haber verdim" demek ölçüsüz kalır.
export function markApplicationSeen({ open_shift_id, staff_id } = {}, db = getDB()) {
  const bilgi = db.prepare(`
    UPDATE open_shift_applications SET seen_at = CURRENT_TIMESTAMP
    WHERE open_shift_id = ? AND staff_id = ? AND seen_at IS NULL
  `).run(open_shift_id, Number(staff_id))
  return { marked: bilgi.changes > 0 }
}
