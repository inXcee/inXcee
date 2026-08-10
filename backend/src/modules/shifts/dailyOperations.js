import { getDB } from '../../shared/db/index.js'

// Faz 6 — Günlük Operasyon Merkezi.
//
// Gün detayı paneli "kim hangi vardiyada, nerede" sorusunu zaten cevaplıyor.
// Burada cevaplanmayan üç şey var:
//   1) Hangi nokta EKSİK kadroyla çalışıyor (kapsama kuralına göre)
//   2) Biri gelmezse YERİNE kimi çağırabilirim (o gün boşta, izinli değil)
//   3) Gün içinde ne oldu — devir teslim notu (şimdiye kadar sözlü aktarılıyordu)
//
// Devam (gelen/geç/gelmeyen) verisi turnike/kart kaydından gelir; canlıda
// attendance_logs BOŞ. "0 devamsız" yazmak yerine kaynağın yokluğu açıkça
// bildirilir — sessiz sıfır bu depoda tekrar eden hata sınıfı.

export function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))
}

// shift_coverage_rules.days_of_week '1,2,3,4,5,6,7' — ISO gün (1=Pazartesi).
export function isoGun(date) {
  const [y, a, g] = String(date).split('-').map(Number)
  const js = new Date(y, a - 1, g).getDay()   // 0=Pazar
  return js === 0 ? 7 : js
}

function guvenli(db, sql, params, kaynak, sorunlar) {
  try {
    return db.prepare(sql).all(...params)
  } catch (err) {
    sorunlar.push({ source: kaynak, error: err.message })
    return null
  }
}

const CALISAN = "('scheduled','worked','overtime')"

export function getDayOperations(date, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  const sorunlar = []

  // ── Gün özeti ─────────────────────────────────────────────────────────────
  const durumlar = guvenli(db, `
    SELECT status, COUNT(*) c FROM shift_schedule WHERE work_date = ? GROUP BY status
  `, [date], 'shift_schedule', sorunlar)
  const summary = { planned: 0, worked: 0, on_leave: 0, absent: 0, off: 0, total: 0 }
  durumlar?.forEach(r => {
    if (r.status === 'scheduled') summary.planned += r.c
    else if (r.status === 'worked' || r.status === 'overtime') summary.worked += r.c
    else if (r.status === 'on_leave') summary.on_leave += r.c
    else if (r.status === 'absent') summary.absent += r.c
    else if (r.status === 'off') summary.off += r.c
    summary.total += r.c
  })

  // ── Kapsama açıkları ──────────────────────────────────────────────────────
  // Kural o gün geçerliyse (days_of_week) ve atanan kişi min_staff'ın altındaysa
  // nokta eksik kadroyla çalışıyor demektir.
  const gun = isoGun(date)
  const kurallar = guvenli(db, `
    SELECT r.id, r.name, r.min_staff, r.dept_id, r.shift_def_id, r.work_location_id,
           r.start_time, r.end_time,
           d.name AS dept_name, s.name AS shift_name, w.name AS location_name
    FROM shift_coverage_rules r
    LEFT JOIN departments d ON d.id = r.dept_id
    LEFT JOIN shift_definitions s ON s.id = r.shift_def_id
    LEFT JOIN work_locations w ON w.id = r.work_location_id
    WHERE r.is_active = 1
      AND (',' || r.days_of_week || ',') LIKE ?
  `, [`%,${gun},%`], 'shift_coverage_rules', sorunlar)

  const coverage_gaps = []
  kurallar?.forEach(kural => {
    const kosullar = ['ss.work_date = ?', `ss.status IN ${CALISAN}`]
    const params = [date]
    if (kural.dept_id) { kosullar.push('ss.dept_id = ?'); params.push(kural.dept_id) }
    if (kural.shift_def_id) { kosullar.push('ss.shift_def_id = ?'); params.push(kural.shift_def_id) }
    if (kural.work_location_id) { kosullar.push('ss.work_location_id = ?'); params.push(kural.work_location_id) }

    let atanan = null
    try {
      atanan = db.prepare(`SELECT COUNT(*) c FROM shift_schedule ss WHERE ${kosullar.join(' AND ')}`).get(...params).c
    } catch (err) {
      sorunlar.push({ source: `coverage_rule:${kural.id}`, error: err.message })
      return
    }
    const gerekli = Number(kural.min_staff || 0)
    if (atanan < gerekli) {
      coverage_gaps.push({
        rule_id: kural.id,
        rule_name: kural.name,
        shift_name: kural.shift_name || null,
        department: kural.dept_name || null,
        location: kural.location_name || null,
        time: kural.start_time && kural.end_time ? `${kural.start_time}-${kural.end_time}` : null,
        required: gerekli,
        assigned: atanan,
        missing: gerekli - atanan,
      })
    }
  })
  coverage_gaps.sort((a, b) => b.missing - a.missing)

  // ── Devam kaydı (turnike/kart) ────────────────────────────────────────────
  // Kaynak boşsa "0 devamsız" demek yanlış güven verir.
  let attendance = { available: false, reason: 'Giriş/çıkış kaydı yok', count: 0 }
  try {
    const c = db.prepare('SELECT COUNT(*) c FROM attendance_logs').get().c
    attendance = c > 0
      ? { available: true, count: db.prepare('SELECT COUNT(*) c FROM attendance_logs a JOIN shift_schedule ss ON ss.id = a.shift_schedule_id WHERE ss.work_date = ?').get(date).c }
      : { available: false, reason: 'attendance_logs boş — turnike/kart kaydı sisteme akmıyor', count: 0 }
  } catch (err) {
    attendance = { available: false, reason: `Okunamadı: ${err.message}`, count: 0 }
    sorunlar.push({ source: 'attendance_logs', error: err.message })
  }

  // ── Devir teslim notları ──────────────────────────────────────────────────
  const handover = guvenli(db, `
    SELECT h.id, h.note, h.created_at, h.shift_def_id, s.name AS shift_name, u.full_name AS author_name
    FROM shift_handover_notes h
    LEFT JOIN users u ON u.id = h.author_id
    LEFT JOIN shift_definitions s ON s.id = h.shift_def_id
    WHERE h.work_date = ?
    ORDER BY h.created_at DESC
    LIMIT 50
  `, [date], 'shift_handover_notes', sorunlar) || []

  return {
    date,
    summary,
    coverage_gaps,
    attendance,
    handover,
    // Ölçülemeyen kaynaklar açıkça bildirilir; boş liste "sorun yok" sanılmasın.
    unavailable: sorunlar,
  }
}

