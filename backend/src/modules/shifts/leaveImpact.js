import { getDB } from '../../shared/db/index.js'
import { isIsoDate, isoGun, findReplacements } from './dailyOperations.js'

// Faz 8 — İzin etki analizi.
//
// İzin onayı bugüne kadar tek bir soruya bakarak veriliyordu: "bakiyesi var mı".
// Onaydan sonra ortaya çıkanlar: o gün aynı bölümden üç kişi daha izinli,
// nokta kadrosuz kalıyor, kişinin o günlere zaten vardiyası girilmiş, ve o
// vardiya izin onayıyla sessizce eziliyor.
//
// Burada onay ÖNCESİ görülmesi gerekenler tek çağrıda toplanır. Ölçülemeyen
// kaynak 'unavailable' listesine yazılır; boş sonuç "sorun yok" sayılmaz.

const CALISAN = "('scheduled','worked','overtime')"
const MAX_GUN = 120        // tek istekte taranacak en fazla gün
const LISTE_SINIRI = 25    // liste kırpma sınırı — kırpma her zaman bildirilir

export function gunAraligi(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end)) {
    throw Object.assign(new Error('Geçersiz tarih aralığı'), { statusCode: 400 })
  }
  if (end < start) throw Object.assign(new Error('Bitiş tarihi başlangıçtan önce olamaz'), { statusCode: 400 })
  const gunler = []
  const [y, a, g] = start.split('-').map(Number)
  const imlec = new Date(y, a - 1, g)
  const son = end
  while (gunler.length <= MAX_GUN) {
    const iso = `${imlec.getFullYear()}-${String(imlec.getMonth() + 1).padStart(2, '0')}-${String(imlec.getDate()).padStart(2, '0')}`
    gunler.push(iso)
    if (iso >= son) break
    imlec.setDate(imlec.getDate() + 1)
  }
  if (gunler[gunler.length - 1] < son) {
    throw Object.assign(new Error(`İzin aralığı ${MAX_GUN} günden uzun olamaz`), { statusCode: 400 })
  }
  return gunler
}

function guvenli(db, sql, params, kaynak, sorunlar, tek = false) {
  try {
    const st = db.prepare(sql)
    return tek ? st.get(...params) : st.all(...params)
  } catch (err) {
    sorunlar.push({ source: kaynak, error: err.message })
    return null
  }
}

// Aynı hafta gününe yığılan izin, tek tek bakıldığında görünmeyen bir örüntü.
export function tekrarEdenOruntu(gecmisIzinler, esik = 3) {
  const sayac = {}
  gecmisIzinler.forEach(g => {
    const gun = isoGun(g)
    sayac[gun] = (sayac[gun] || 0) + 1
  })
  const AD = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
  return Object.entries(sayac)
    .filter(([, n]) => n >= esik)
    .map(([gun, n]) => ({ weekday: Number(gun), weekday_name: AD[Number(gun)], count: n }))
    .sort((a, b) => b.count - a.count)
}

