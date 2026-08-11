import { getDB } from '../../shared/db/index.js'
import { isIsoDate } from './dailyOperations.js'

// Faz 14 — Modüller arası bağlar.
//
// Vardiya, servis ve yemekhane aynı insanları konuşuyor ama birbirine hiç
// bakmıyordu. Sonuç: çizelgede olan kişi servise yazılmamış (sabah gelemiyor),
// servise yazılan kişi o gün çalışmıyor (boş koltuk), yemek sayısı çizelgeden
// bağımsız veriliyor.
//
// Her bağ 'measurable' taşır. Kaynak yoksa SIFIR gösterilmez — "0 eksik" ile
// "servis modülü o gün hiç kullanılmamış" bambaşka şeylerdir.

const CALISAN = "('scheduled', 'worked', 'overtime')"
const LISTE = 20

function kirp(liste) {
  return { items: liste.slice(0, LISTE), truncated: Math.max(0, liste.length - LISTE) }
}

export function buildCrossModuleLinks({ date } = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })

  // ── Çizelge (tüm bağların ortak tabanı) ───────────────────────────────────
  let calisanlar
  try {
    calisanlar = db.prepare(`
      SELECT ss.staff_id, s.full_name, s.pickup_point_id, sd.name AS shift_name
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ss.work_date = ? AND ss.status IN ${CALISAN}
    `).all(date)
  } catch (err) {
    // Taban okunamıyorsa hiçbir bağ ölçülemez; tek tek "0" demek yanıltıcı olur.
    return {
      date,
      links: {
        transport: { measurable: false, reason: `Çizelge okunamadı: ${err.message}` },
        meals: { measurable: false, reason: `Çizelge okunamadı: ${err.message}` },
        attendance: { measurable: false, reason: `Çizelge okunamadı: ${err.message}` },
        combined_risk: { measurable: false, reason: `Çizelge okunamadı: ${err.message}` },
        exited_future: { measurable: false, reason: `Çizelge okunamadı: ${err.message}` },
      },
      unmeasurable: ['transport', 'meals', 'attendance', 'combined_risk', 'exited_future'],
    }
  }

  const calisanIds = new Set(calisanlar.map(c => c.staff_id))
  const adlar = new Map(calisanlar.map(c => [c.staff_id, c.full_name]))

  // ── Vardiya ↔ Servis ──────────────────────────────────────────────────────
  let transport
  try {
    const atamalar = db.prepare(`
      SELECT a.staff_id, a.status, a.boarded_at, s.full_name, t.direction, t.status AS trip_status
      FROM transport_trip_assignments a
      JOIN transport_trips t ON t.id = a.trip_id
      LEFT JOIN staff s ON s.id = a.staff_id
      WHERE t.work_date = ? AND t.status != 'cancelled'
    `).all(date)

    if (atamalar.length === 0) {
      // Servis o gün hiç planlanmamışsa "herkes eksik" demek yanlış olurdu.
      transport = {
        measurable: false,
        reason: 'Bu güne servis seferi/ataması girilmemiş — vardiya-servis eşleşmesi ölçülemez',
      }
    } else {
      const servisliler = new Set(atamalar.map(a => a.staff_id))
      const servissizCalisan = calisanlar.filter(c => !servisliler.has(c.staff_id))
        .map(c => ({ staff_id: c.staff_id, full_name: c.full_name, shift_name: c.shift_name }))
      const calismayanServisli = [...new Set(atamalar.filter(a => !calisanIds.has(a.staff_id)).map(a => a.staff_id))]
        .map(id => ({ staff_id: id, full_name: atamalar.find(a => a.staff_id === id)?.full_name || null }))

      transport = {
        measurable: true,
        working: calisanlar.length,
        assigned: servisliler.size,
        // Çizelgede var, servise yazılmamış → sabah gelemeyebilir.
        working_without_transport: kirp(servissizCalisan),
        // Servise yazılı ama o gün çalışmıyor → boş koltuk.
        transport_without_shift: kirp(calismayanServisli),
        boarded_tracked: atamalar.some(a => a.boarded_at),
      }
    }
  } catch (err) {
    transport = { measurable: false, reason: `Servis kaynağı okunamadı: ${err.message}` }
  }

  // ── Vardiya ↔ Yemek ───────────────────────────────────────────────────────
  let meals
  try {
    const secimler = db.prepare(`
      SELECT staff_id, meal_type, attending FROM meal_selections WHERE meal_date = ?
    `).all(date)

    if (secimler.length === 0) {
      meals = {
        measurable: false,
        reason: 'Bu güne yemek seçimi girilmemiş — çalışan sayısı ile yemek ihtiyacı karşılaştırılamaz',
        working: calisanlar.length,
      }
    } else {
      const turler = {}
      secimler.forEach(s => {
        const t = s.meal_type || 'belirsiz'
        turler[t] = turler[t] || { selected: 0, attending: 0 }
        turler[t].selected += 1
        if (s.attending) turler[t].attending += 1
      })
      const secenler = new Set(secimler.map(s => s.staff_id))
      meals = {
        measurable: true,
        working: calisanlar.length,
        by_type: Object.entries(turler).map(([type, v]) => ({ type, ...v, gap: calisanlar.length - v.attending })),
        // Çalışıyor ama yemek seçimi yapmamış: sayım eksik çıkar.
        working_without_selection: kirp(
          calisanlar.filter(c => !secenler.has(c.staff_id)).map(c => ({ staff_id: c.staff_id, full_name: c.full_name }))
        ),
      }
    }
  } catch (err) {
    meals = { measurable: false, reason: `Yemek kaynağı okunamadı: ${err.message}` }
  }

  // ── Turnike → devam kanıtı ────────────────────────────────────────────────
  let attendance
  try {
    const toplam = db.prepare('SELECT COUNT(*) c FROM attendance_logs').get().c
    attendance = toplam === 0
      // Canlıda bu kaynak boş; "0 devamsız" demek en tehlikeli sessiz sıfır.
      ? { measurable: false, reason: 'Turnike/kart kaydı sisteme hiç akmıyor — devam kanıtı ölçülemez', source_rows: 0 }
      : {
        measurable: true,
        source_rows: toplam,
        with_evidence: db.prepare(`
          SELECT COUNT(*) c FROM attendance_logs a
          JOIN shift_schedule ss ON ss.id = a.shift_schedule_id
          WHERE ss.work_date = ?
        `).get(date).c,
        working: calisanlar.length,
      }
  } catch (err) {
    attendance = { measurable: false, reason: `Devam kaynağı okunamadı: ${err.message}` }
  }

  // ── Servise binmeme + gelmeme = birleşik risk ─────────────────────────────
  // İki sinyalin kesişimi tek tek bakınca görünmüyor.
  let combined_risk
  if (!transport.measurable) {
    combined_risk = { measurable: false, reason: `Servis tarafı ölçülemediği için birleşik risk hesaplanamaz (${transport.reason})` }
  } else {
    try {
      const binmeyenler = db.prepare(`
        SELECT a.staff_id FROM transport_trip_assignments a
        JOIN transport_trips t ON t.id = a.trip_id
        WHERE t.work_date = ? AND t.status != 'cancelled' AND a.boarded_at IS NULL
      `).all(date).map(r => r.staff_id)

      const devamsizlar = db.prepare(`
        SELECT staff_id FROM shift_schedule WHERE work_date = ? AND status = 'absent'
      `).all(date).map(r => r.staff_id)

      const kesisim = binmeyenler.filter(id => devamsizlar.includes(id))
      combined_risk = {
        measurable: true,
        not_boarded: binmeyenler.length,
        absent: devamsizlar.length,
        both: kirp(kesisim.map(id => ({ staff_id: id, full_name: adlar.get(id) || null }))),
      }
    } catch (err) {
      combined_risk = { measurable: false, reason: `Birleşik risk okunamadı: ${err.message}` }
    }
  }

  // ── İşten çıkış → gelecek vardiya ─────────────────────────────────────────
  let exited_future
  try {
    const satirlar = db.prepare(`
      SELECT ss.staff_id, s.full_name, s.exit_date, MIN(ss.work_date) AS ilk_gun, COUNT(*) AS gun
      FROM shift_schedule ss JOIN staff s ON s.id = ss.staff_id
      WHERE s.exit_date IS NOT NULL AND ss.work_date > s.exit_date AND ss.status IN ${CALISAN}
      GROUP BY ss.staff_id ORDER BY ilk_gun
    `).all()
    exited_future = {
      measurable: true,
      // Ayrılmış kişinin gelecek vardiyası çizelgede kaldıysa kadro yanlış sayılır.
      people: kirp(satirlar.map(r => ({
        staff_id: r.staff_id, full_name: r.full_name, exit_date: r.exit_date,
        first_shift: r.ilk_gun, days: r.gun,
      }))),
      count: satirlar.length,
    }
  } catch (err) {
    exited_future = { measurable: false, reason: `Çıkış kontrolü okunamadı: ${err.message}` }
  }

  const links = { transport, meals, attendance, combined_risk, exited_future }

  return {
    date,
    links,
    // Ölçülemeyen bağ gizlenirse "her şey uyumlu" sanılır.
    unmeasurable: Object.entries(links).filter(([, v]) => !v.measurable).map(([k]) => k),
  }
}
