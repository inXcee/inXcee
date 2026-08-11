import { getDB } from '../../shared/db/index.js'
import { isoGun } from './dailyOperations.js'
import { ayAralik, isPeriod } from './overtimeBudget.js'

// Faz 13 — Vardiya raporları.
//
// Ay sonunda "ne oldu" sorusunun cevabı parça parça farklı ekranlardaydı;
// hiçbiri planlananla gerçekleşeni yan yana koymuyordu. Burada dönem raporu
// tek çağrıda gelir.
//
// Her bölüm 'measurable' taşır. Ölçülemeyen bölüm SIFIR göstermez — neden
// ölçülemediğini yazar. "0 devamsız" ile "devam kaydı hiç akmıyor" farklı
// şeylerdir ve ikincisi bir eylem gerektirir.

const CALISAN = "('worked', 'overtime')"
const PLANLI = "('scheduled', 'worked', 'overtime')"
const LISTE = 15

function bolum(sql, params, db, donustur) {
  try {
    return { measurable: true, ...donustur(db.prepare(sql).all(...params)) }
  } catch (err) {
    // Sessiz sıfır yerine ölçülemediğini söyle.
    return { measurable: false, reason: `Okunamadı: ${err.message}` }
  }
}

export function buildShiftReport({ period, dept_id = null } = {}, db = getDB()) {
  if (!isPeriod(period)) throw Object.assign(new Error('Geçersiz dönem (YYYY-AA)'), { statusCode: 400 })
  const { start, end } = ayAralik(period)

  const deptKosul = dept_id != null ? 'AND s.department_id = ?' : ''
  const deptParam = dept_id != null ? [Number(dept_id)] : []

  // ── Planlanan / gerçekleşen ───────────────────────────────────────────────
  const planned_vs_actual = bolum(`
    SELECT ss.work_date,
           SUM(CASE WHEN ss.status IN ${PLANLI} THEN 1 ELSE 0 END) AS planlanan,
           SUM(CASE WHEN ss.status IN ${CALISAN} THEN 1 ELSE 0 END) AS gerceklesen,
           SUM(CASE WHEN ss.status = 'absent' THEN 1 ELSE 0 END) AS devamsiz
    FROM shift_schedule ss JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ? ${deptKosul}
    GROUP BY ss.work_date ORDER BY ss.work_date
  `, [start, end, ...deptParam], db, satirlar => {
    const planlanan = satirlar.reduce((t, r) => t + r.planlanan, 0)
    const gerceklesen = satirlar.reduce((t, r) => t + r.gerceklesen, 0)
    return {
      days: satirlar.map(r => ({ date: r.work_date, planned: r.planlanan, actual: r.gerceklesen, absent: r.devamsiz })),
      total_planned: planlanan,
      total_actual: gerceklesen,
      // Plan boşsa oran hesaplanamaz; 0 yazmak "hiç tutmadı" gibi okunurdu.
      realization: planlanan > 0 ? Number((gerceklesen / planlanan).toFixed(3)) : null,
      realization_note: planlanan > 0 ? null : 'Bu dönemde hiç plan girilmemiş — gerçekleşme oranı hesaplanamaz',
    }
  })

  // ── Kapsama başarısı ──────────────────────────────────────────────────────
  // Kural-gün bazında: kaç gün asgari kadro tutmuş.
  let coverage_success
  try {
    const kurallar = db.prepare(`
      SELECT id, name, min_staff, dept_id, shift_def_id, work_location_id, days_of_week
      FROM shift_coverage_rules WHERE is_active = 1
    `).all()
    const gunler = []
    for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
      gunler.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }

    const kuralOzet = []
    let toplamGun = 0
    let tutanGun = 0
    kurallar
      .filter(k => dept_id == null || k.dept_id == null || Number(k.dept_id) === Number(dept_id))
      .forEach(kural => {
        let gecerli = 0
        let tutan = 0
        gunler.forEach(g => {
          if (!String(kural.days_of_week || '').split(',').map(Number).includes(isoGun(g))) return
          gecerli += 1
          const kosul = ['work_date = ?', `status IN ${PLANLI}`]
          const p = [g]
          if (kural.dept_id) { kosul.push('dept_id = ?'); p.push(kural.dept_id) }
          if (kural.shift_def_id) { kosul.push('shift_def_id = ?'); p.push(kural.shift_def_id) }
          if (kural.work_location_id) { kosul.push('work_location_id = ?'); p.push(kural.work_location_id) }
          const atanan = db.prepare(`SELECT COUNT(*) c FROM shift_schedule WHERE ${kosul.join(' AND ')}`).get(...p).c
          if (atanan >= Number(kural.min_staff || 0)) tutan += 1
        })
        if (!gecerli) return
        toplamGun += gecerli
        tutanGun += tutan
        kuralOzet.push({
          rule_id: kural.id, rule_name: kural.name,
          applicable_days: gecerli, met_days: tutan, short_days: gecerli - tutan,
          ratio: Number((tutan / gecerli).toFixed(3)),
        })
      })

    coverage_success = kurallar.length === 0
      // Kural tanımlanmamışsa kapsama "%100" değil, ölçüsüzdür.
      ? { measurable: false, reason: 'Hiç kapsama kuralı tanımlı değil — kapsama başarısı ölçülemez' }
      : {
        measurable: true,
        overall_ratio: toplamGun > 0 ? Number((tutanGun / toplamGun).toFixed(3)) : null,
        rule_days: toplamGun,
        met_days: tutanGun,
        // Sürekli açık kalan noktalar: en çok eksik veren kurallar.
        chronically_short: kuralOzet.filter(k => k.short_days > 0).sort((a, b) => b.short_days - a.short_days).slice(0, LISTE),
      }
  } catch (err) {
    coverage_success = { measurable: false, reason: `Okunamadı: ${err.message}` }
  }

  // ── Devamsızlık ───────────────────────────────────────────────────────────
  const absence = bolum(`
    SELECT ss.staff_id, s.full_name, COUNT(*) AS gun,
           SUM(CASE WHEN ss.absent_reason IS NULL OR ss.absent_reason = '' THEN 1 ELSE 0 END) AS nedensiz
    FROM shift_schedule ss JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status = 'absent' ${deptKosul}
    GROUP BY ss.staff_id ORDER BY gun DESC
  `, [start, end, ...deptParam], db, satirlar => ({
    total_days: satirlar.reduce((t, r) => t + r.gun, 0),
    without_reason: satirlar.reduce((t, r) => t + r.nedensiz, 0),
    people: satirlar.slice(0, LISTE).map(r => ({ staff_id: r.staff_id, full_name: r.full_name, days: r.gun, without_reason: r.nedensiz })),
  }))

  // ── İzin sıralaması ───────────────────────────────────────────────────────
  const leave_ranking = bolum(`
    SELECT l.staff_id, s.full_name, COUNT(*) AS talep, COALESCE(SUM(l.total_days), 0) AS gun
    FROM leave_requests l JOIN staff s ON s.id = l.staff_id
    WHERE l.status = 'approved' AND l.start_date <= ? AND l.end_date >= ? ${deptKosul}
    GROUP BY l.staff_id ORDER BY gun DESC
  `, [end, start, ...deptParam], db, satirlar => ({
    people: satirlar.slice(0, LISTE).map(r => ({ staff_id: r.staff_id, full_name: r.full_name, requests: r.talep, days: r.gun })),
    total_days: satirlar.reduce((t, r) => t + Number(r.gun || 0), 0),
  }))

  // ── Mesai sıralaması ──────────────────────────────────────────────────────
  const overtime_ranking = bolum(`
    SELECT o.staff_id, s.full_name, COUNT(*) AS gun, COALESCE(SUM(o.hours), 0) AS saat
    FROM overtime_records o JOIN staff s ON s.id = o.staff_id
    WHERE o.work_date BETWEEN ? AND ? ${deptKosul}
    GROUP BY o.staff_id ORDER BY saat DESC
  `, [start, end, ...deptParam], db, satirlar => ({
    people: satirlar.slice(0, LISTE).map(r => ({ staff_id: r.staff_id, full_name: r.full_name, days: r.gun, hours: Number(r.saat) })),
    total_hours: Number(satirlar.reduce((t, r) => t + Number(r.saat || 0), 0).toFixed(2)),
  }))

  // ── Proje dağılımı ────────────────────────────────────────────────────────
  // Para cinsinden maliyet HESAPLANMAZ: saatlik ücret sistemde tutulmuyor.
  // Kişi-gün üzerinden vermek, uydurma bir tutar vermekten dürüsttür.
  const project_load = bolum(`
    SELECT COALESCE(p.name, 'Projesiz') AS proje, COUNT(*) AS kisi_gun,
           COUNT(DISTINCT ss.staff_id) AS kisi
    FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE ss.work_date BETWEEN ? AND ? AND ss.status IN ${PLANLI} ${deptKosul}
    GROUP BY proje ORDER BY kisi_gun DESC
  `, [start, end, ...deptParam], db, satirlar => ({
    projects: satirlar.map(r => ({ project: r.proje, person_days: r.kisi_gun, people: r.kisi })),
    cost_note: 'Para cinsinden maliyet hesaplanmıyor — saatlik ücret verisi sistemde tutulmuyor',
  }))

  // ── Onay süreleri ─────────────────────────────────────────────────────────
  const approval_times = bolum(`
    SELECT period, status, created_at, approved_at
    FROM puantaj_period_approvals
    WHERE period <= ? ORDER BY period DESC LIMIT 12
  `, [period], db, satirlar => {
    const olculebilir = satirlar.filter(r => r.created_at && r.approved_at)
    const gunFarki = r => (new Date(r.approved_at) - new Date(r.created_at)) / 86400000
    return {
      periods: satirlar.map(r => ({
        period: r.period, status: r.status,
        days: r.created_at && r.approved_at ? Number(gunFarki(r).toFixed(1)) : null,
      })),
      // Damgası olmayan kayıt ortalamaya karışmaz; kaç tanesi ölçülemedi yazılır.
      average_days: olculebilir.length ? Number((olculebilir.reduce((t, r) => t + gunFarki(r), 0) / olculebilir.length).toFixed(1)) : null,
      unmeasured: satirlar.length - olculebilir.length,
    }
  })

  // ── Ayrılma öncesi eğilim ─────────────────────────────────────────────────
  // Ayrılmadan önceki 60 günde devamsızlık/izin artışı, sonradan bakınca
  // görülebiliyor ama o zaman geç oluyor.
  const pre_exit_trends = bolum(`
    SELECT s.id, s.full_name, s.exit_date,
      (SELECT COUNT(*) FROM shift_schedule x WHERE x.staff_id = s.id AND x.status = 'absent'
        AND x.work_date BETWEEN date(s.exit_date, '-60 day') AND s.exit_date) AS devamsiz,
      (SELECT COUNT(*) FROM leave_requests l WHERE l.staff_id = s.id AND l.status = 'approved'
        AND l.start_date BETWEEN date(s.exit_date, '-60 day') AND s.exit_date) AS izin
    FROM staff s
    WHERE s.exit_date BETWEEN ? AND ? ${deptKosul}
    ORDER BY devamsiz DESC
  `, [start, end, ...deptParam], db, satirlar => ({
    people: satirlar.slice(0, LISTE).map(r => ({
      staff_id: r.id, full_name: r.full_name, exit_date: r.exit_date,
      absences_60d: r.devamsiz, leaves_60d: r.izin,
    })),
    count: satirlar.length,
  }))

  const bolumler = {
    planned_vs_actual, coverage_success, absence, leave_ranking,
    overtime_ranking, project_load, approval_times, pre_exit_trends,
  }

  return {
    period,
    range: { start, end },
    dept_id: dept_id == null ? null : Number(dept_id),
    sections: bolumler,
    // Ölçülemeyen bölüm gizlenirse rapor olduğundan eksiksiz görünür.
    unmeasurable: Object.entries(bolumler)
      .filter(([, v]) => !v.measurable)
      .map(([k, v]) => ({ section: k, reason: v.reason })),
  }
}
