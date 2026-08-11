import { getDB } from '../../shared/db/index.js'
import { isIsoDate, isoGun } from './dailyOperations.js'
import { evaluateSuitability, gunEkle, haftaBasi } from './suitability.js'

// Faz 12 — Akıllı planlama ve senaryolar.
//
// Boş kalan noktaya kimi koyacağına amir hafızasıyla karar veriyordu; sonuç
// hep aynı birkaç kişiye yığılıyordu (gece hep aynı üç kişide, hafta sonu hep
// aynı kişide). Burada üç ayrı önceliğe göre öneri üretilir ve üçü yan yana
// karşılaştırılır:
//
//   coverage — açığı kapatmak esas: rol uyumu ve az uyarı önde
//   fairness — yük dağılımı esas: son 14 günde az çalışan, az gece yapan önde
//   cost     — maliyet esas: haftalık süresi düşük olan (mesaiye girmeyecek) önde
//
// Öneri KARAR DEĞİLDİR: her adayın puanı gerekçe kalemleriyle birlikte döner,
// atamayı insan yapar. Engelli kişi öneriye hiç girmez ama sayısı raporlanır —
// "aday yok" ile "adaylar engelli" farklı şeylerdir.

const CALISAN = "('scheduled', 'worked', 'overtime')"
const ADAY_SINIRI = 60      // bir açık için değerlendirilecek en fazla personel
const ONERI_SAYISI = 5      // açık başına döndürülen öneri sayısı

export const STRATEJILER = ['coverage', 'fairness', 'cost']

// Puan 0-100; yüksek olan daha uygun. Her kalem gerekçesiyle döner ki
// "neden bu kişi" sorusu cevapsız kalmasın.
export function adayPuani(strateji, olcum) {
  const { warnings = 0, roleMatch = false, son14Gun = 0, geceSayisi = 0, haftaSonu = 0, haftalikSaat = 0 } = olcum
  const kalemler = []
  let puan = 50

  const uygula = (delta, aciklama) => { puan += delta; if (delta) kalemler.push({ delta, aciklama }) }

  uygula(-warnings * 8, warnings ? `${warnings} uyarı` : '')

  if (strateji === 'coverage') {
    uygula(roleMatch ? 25 : 0, roleMatch ? 'rol uyuyor' : '')
    uygula(-son14Gun, son14Gun ? `son 14 günde ${son14Gun} vardiya` : '')
  } else if (strateji === 'fairness') {
    uygula(-son14Gun * 3, son14Gun ? `son 14 günde ${son14Gun} vardiya` : '')
    uygula(-geceSayisi * 4, geceSayisi ? `son 14 günde ${geceSayisi} gece` : '')
    uygula(-haftaSonu * 3, haftaSonu ? `son 14 günde ${haftaSonu} hafta sonu` : '')
    uygula(roleMatch ? 8 : 0, roleMatch ? 'rol uyuyor' : '')
  } else {
    // cost: haftalık süresi yükseldikçe mesai riski artar
    uygula(-Math.max(0, haftalikSaat - 30), haftalikSaat > 30 ? `bu hafta ${haftalikSaat} saat` : '')
    uygula(roleMatch ? 10 : 0, roleMatch ? 'rol uyuyor' : '')
  }

  return { score: Math.max(0, Math.min(100, Math.round(puan))), reasons: kalemler.filter(k => k.aciklama) }
}

