import { getDB } from '../../shared/db/index.js'

// Faz 10/11 — Personel uygunluk motoru.
//
// "Bu kişi bu vardiyaya atanabilir mi" sorusunun cevabı bugüne kadar amirin
// aklındaydı. Atandıktan sonra çıkanlar: kişi o gün zaten çalışıyor, izinli,
// dün gece vardiyasından çıkmış (arada dinlenme yok), haftalık 45 saati aşıyor,
// kuralın istediği rolde değil, zorunlu belgesinin süresi dolmuş.
//
// Her kontrol ok / warn / block / unknown döner.
//   block   — atama yapılmamalı (çakışma, izin, süresi dolmuş zorunlu belge)
//   warn    — yapılabilir ama görülmeli (rol farkı, haftalık süre, dinlenme)
//   unknown — ÖLÇÜLEMEDİ. 'ok' sayılmaz; ölçemediğini uygun saymak, kontrolü
//             hiç yapmamaktan daha kötüdür çünkü yapılmış gibi görünür.

const CALISAN = "('scheduled', 'worked', 'overtime')"
const HAFTALIK_SAAT_SINIRI = 45   // İş Kanunu m.63 — haftalık normal çalışma süresi
const DINLENME_SAATI = 11        // ardışık vardiyalar arası asgari dinlenme (operasyon kuralı)

export function saatSayisi(deger) {
  if (deger == null || deger === '') return null
  const metin = String(deger).trim()
  const eslesme = metin.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!eslesme) return null
  const saat = Number(eslesme[1])
  const dakika = Number(eslesme[2] || 0)
  if (saat > 23 || dakika > 59) return null
  return saat + dakika / 60
}

// Gece vardiyası ertesi güne taşar: 22:00-06:00 → 8 saat, 6'ya ertesi gün varılır.
export function vardiyaSuresi(start, end) {
  const b = saatSayisi(start)
  const s = saatSayisi(end)
  if (b == null || s == null) return null
  return s > b ? s - b : (24 - b) + s
}

