import { getDB } from '../../shared/db/index.js'

// Çizelge yayın akışı: taslak → yayın → (gerekirse) geri çekme.
//
// Bugün her hücre değişikliği anında bağlayıcı sayılıyor; "yayınlandı" diye bir
// an yok. Bu yüzden yayından sonra yapılan değişiklik de kimseye bildirilmiyor.
//
// Yayın anında çizelgenin FOTOĞRAFI alınır (schedule_version_entries). Fotoğraf
// olmadan "yayından beri ne değişti" sorusu cevaplanamaz — canlı tabloyu
// kendisiyle karşılaştırmanın anlamı yok.

const HAFTA_GUN = 7

function haftaGunleri(weekStart) {
  const [y, a, g] = String(weekStart).slice(0, 10).split('-').map(Number)
  return Array.from({ length: HAFTA_GUN }, (_, i) => {
    const d = new Date(y, a - 1, g + i)
    const ay = String(d.getMonth() + 1).padStart(2, '0')
    return `${d.getFullYear()}-${ay}-${String(d.getDate()).padStart(2, '0')}`
  })
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

// Haftanın canlı çizelge satırları — fotoğraf ve karşılaştırma bundan üretilir.
function canliSatirlar(db, weekStart) {
  const gunler = haftaGunleri(weekStart)
  return db.prepare(`
    SELECT staff_id, work_date, shift_def_id, status, leave_type, work_location_id
    FROM shift_schedule
    WHERE work_date BETWEEN ? AND ?
    ORDER BY staff_id, work_date
  `).all(gunler[0], gunler[HAFTA_GUN - 1])
}

export function getWeekVersion(weekStart, db = getDB()) {
  if (!isIsoDate(weekStart)) throw Object.assign(new Error('Geçersiz hafta'), { statusCode: 400 })
  const son = db.prepare(`
    SELECT v.*, u.full_name AS published_by_name
    FROM schedule_versions v
    LEFT JOIN users u ON u.id = v.published_by
    WHERE v.week_start = ?
    ORDER BY v.version DESC LIMIT 1
  `).get(weekStart)

  if (!son) {
    return { week_start: weekStart, status: 'draft', version: 0, published_at: null, changes: null }
  }
  // Geri çekilmiş sürüm "yayında" değildir; hafta yeniden taslaktır.
  const yayinda = son.status === 'published'
  return {
    week_start: weekStart,
    status: yayinda ? 'published' : 'draft',
    version: son.version,
    published_at: yayinda ? son.published_at : null,
    published_by_name: yayinda ? son.published_by_name : null,
    note: son.note || null,
    withdrawn_at: son.withdrawn_at || null,
    changes: yayinda ? diffSincePublish(weekStart, db) : null,
  }
}

const anahtar = satir => `${satir.staff_id}|${satir.work_date}`
const ayniMi = (a, b) => a.shift_def_id === b.shift_def_id
  && a.status === b.status
  && (a.leave_type || null) === (b.leave_type || null)
  && (a.work_location_id ?? null) === (b.work_location_id ?? null)

// Yayınlanan fotoğraf ile canlı çizelge farkı. Yayın yoksa null döner — "fark
// yok" ile "hiç yayınlanmadı" aynı şey değil.
export function diffSincePublish(weekStart, db = getDB()) {
  const sürüm = db.prepare(`
    SELECT id FROM schedule_versions
    WHERE week_start = ? AND status = 'published'
    ORDER BY version DESC LIMIT 1
  `).get(weekStart)
  if (!sürüm) return null

  const fotograf = db.prepare(`
    SELECT staff_id, work_date, shift_def_id, status, leave_type, work_location_id
    FROM schedule_version_entries WHERE version_id = ?
  `).all(sürüm.id)

  const eski = new Map(fotograf.map(r => [anahtar(r), r]))
  const yeni = new Map(canliSatirlar(db, weekStart).map(r => [anahtar(r), r]))

  const eklenen = []
  const degisen = []
  const silinen = []

  for (const [k, satir] of yeni) {
    const oncesi = eski.get(k)
    if (!oncesi) eklenen.push(satir)
    else if (!ayniMi(oncesi, satir)) degisen.push({ before: oncesi, after: satir })
  }
  for (const [k, satir] of eski) {
    if (!yeni.has(k)) silinen.push(satir)
  }

  return {
    added: eklenen,
    changed: degisen,
    removed: silinen,
    total: eklenen.length + degisen.length + silinen.length,
  }
}

export function publishWeek(weekStart, userId, { note } = {}, db = getDB()) {
  if (!isIsoDate(weekStart)) throw Object.assign(new Error('Geçersiz hafta'), { statusCode: 400 })
  const satirlar = canliSatirlar(db, weekStart)
  // Boş haftayı yayınlamak, personele "bu hafta çalışmıyorsunuz" demektir;
  // kazara basılmasın diye engelleniyor.
  if (satirlar.length === 0) {
    throw Object.assign(new Error('Bu haftada çizelge kaydı yok — boş hafta yayınlanamaz'), { statusCode: 400 })
  }

  const kaydet = db.transaction(() => {
    const sonSurum = db.prepare('SELECT MAX(version) v FROM schedule_versions WHERE week_start = ?').get(weekStart)
    const version = (sonSurum?.v || 0) + 1
    const sonuc = db.prepare(`
      INSERT INTO schedule_versions(week_start, version, status, note, published_by)
      VALUES(?, ?, 'published', ?, ?)
    `).run(weekStart, version, note?.trim() || null, userId ?? null)
    const versionId = sonuc.lastInsertRowid

    const ekle = db.prepare(`
      INSERT INTO schedule_version_entries(version_id, staff_id, work_date, shift_def_id, status, leave_type, work_location_id)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `)
    satirlar.forEach(r => ekle.run(versionId, r.staff_id, r.work_date, r.shift_def_id, r.status, r.leave_type, r.work_location_id))
    return { versionId, version }
  })

  const { version } = kaydet()
  return { week_start: weekStart, version, status: 'published', entries: satirlar.length }
}

export function withdrawWeek(weekStart, userId, db = getDB()) {
  if (!isIsoDate(weekStart)) throw Object.assign(new Error('Geçersiz hafta'), { statusCode: 400 })
  const yayin = db.prepare(`
    SELECT id, version FROM schedule_versions
    WHERE week_start = ? AND status = 'published'
    ORDER BY version DESC LIMIT 1
  `).get(weekStart)
  if (!yayin) throw Object.assign(new Error('Bu hafta yayında değil'), { statusCode: 400 })

  db.prepare(`
    UPDATE schedule_versions
    SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP, withdrawn_by = ?
    WHERE id = ?
  `).run(userId ?? null, yayin.id)

  return { week_start: weekStart, version: yayin.version, status: 'withdrawn' }
}