// Biri gelmezse yerine kimi çağırabilirim?
// O gün HİÇ kaydı olmayan (boşta) veya OFF olan, aktif, onaylı izni olmayan
// personel. İzinli/raporlu kişiyi aday göstermek amiri yanlış yönlendirir.
export function findReplacements({ date, department_id, limit = 30 } = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  // Parametreler placeholder SIRASIYLA toplanır; sonradan araya koşul eklerken
  // sırayı kaydırmak sessiz yanlış sonuç verir (yanlış kişi aday görünür).
  const params = []
  params.push(date, date)                       // son 7 gün penceresi
  const deptKosulu = department_id ? 's.department_id = ?' : null
  if (deptKosulu) params.push(Number(department_id))
  params.push(date)                             // o gün çalışıyor mu
  params.push(date)                             // o gün onaylı izinli mi
  params.push(Math.min(100, Math.max(1, Number(limit) || 30)))

  try {
    return db.prepare(`
      SELECT s.id, s.full_name, s.department_id, d.name AS department_name, r.name AS role_name,
             (SELECT COUNT(*) FROM shift_schedule x
               WHERE x.staff_id = s.id AND x.work_date BETWEEN date(?, '-6 day') AND ?
                 AND x.status IN ${CALISAN}) AS son_7_gun_calisma
      FROM staff s
      LEFT JOIN departments d ON d.id = s.department_id
      LEFT JOIN staff_roles r ON r.id = s.role_id
      WHERE s.is_active = 1
        ${deptKosulu ? `AND ${deptKosulu}` : ''}
        AND NOT EXISTS (
          SELECT 1 FROM shift_schedule ss
          WHERE ss.staff_id = s.id AND ss.work_date = ? AND ss.status IN ${CALISAN}
        )
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests l
          WHERE l.staff_id = s.id AND l.status = 'approved'
            AND ? BETWEEN l.start_date AND l.end_date
        )
      ORDER BY son_7_gun_calisma ASC, s.full_name COLLATE NOCASE
      LIMIT ?
    `).all(...params)
  } catch (err) {
    throw Object.assign(new Error(`Yedek personel listesi alınamadı: ${err.message}`), { statusCode: 500 })
  }
}

export function addHandoverNote({ date, note, shift_def_id = null, userId }, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  const metin = String(note || '').trim()
  if (!metin) throw Object.assign(new Error('Not boş olamaz'), { statusCode: 400 })
  if (metin.length > 4000) throw Object.assign(new Error('Not çok uzun (en fazla 4000 karakter)'), { statusCode: 400 })

  const sonuc = db.prepare(`
    INSERT INTO shift_handover_notes(work_date, shift_def_id, note, author_id) VALUES(?, ?, ?, ?)
  `).run(date, shift_def_id || null, metin, userId ?? null)
  return { id: sonuc.lastInsertRowid, work_date: date }
}