function gecmisOlcum(db, staffId, date) {
  const bas = gunEkle(date, -14)
  const satirlar = db.prepare(`
    SELECT ss.work_date, sd.start_hour, sd.end_hour
    FROM shift_schedule ss LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
    WHERE ss.staff_id = ? AND ss.work_date BETWEEN ? AND ? AND ss.status IN ${CALISAN}
  `).all(staffId, bas, gunEkle(date, -1))

  const geceSayisi = satirlar.filter(r => {
    const b = Number(String(r.start_hour || '').slice(0, 2))
    return Number.isFinite(b) && (b >= 20 || b < 6)
  }).length
  const haftaSonu = satirlar.filter(r => isoGun(r.work_date) >= 6).length

  const haftaBas = haftaBasi(date)
  const haftalik = db.prepare(`
    SELECT COUNT(*) c FROM shift_schedule
    WHERE staff_id = ? AND work_date BETWEEN ? AND ? AND status IN ${CALISAN}
  `).get(staffId, haftaBas, gunEkle(haftaBas, 6)).c

  return { son14Gun: satirlar.length, geceSayisi, haftaSonu, haftalikVardiya: haftalik }
}

export function buildPlanningSuggestions({ date, strategy = 'coverage', dept_id = null } = {}, db = getDB()) {
  if (!isIsoDate(date)) throw Object.assign(new Error('Geçersiz tarih'), { statusCode: 400 })
  if (!STRATEJILER.includes(strategy)) throw Object.assign(new Error('Geçersiz strateji'), { statusCode: 400 })
  const sorunlar = []

  // ── Açıklar ───────────────────────────────────────────────────────────────
  let kurallar = []
  try {
    const gun = isoGun(date)
    kurallar = db.prepare(`
      SELECT r.id, r.name, r.min_staff, r.dept_id, r.role_id, r.shift_def_id, r.work_location_id,
             s.name AS shift_name, w.name AS location_name
      FROM shift_coverage_rules r
      LEFT JOIN shift_definitions s ON s.id = r.shift_def_id
      LEFT JOIN work_locations w ON w.id = r.work_location_id
      WHERE r.is_active = 1 AND (',' || r.days_of_week || ',') LIKE ?
    `).all(`%,${gun},%`)
  } catch (err) {
    sorunlar.push({ source: 'shift_coverage_rules', error: err.message })
  }

  const oncebellek = new Map()
  const gaps = []

  kurallar.forEach(kural => {
    if (dept_id != null && kural.dept_id != null && Number(kural.dept_id) !== Number(dept_id)) return

    const kosullar = ['ss.work_date = ?', `ss.status IN ${CALISAN}`]
    const params = [date]
    if (kural.dept_id) { kosullar.push('ss.dept_id = ?'); params.push(kural.dept_id) }
    if (kural.shift_def_id) { kosullar.push('ss.shift_def_id = ?'); params.push(kural.shift_def_id) }
    if (kural.work_location_id) { kosullar.push('ss.work_location_id = ?'); params.push(kural.work_location_id) }

    let atanan
    try {
      atanan = db.prepare(`SELECT COUNT(*) c FROM shift_schedule ss WHERE ${kosullar.join(' AND ')}`).get(...params).c
    } catch (err) {
      sorunlar.push({ source: `coverage_rule:${kural.id}`, error: err.message })
      return
    }
    const gerekli = Number(kural.min_staff || 0)
    if (atanan >= gerekli) return

    // ── Aday havuzu ─────────────────────────────────────────────────────────
    let havuz = []
    try {
      const kosul = ['s.is_active = 1']
      const p = []
      if (kural.dept_id) { kosul.push('s.department_id = ?'); p.push(kural.dept_id) }
      havuz = db.prepare(`
        SELECT s.id, s.full_name, s.role_id, d.name AS dept_name, r.name AS role_name
        FROM staff s
        LEFT JOIN departments d ON d.id = s.department_id
        LEFT JOIN staff_roles r ON r.id = s.role_id
        WHERE ${kosul.join(' AND ')}
        ORDER BY s.full_name
        LIMIT ${ADAY_SINIRI + 1}
      `).all(...p)
    } catch (err) {
      sorunlar.push({ source: 'staff', error: err.message })
      return
    }
    const havuzKirpildi = havuz.length > ADAY_SINIRI
    if (havuzKirpildi) havuz = havuz.slice(0, ADAY_SINIRI)

    let engelli = 0
    const adaylar = []
    havuz.forEach(kisi => {
      const anahtar = `${kisi.id}|${kural.shift_def_id}|${kural.work_location_id}|${kural.role_id}`
      let u = oncebellek.get(anahtar)
      if (!u) {
        try {
          u = evaluateSuitability({
            staff_id: kisi.id, date,
            shift_def_id: kural.shift_def_id, role_id: kural.role_id, work_location_id: kural.work_location_id,
          }, db)
        } catch (err) {
          sorunlar.push({ source: `suitability:${kisi.id}`, error: err.message })
          return
        }
        oncebellek.set(anahtar, u)
      }
      if (!u.eligible) { engelli += 1; return }

      const gecmis = gecmisOlcum(db, kisi.id, date)
      const haftalikSaatKontrol = u.checks.find(c => c.key === 'weekly_hours')
      const saat = Number(String(haftalikSaatKontrol?.detail || '').match(/Bu hafta ([\d.]+) saat/)?.[1] || 0)

      const { score, reasons } = adayPuani(strategy, {
        warnings: u.warnings.length,
        roleMatch: kural.role_id == null || Number(kisi.role_id) === Number(kural.role_id),
        son14Gun: gecmis.son14Gun,
        geceSayisi: gecmis.geceSayisi,
        haftaSonu: gecmis.haftaSonu,
        haftalikSaat: saat,
      })

      adaylar.push({
        staff_id: kisi.id,
        full_name: kisi.full_name,
        dept_name: kisi.dept_name,
        role_name: kisi.role_name,
        score,
        reasons,
        warnings: u.warnings,
        // Ölçülemeyen kontrolü olan aday sessizce "temiz" görünmemeli.
        fully_verified: u.fully_verified,
        history: gecmis,
      })
    })

    adaylar.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name, 'tr'))

    gaps.push({
      rule_id: kural.id,
      rule_name: kural.name,
      shift_name: kural.shift_name || null,
      location: kural.location_name || null,
      required: gerekli,
      assigned: atanan,
      missing: gerekli - atanan,
      candidates: adaylar.slice(0, ONERI_SAYISI),
      candidate_pool: adaylar.length,
      blocked_count: engelli,
      // Havuz kırpıldıysa liste tam sanılmamalı.
      pool_truncated: havuzKirpildi ? ADAY_SINIRI : null,
    })
  })

  return {
    date,
    strategy,
    gaps,
    summary: {
      gaps: gaps.length,
      missing_total: gaps.reduce((t, g) => t + g.missing, 0),
      fillable: gaps.filter(g => g.candidates.length >= g.missing).length,
      // Aday yok ile adaylar engelli farklı şeylerdir.
      no_candidate: gaps.filter(g => g.candidates.length === 0).length,
    },
    unavailable: sorunlar,
  }
}