export function buildLeaveImpact({ staff_id, start, end, leave_type = 'annual' } = {}, db = getDB()) {
  const staffId = Number(staff_id)
  if (!Number.isFinite(staffId) || staffId <= 0) {
    throw Object.assign(new Error('Geçersiz personel'), { statusCode: 400 })
  }
  const gunler = gunAraligi(start, end)
  const sorunlar = []

  const personel = guvenli(db,
    'SELECT id, full_name, department_id, is_active FROM staff WHERE id = ?', [staffId], 'staff', sorunlar, true)
  if (!personel) throw Object.assign(new Error('Personel bulunamadı'), { statusCode: 404 })

  const yerTutucu = gunler.map(() => '?').join(',')

  // ── 1. Bakiye ─────────────────────────────────────────────────────────────
  // Yıllık izin dışındaki türlerde yıllık bakiye ölçüt DEĞİL; "bakiye yeterli"
  // demek yanıltıcı olurdu.
  let balance = { applicable: leave_type === 'annual', reason: null }
  if (leave_type === 'annual') {
    const yil = Number(String(start).slice(0, 4))
    const bakiye = guvenli(db,
      'SELECT annual_total, annual_used FROM leave_balance WHERE staff_id = ? AND year = ?',
      [staffId, yil], 'leave_balance', sorunlar, true)
    if (bakiye) {
      const toplam = Number(bakiye.annual_total || 0)
      const kullanilan = Number(bakiye.annual_used || 0)
      balance = {
        applicable: true,
        year: yil,
        total: toplam,
        used: kullanilan,
        remaining: toplam - kullanilan,
        requested: gunler.length,
        after: toplam - kullanilan - gunler.length,
        sufficient: toplam - kullanilan >= gunler.length,
      }
    } else {
      balance = { applicable: true, year: yil, known: false, reason: 'Bu yıl için bakiye kaydı yok — hak ediş hesaplanmamış' }
    }
  } else {
    balance.reason = `${leave_type} türünde yıllık bakiye ölçüt değil`
  }

  // ── 2. Çakışan vardiyalar ─────────────────────────────────────────────────
  // İzin onayı bu kayıtları ezer; onaydan ÖNCE görülmeli.
  const cakisan = guvenli(db, `
    SELECT ss.work_date, ss.status, sd.name AS shift_name, w.name AS location_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    LEFT JOIN work_locations w ON w.id = ss.work_location_id
    WHERE ss.staff_id = ? AND ss.work_date IN (${yerTutucu}) AND ss.status IN ${CALISAN}
    ORDER BY ss.work_date
  `, [staffId, ...gunler], 'shift_schedule', sorunlar) || []

  // ── 3. Aynı gün izinliler (aynı bölüm) ────────────────────────────────────
  const ayniGun = guvenli(db, `
    SELECT l.start_date, l.end_date, s.full_name
    FROM leave_requests l JOIN staff s ON s.id = l.staff_id
    WHERE l.status = 'approved' AND l.staff_id != ?
      AND ${personel.department_id ? 's.department_id = ?' : '1=1'}
      AND l.start_date <= ? AND l.end_date >= ?
  `, personel.department_id
    ? [staffId, personel.department_id, gunler[gunler.length - 1], gunler[0]]
    : [staffId, gunler[gunler.length - 1], gunler[0]],
  'leave_requests', sorunlar) || []

  const same_day_leaves = gunler.map(g => ({
    date: g,
    names: ayniGun.filter(i => i.start_date <= g && i.end_date >= g).map(i => i.full_name),
  })).filter(x => x.names.length > 0)

  // ── 4. Kapsama kaybı ──────────────────────────────────────────────────────
  // Kişi bugün bir kuralın kadrosunu dolduruyorsa, izinle o kural açığa düşebilir.
  const coverage_loss = []
  const kurallar = guvenli(db, `
    SELECT r.id, r.name, r.min_staff, r.dept_id, r.shift_def_id, r.work_location_id, r.days_of_week,
           s.name AS shift_name, w.name AS location_name
    FROM shift_coverage_rules r
    LEFT JOIN shift_definitions s ON s.id = r.shift_def_id
    LEFT JOIN work_locations w ON w.id = r.work_location_id
    WHERE r.is_active = 1
  `, [], 'shift_coverage_rules', sorunlar) || []

  gunler.forEach(g => {
    const gunNo = isoGun(g)
    kurallar
      .filter(k => String(k.days_of_week || '').split(',').map(Number).includes(gunNo))
      .forEach(kural => {
        const kosullar = ['ss.work_date = ?', `ss.status IN ${CALISAN}`]
        const params = [g]
        if (kural.dept_id) { kosullar.push('ss.dept_id = ?'); params.push(kural.dept_id) }
        if (kural.shift_def_id) { kosullar.push('ss.shift_def_id = ?'); params.push(kural.shift_def_id) }
        if (kural.work_location_id) { kosullar.push('ss.work_location_id = ?'); params.push(kural.work_location_id) }

        const simdi = guvenli(db, `SELECT COUNT(*) c FROM shift_schedule ss WHERE ${kosullar.join(' AND ')}`,
          params, `coverage_rule:${kural.id}`, sorunlar, true)
        if (!simdi) return
        const bu = guvenli(db, `SELECT COUNT(*) c FROM shift_schedule ss WHERE ${kosullar.join(' AND ')} AND ss.staff_id = ?`,
          [...params, staffId], `coverage_rule:${kural.id}`, sorunlar, true)
        if (!bu?.c) return   // kişi bu kuralı doldurmuyor, izni kuralı etkilemez

        const gerekli = Number(kural.min_staff || 0)
        const sonra = simdi.c - bu.c
        if (sonra < gerekli) {
          coverage_loss.push({
            date: g,
            rule_id: kural.id,
            rule_name: kural.name,
            shift_name: kural.shift_name || null,
            location: kural.location_name || null,
            required: gerekli,
            before: simdi.c,
            after: sonra,
            missing: gerekli - sonra,
          })
        }
      })
  })

  // ── 5. Yerine çağrılabilecekler (ilk gün için) ────────────────────────────
  let replacements = { available: false, reason: 'Hesaplanamadı', items: [] }
  try {
    const r = findReplacements({ date: gunler[0], department_id: personel.department_id, limit: 10 }, db)
    replacements = { available: true, date: gunler[0], items: r.items || [] }
  } catch (err) {
    sorunlar.push({ source: 'replacements', error: err.message })
    replacements = { available: false, reason: err.message, items: [] }
  }

  // ── 6. Mesai etkisi ───────────────────────────────────────────────────────
  const mesai = guvenli(db, `
    SELECT work_date, hours FROM overtime_records
    WHERE staff_id = ? AND work_date IN (${yerTutucu})
  `, [staffId, ...gunler], 'overtime_records', sorunlar) || []

  // ── 7. Yıl sonu tahmini ───────────────────────────────────────────────────
  // Onaylı gelecek izinler + bu talep birlikte hesaplanır; tek tek bakınca
  // bakiye yetiyormuş gibi görünüp yıl sonunda açık veriyor.
  const yilSonu = guvenli(db, `
    SELECT COALESCE(SUM(total_days), 0) AS gun FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND leave_type = 'annual' AND start_date > ?
  `, [staffId, end], 'leave_requests', sorunlar, true)

  const year_end_forecast = (balance.applicable && balance.remaining != null && yilSonu)
    ? {
      known: true,
      remaining_now: balance.remaining,
      this_request: gunler.length,
      other_approved_future: Number(yilSonu.gun || 0),
      projected: balance.remaining - gunler.length - Number(yilSonu.gun || 0),
    }
    : { known: false, reason: 'Bakiye kaydı olmadan yıl sonu tahmini yapılamaz' }

  // ── 8. Tekrar eden örüntü ─────────────────────────────────────────────────
  const gecmis = guvenli(db, `
    SELECT start_date FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND start_date < ?
    ORDER BY start_date DESC LIMIT 40
  `, [staffId, start], 'leave_requests', sorunlar) || []
  const recurring_pattern = tekrarEdenOruntu(gecmis.map(g => g.start_date))

  const kirp = (liste) => ({
    items: liste.slice(0, LISTE_SINIRI),
    truncated: Math.max(0, liste.length - LISTE_SINIRI),
  })

  const uyarilar = []
  if (balance.applicable && balance.sufficient === false) uyarilar.push('Yıllık izin bakiyesi yetersiz')
  if (coverage_loss.length) uyarilar.push(`${coverage_loss.length} noktada kadro asgarinin altına düşüyor`)
  if (cakisan.length) uyarilar.push(`${cakisan.length} günde girilmiş vardiya izinle ezilecek`)
  if (mesai.length) uyarilar.push(`${mesai.length} günde fazla mesai kaydı var`)
  if (year_end_forecast.known && year_end_forecast.projected < 0) uyarilar.push('Yıl sonunda bakiye açığa düşüyor')

  return {
    staff: { id: personel.id, full_name: personel.full_name, department_id: personel.department_id },
    range: { start, end, days: gunler.length },
    leave_type,
    balance,
    conflicting_shifts: kirp(cakisan),
    same_day_leaves: kirp(same_day_leaves),
    coverage_loss: kirp(coverage_loss),
    replacements,
    overtime_effect: kirp(mesai),
    year_end_forecast,
    recurring_pattern,
    warnings: uyarilar,
    // Ölçülemeyen kaynak gizlenirse boş sonuç "etki yok" sanılır.
    unavailable: sorunlar,
  }
}