export function haftaBasi(date) {
  const [y, a, g] = String(date).split('-').map(Number)
  const d = new Date(y, a - 1, g)
  const gun = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (gun - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function gunEkle(date, n) {
  const [y, a, g] = String(date).split('-').map(Number)
  const d = new Date(y, a - 1, g)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function kontrol(key, label, status, detail) {
  return { key, label, status, detail }
}

// Tek kaynak: hem açık vardiya adayları hem uygunluk matrisi bunu kullanır.
export function evaluateSuitability({ staff_id, date, shift_def_id = null, role_id = null } = {}, db = getDB()) {
  const staffId = Number(staff_id)
  const kontroller = []
  const ekle = (...a) => kontroller.push(kontrol(...a))

  const oku = (sql, params, kaynak, varsayilanEtiket) => {
    try {
      return { ok: true, row: db.prepare(sql).get(...params) }
    } catch (err) {
      ekle(kaynak, varsayilanEtiket, 'unknown', `Okunamadı: ${err.message}`)
      return { ok: false, row: null }
    }
  }

  // ── İşten çıkış ───────────────────────────────────────────────────────────
  const personel = oku(
    'SELECT id, full_name, role_id, department_id, exit_date, is_active FROM staff WHERE id = ?',
    [staffId], 'exited', 'İşten çıkış')
  if (personel.ok) {
    const p = personel.row
    if (!p) throw Object.assign(new Error('Personel bulunamadı'), { statusCode: 404 })
    if (p.exit_date && p.exit_date <= date) {
      ekle('exited', 'İşten çıkış', 'block', `${p.exit_date} tarihinde işten ayrılmış`)
    } else if (!p.is_active) {
      ekle('exited', 'İşten çıkış', 'block', 'Personel pasif')
    } else {
      ekle('exited', 'İşten çıkış', 'ok', 'Aktif personel')
    }
  }

  // ── O gün zaten çalışıyor mu ──────────────────────────────────────────────
  const mevcut = oku(`
    SELECT ss.work_date, sd.name AS shift_name
    FROM shift_schedule ss LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date = ? AND ss.status IN ${CALISAN}
  `, [staffId, date], 'already_working', 'Aynı gün çakışma')
  if (mevcut.ok) {
    ekle('already_working', 'Aynı gün çakışma', mevcut.row ? 'block' : 'ok',
      mevcut.row ? `O gün zaten ${mevcut.row.shift_name || 'bir vardiyada'} planlı` : 'O gün boşta')
  }

  // ── İzin ──────────────────────────────────────────────────────────────────
  const izin = oku(`
    SELECT leave_type, start_date, end_date FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
  `, [staffId, date], 'on_leave', 'İzin')
  if (izin.ok) {
    ekle('on_leave', 'İzin', izin.row ? 'block' : 'ok',
      izin.row ? `${izin.row.leave_type} izni (${izin.row.start_date} → ${izin.row.end_date})` : 'O gün izinli değil')
  }

  // ── Dinlenme süresi ───────────────────────────────────────────────────────
  // Dün gece 22-06 çalışıp bugün 08'de başlamak 2 saat dinlenme demektir; bu
  // tek tek bakınca görünmez.
  const yeniVardiya = shift_def_id
    ? oku('SELECT name, start_hour, end_hour FROM shift_definitions WHERE id = ?', [shift_def_id], 'rest_period', 'Dinlenme süresi')
    : { ok: true, row: null }
  const oncekiGun = oku(`
    SELECT sd.name, sd.start_hour, sd.end_hour
    FROM shift_schedule ss JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date = ? AND ss.status IN ${CALISAN}
  `, [staffId, gunEkle(date, -1)], 'rest_period', 'Dinlenme süresi')

  if (yeniVardiya.ok && oncekiGun.ok) {
    if (!shift_def_id) {
      ekle('rest_period', 'Dinlenme süresi', 'unknown', 'Vardiya seçilmeden dinlenme hesaplanamaz')
    } else if (!oncekiGun.row) {
      ekle('rest_period', 'Dinlenme süresi', 'ok', 'Bir önceki gün çalışması yok')
    } else {
      const oncekiBitis = saatSayisi(oncekiGun.row.end_hour)
      const yeniBaslangic = saatSayisi(yeniVardiya.row?.start_hour)
      if (oncekiBitis == null || yeniBaslangic == null) {
        ekle('rest_period', 'Dinlenme süresi', 'unknown', 'Vardiya saatleri okunaklı değil — dinlenme hesaplanamıyor')
      } else {
        const oncekiBaslangic = saatSayisi(oncekiGun.row.start_hour)
        // Gece vardiyası ertesi güne taşarsa bitiş bu günün içindedir.
        const tasiyor = oncekiBaslangic != null && oncekiBitis <= oncekiBaslangic
        const bosluk = tasiyor ? yeniBaslangic - oncekiBitis : (24 - oncekiBitis) + yeniBaslangic
        ekle('rest_period', 'Dinlenme süresi', bosluk < DINLENME_SAATI ? 'warn' : 'ok',
          `Önceki vardiya (${oncekiGun.row.name}) bitişinden bu vardiyaya ${bosluk.toFixed(1)} saat`)
      }
    }
  }

  // ── Haftalık süre ─────────────────────────────────────────────────────────
  const bas = haftaBasi(date)
  const son = gunEkle(bas, 6)
  const haftalik = oku(`
    SELECT COUNT(*) AS gun, SUM(
      CASE WHEN sd.start_hour IS NULL OR sd.end_hour IS NULL THEN NULL ELSE 1 END
    ) AS saatli
    FROM shift_schedule ss LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ? AND ss.status IN ${CALISAN}
  `, [staffId, bas, son], 'weekly_hours', 'Haftalık süre')

  if (haftalik.ok) {
    let toplam = null
    try {
      const satirlar = db.prepare(`
        SELECT sd.start_hour, sd.end_hour
        FROM shift_schedule ss LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
        WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ? AND ss.status IN ${CALISAN}
      `).all(staffId, bas, son)
      const sureler = satirlar.map(r => vardiyaSuresi(r.start_hour, r.end_hour))
      // Bir vardiyanın saati bile okunamıyorsa toplam gerçeği yansıtmaz.
      toplam = sureler.some(s => s == null) ? null : sureler.reduce((t, s) => t + s, 0)
    } catch { toplam = null }

    const yeniSure = yeniVardiya.row ? vardiyaSuresi(yeniVardiya.row.start_hour, yeniVardiya.row.end_hour) : null
    if (toplam == null) {
      ekle('weekly_hours', 'Haftalık süre', 'unknown', 'Vardiya saatleri eksik — haftalık süre hesaplanamıyor')
    } else {
      const sonrasi = toplam + (yeniSure || 0)
      ekle('weekly_hours', 'Haftalık süre', sonrasi > HAFTALIK_SAAT_SINIRI ? 'warn' : 'ok',
        `Bu hafta ${toplam.toFixed(1)} saat${yeniSure ? ` + ${yeniSure} = ${sonrasi.toFixed(1)}` : ''} (sınır ${HAFTALIK_SAAT_SINIRI})`)
    }
  }

  // ── Rol uyumu ─────────────────────────────────────────────────────────────
  if (role_id == null) {
    ekle('role_match', 'Rol uyumu', 'ok', 'Bu vardiya için rol şartı yok')
  } else if (personel.ok && personel.row) {
    const uyum = Number(personel.row.role_id) === Number(role_id)
    let istenen = null
    try { istenen = db.prepare('SELECT name FROM staff_roles WHERE id = ?').get(role_id)?.name } catch { /* rol adı yoksa id yazılır */ }
    ekle('role_match', 'Rol uyumu', uyum ? 'ok' : 'warn',
      uyum ? `Rol uyuyor (${istenen || role_id})` : `Vardiya ${istenen || role_id} rolü istiyor, personel farklı rolde`)
  }

  // ── Belge süresi ──────────────────────────────────────────────────────────
  // Zorunlu belgenin süresi dolmuşsa atama yapılmamalı; "belgesi var" ile
  // "belgesi geçerli" farklı şeyler.
  try {
    const zorunlular = db.prepare(`
      SELECT document_kind, display_name FROM staff_document_requirements
      WHERE is_active = 1
        AND (department_id IS NULL OR department_id = ?)
        AND (role_id IS NULL OR role_id = ?)
        AND requires_expiry = 1
    `).all(personel.row?.department_id ?? null, personel.row?.role_id ?? null)

    if (zorunlular.length === 0) {
      ekle('documents', 'Zorunlu belgeler', 'ok', 'Süreli zorunlu belge tanımı yok')
    } else {
      const suresiDolan = []
      const eksik = []
      zorunlular.forEach(z => {
        const belge = db.prepare(`
          SELECT expires_on FROM documents
          WHERE staff_id = ? AND document_kind = ? AND archived_at IS NULL
          ORDER BY COALESCE(expires_on, '') DESC LIMIT 1
        `).get(staffId, z.document_kind)
        if (!belge) eksik.push(z.display_name || z.document_kind)
        else if (belge.expires_on && belge.expires_on < date) suresiDolan.push(`${z.display_name || z.document_kind} (${belge.expires_on})`)
      })
      if (suresiDolan.length) ekle('documents', 'Zorunlu belgeler', 'block', `Süresi dolmuş: ${suresiDolan.join(', ')}`)
      else if (eksik.length) ekle('documents', 'Zorunlu belgeler', 'warn', `Belge kaydı yok: ${eksik.join(', ')}`)
      else ekle('documents', 'Zorunlu belgeler', 'ok', `${zorunlular.length} zorunlu belge geçerli`)
    }
  } catch (err) {
    ekle('documents', 'Zorunlu belgeler', 'unknown', `Okunamadı: ${err.message}`)
  }

  const engeller = kontroller.filter(k => k.status === 'block')
  const uyarilar = kontroller.filter(k => k.status === 'warn')
  const olculemeyen = kontroller.filter(k => k.status === 'unknown')

  return {
    staff_id: staffId,
    full_name: personel.row?.full_name || null,
    date,
    checks: kontroller,
    blockers: engeller.map(k => k.key),
    warnings: uyarilar.map(k => k.key),
    unknown: olculemeyen.map(k => k.key),
    eligible: engeller.length === 0,
    // Ölçülemeyen kontrol varsa "temiz" denmez; kararı insan versin.
    fully_verified: olculemeyen.length === 0,
  }
}