// Üç strateji yan yana: hangisi kaç açığı kapatıyor, yükü nasıl dağıtıyor.
export function comparePlanningScenarios({ date, dept_id = null } = {}, db = getDB()) {
  const senaryolar = STRATEJILER.map(strateji => {
    const s = buildPlanningSuggestions({ date, strategy: strateji, dept_id }, db)
    const secilen = s.gaps.flatMap(g => g.candidates.slice(0, g.missing).map(c => ({ ...c, rule_id: g.rule_id })))
    const kisiler = new Set(secilen.map(c => c.staff_id))
    return {
      strategy: strateji,
      fills: secilen.length,
      remaining: s.summary.missing_total - secilen.length,
      distinct_people: kisiler.size,
      // Aynı kişiye birden çok açık düşerse yük yığılıyor demektir.
      stacked: secilen.length - kisiler.size,
      avg_recent_shifts: secilen.length
        ? Number((secilen.reduce((t, c) => t + (c.history?.son14Gun || 0), 0) / secilen.length).toFixed(1))
        : null,
      unverified: secilen.filter(c => !c.fully_verified).length,
      picks: secilen.map(c => ({ rule_id: c.rule_id, staff_id: c.staff_id, full_name: c.full_name, score: c.score })),
    }
  })

  const enCokDolduran = senaryolar.reduce((a, b) => (b.fills > a.fills ? b : a))
  const enDengeli = senaryolar
    .filter(s => s.avg_recent_shifts != null)
    .reduce((a, b) => (b.avg_recent_shifts < a.avg_recent_shifts ? b : a), senaryolar[0])

  return {
    date,
    scenarios: senaryolar,
    recommendation: {
      most_filled: enCokDolduran.strategy,
      most_balanced: enDengeli?.avg_recent_shifts == null ? null : enDengeli.strategy,
      // Öneri karar değildir; hangi ölçüte göre önerildiği yazılır.
      note: 'Öneri karar değildir — "en çok dolduran" kapsamayı, "en dengeli" yük dağılımını önceler.',
    },
  }
}

// Adalet analizi: yük kime yığılmış.
export function fairnessReport({ start, end, dept_id = null } = {}, db = getDB()) {
  if (!isIsoDate(start) || !isIsoDate(end)) {
    throw Object.assign(new Error('Geçersiz tarih aralığı'), { statusCode: 400 })
  }
  const kosul = ['ss.work_date BETWEEN ? AND ?', `ss.status IN ${CALISAN}`]
  const params = [start, end]
  if (dept_id != null) { kosul.push('s.department_id = ?'); params.push(Number(dept_id)) }

  let satirlar
  try {
    satirlar = db.prepare(`
      SELECT ss.staff_id, ss.work_date, s.full_name, sd.start_hour
      FROM shift_schedule ss
      JOIN staff s ON s.id = ss.staff_id
      LEFT JOIN shift_definitions sd ON sd.id = ss.shift_def_id
      WHERE ${kosul.join(' AND ')}
    `).all(...params)
  } catch (err) {
    return { start, end, available: false, reason: `Çizelge okunamadı: ${err.message}`, people: [] }
  }

  const harita = new Map()
  satirlar.forEach(r => {
    const o = harita.get(r.staff_id) || { staff_id: r.staff_id, full_name: r.full_name, shifts: 0, nights: 0, weekends: 0 }
    o.shifts += 1
    const b = Number(String(r.start_hour || '').slice(0, 2))
    if (Number.isFinite(b) && (b >= 20 || b < 6)) o.nights += 1
    if (isoGun(r.work_date) >= 6) o.weekends += 1
    harita.set(r.staff_id, o)
  })

  const kisiler = [...harita.values()].sort((a, b) => b.shifts - a.shifts)
  if (kisiler.length === 0) {
    // Boş dönem "adalet sağlanmış" demek değildir.
    return { start, end, available: true, measurable: false, reason: 'Bu aralıkta çizelge kaydı yok', people: [] }
  }

  const olcu = (alan) => {
    const dizi = kisiler.map(k => k[alan]).sort((a, b) => a - b)
    const ortanca = dizi.length % 2 ? dizi[(dizi.length - 1) / 2] : (dizi[dizi.length / 2 - 1] + dizi[dizi.length / 2]) / 2
    const enYuksek = dizi[dizi.length - 1]
    return {
      median: ortanca,
      max: enYuksek,
      min: dizi[0],
      max_to_median: ortanca > 0 ? Number((enYuksek / ortanca).toFixed(2)) : null,
    }
  }

  return {
    start,
    end,
    available: true,
    measurable: true,
    people: kisiler.slice(0, 30),
    distribution: { shifts: olcu('shifts'), nights: olcu('nights'), weekends: olcu('weekends') },
    // Gece hep aynı kişilere düşüyorsa bu tek başına görünmez.
    night_concentration: kisiler.filter(k => k.nights > 0).length
      ? Number((kisiler.filter(k => k.nights > 0).slice(0, 3).reduce((t, k) => t + k.nights, 0)
        / kisiler.reduce((t, k) => t + k.nights, 0) || 0).toFixed(2))
      : null,
  }
}
