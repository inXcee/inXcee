import { getDB } from '../../shared/db/index.js'

// Faz 9 — Fazla mesai zinciri ve bütçe.
//
// Mesai zinciri: ihtiyaç → ön onay → fiilî çalışma → doğrulama → puantaj.
// Canlıda zincirin iki ucu birbirini tutmuyordu ve bu hiçbir yerde görünmüyordu:
//   • onaylı ön onay var, fiilî kayıt hiç girilmemiş (iş yapıldı mı belirsiz)
//   • kayıt var, ön onayı yok (yetkisiz mesai — bordroya öyle gidiyor)
//   • ön onay 4 saat, kayıt 8 saat (fark kimseye sorulmamış)
//
// Bütçe tarafında: onay bir tavana karşı verilmiyordu. Ay sonunda toplam
// görülüyor, o noktada geri alınacak bir şey kalmıyordu.
//
// Bütçe TANIMSIZSA "0 bütçe" denmez — 'known: false' döner. Tanımsız tavanı
// aşılmış saymak, tavan koymuş gibi davranmak olurdu.

const SAAT_TOLERANS = 0.01   // kayan nokta karşılaştırma payı

export function isPeriod(v) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''))
}

export function ayAralik(period) {
  if (!isPeriod(period)) throw Object.assign(new Error('Geçersiz dönem (YYYY-AA)'), { statusCode: 400 })
  const [y, a] = period.split('-').map(Number)
  const sonGun = new Date(y, a, 0).getDate()
  return { start: `${period}-01`, end: `${period}-${String(sonGun).padStart(2, '0')}`, days: sonGun }
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

// Aya özel tavan varsayılanı ezer; departman/proje tavanı global'i ezer.
export function cozulmusButce(satirlar, { period, dept_id, project_id }) {
  const sec = (scope, id) => satirlar.find(b => b.scope === scope && (b.scope_id ?? null) === (id ?? null) && b.period === period)
    || satirlar.find(b => b.scope === scope && (b.scope_id ?? null) === (id ?? null) && !b.period)

  return (dept_id != null && sec('department', Number(dept_id)))
    || (project_id != null && sec('project', Number(project_id)))
    || sec('global', null)
    || null
}

// Dağılım adaleti: en çok mesai alan kişi ortancanın kaç katı.
export function dagilimAdaleti(saatler) {
  const dolu = saatler.filter(s => s > 0).sort((a, b) => a - b)
  if (dolu.length === 0) return { known: false, reason: 'Bu dönemde hiç mesai kaydı yok' }
  const ortanca = dolu.length % 2
    ? dolu[(dolu.length - 1) / 2]
    : (dolu[dolu.length / 2 - 1] + dolu[dolu.length / 2]) / 2
  const enYuksek = dolu[dolu.length - 1]
  return {
    known: true,
    people_with_overtime: dolu.length,
    median: ortanca,
    max: enYuksek,
    // Ortanca 0 olamaz (dolu listesi sıfırları eliyor), bölme güvenli.
    max_to_median: Number((enYuksek / ortanca).toFixed(2)),
  }
}

export function buildOvertimeOverview({ period, dept_id = null, project_id = null, today = null } = {}, db = getDB()) {
  const { start, end, days } = ayAralik(period)
  const sorunlar = []

  const kapsam = []
  const kapsamParams = []
  if (dept_id != null) { kapsam.push('s.department_id = ?'); kapsamParams.push(Number(dept_id)) }
  if (project_id != null) { kapsam.push('s.project_id = ?'); kapsamParams.push(Number(project_id)) }
  const kapsamSql = kapsam.length ? `AND ${kapsam.join(' AND ')}` : ''

  // ── Kayıtlar ──────────────────────────────────────────────────────────────
  const kayitlar = guvenli(db, `
    SELECT o.id, o.staff_id, o.work_date, o.hours, o.approved_by, o.overtime_request_id,
           s.full_name, s.department_id, s.project_id
    FROM overtime_records o JOIN staff s ON s.id = o.staff_id
    WHERE o.work_date BETWEEN ? AND ? ${kapsamSql}
  `, [start, end, ...kapsamParams], 'overtime_records', sorunlar) || []

  // ── Ön onaylar ────────────────────────────────────────────────────────────
  const onOnaylar = guvenli(db, `
    SELECT r.id, r.staff_id, r.work_date, r.status, r.requested_hours, r.actual_hours,
           s.full_name
    FROM overtime_requests r JOIN staff s ON s.id = r.staff_id
    WHERE r.work_date BETWEEN ? AND ? ${kapsamSql}
  `, [start, end, ...kapsamParams], 'overtime_requests', sorunlar) || []

  const kayitIstekleri = new Set(kayitlar.map(k => k.overtime_request_id).filter(Boolean))

  // ── Zincir kopuklukları ───────────────────────────────────────────────────
  const approved_no_record = onOnaylar
    .filter(r => r.status === 'approved' && !kayitIstekleri.has(r.id))
    .map(r => ({ request_id: r.id, staff_id: r.staff_id, full_name: r.full_name, work_date: r.work_date, requested_hours: r.requested_hours }))

  const record_no_request = kayitlar
    .filter(k => !k.overtime_request_id)
    .map(k => ({ record_id: k.id, staff_id: k.staff_id, full_name: k.full_name, work_date: k.work_date, hours: k.hours }))

  const record_no_approver = kayitlar
    .filter(k => !k.approved_by)
    .map(k => ({ record_id: k.id, staff_id: k.staff_id, full_name: k.full_name, work_date: k.work_date, hours: k.hours }))

  const istekMap = new Map(onOnaylar.map(r => [r.id, r]))
  const hours_mismatch = kayitlar
    .filter(k => k.overtime_request_id && istekMap.has(k.overtime_request_id))
    .map(k => ({ kayit: k, istek: istekMap.get(k.overtime_request_id) }))
    .filter(({ kayit, istek }) => Math.abs(Number(kayit.hours || 0) - Number(istek.requested_hours || 0)) > SAAT_TOLERANS)
    .map(({ kayit, istek }) => ({
      record_id: kayit.id, staff_id: kayit.staff_id, full_name: kayit.full_name, work_date: kayit.work_date,
      approved_hours: Number(istek.requested_hours || 0), actual_hours: Number(kayit.hours || 0),
      diff: Number((Number(kayit.hours || 0) - Number(istek.requested_hours || 0)).toFixed(2)),
    }))

  // ── Kişi kişi toplam ──────────────────────────────────────────────────────
  const kisiSaat = new Map()
  kayitlar.forEach(k => {
    const o = kisiSaat.get(k.staff_id) || { staff_id: k.staff_id, full_name: k.full_name, hours: 0, days: 0 }
    o.hours = Number((o.hours + Number(k.hours || 0)).toFixed(2))
    o.days += 1
    kisiSaat.set(k.staff_id, o)
  })
  const kisiler = [...kisiSaat.values()].sort((a, b) => b.hours - a.hours)
  const toplamSaat = Number(kisiler.reduce((t, k) => t + k.hours, 0).toFixed(2))

  // ── Bütçe ─────────────────────────────────────────────────────────────────
  const butceSatirlari = guvenli(db,
    'SELECT scope, scope_id, period, monthly_hours, per_person_monthly_hours, yearly_person_hours, note FROM overtime_budgets',
    [], 'overtime_budgets', sorunlar) || []
  const butce = cozulmusButce(butceSatirlari, { period, dept_id, project_id })

  const aylikTavan = butce?.monthly_hours ?? null
  const budget = aylikTavan == null
    ? { known: false, reason: 'Bu kapsam için aylık mesai tavanı tanımlı değil', used_hours: toplamSaat, scope: butce?.scope || null }
    : {
      known: true,
      scope: butce.scope,
      limit_hours: aylikTavan,
      used_hours: toplamSaat,
      remaining_hours: Number((aylikTavan - toplamSaat).toFixed(2)),
      used_ratio: aylikTavan > 0 ? Number((toplamSaat / aylikTavan).toFixed(3)) : null,
      exceeded: toplamSaat > aylikTavan,
    }

  // ── Kişi limiti ───────────────────────────────────────────────────────────
  const kisiTavan = butce?.per_person_monthly_hours ?? null
  const person_limit = kisiTavan == null
    ? { known: false, reason: 'Kişi başına aylık tavan tanımlı değil', over: [] }
    : {
      known: true,
      limit_hours: kisiTavan,
      over: kisiler.filter(k => k.hours > kisiTavan).map(k => ({ ...k, over_by: Number((k.hours - kisiTavan).toFixed(2)) })),
    }

  // ── Yıllık kişi tavanı (İş Kanunu m.41) ───────────────────────────────────
  const yillikTavan = butce?.yearly_person_hours ?? null
  let yearly_limit = { known: false, reason: 'Yıllık kişi tavanı tanımlı değil', over: [] }
  if (yillikTavan != null) {
    const yil = period.slice(0, 4)
    const yillik = guvenli(db, `
      SELECT o.staff_id, s.full_name, SUM(o.hours) AS toplam
      FROM overtime_records o JOIN staff s ON s.id = o.staff_id
      WHERE o.work_date BETWEEN ? AND ? ${kapsamSql}
      GROUP BY o.staff_id
    `, [`${yil}-01-01`, `${yil}-12-31`, ...kapsamParams], 'overtime_records', sorunlar)
    yearly_limit = yillik == null
      ? { known: false, reason: 'Yıllık toplam okunamadı', over: [] }
      : {
        known: true,
        limit_hours: yillikTavan,
        note: butce?.note || null,
        over: yillik.filter(k => Number(k.toplam) > yillikTavan)
          .map(k => ({ staff_id: k.staff_id, full_name: k.full_name, hours: Number(k.toplam), over_by: Number((k.toplam - yillikTavan).toFixed(2)) })),
      }
  }

  // ── Ay sonu tahmini ───────────────────────────────────────────────────────
  // Ay bittiyse tahmin yok — gerçekleşen var. Gelecek ay için de tahmin
  // uydurulmaz; henüz geçen gün yoktur.
  let month_end_forecast
  const bugun = today || new Date().toLocaleDateString('sv-SE')
  if (bugun > end) {
    month_end_forecast = { known: true, complete: true, hours: toplamSaat }
  } else if (bugun < start) {
    month_end_forecast = { known: false, reason: 'Dönem henüz başlamadı' }
  } else {
    const gecen = Number(bugun.slice(8, 10))
    month_end_forecast = {
      known: true,
      complete: false,
      elapsed_days: gecen,
      total_days: days,
      hours_so_far: toplamSaat,
      projected: Number(((toplamSaat / gecen) * days).toFixed(1)),
    }
  }

  const uyarilar = []
  if (record_no_request.length) uyarilar.push(`${record_no_request.length} mesai kaydının ön onayı yok`)
  if (approved_no_record.length) uyarilar.push(`${approved_no_record.length} onaylı ön onayın fiilî kaydı girilmemiş`)
  if (hours_mismatch.length) uyarilar.push(`${hours_mismatch.length} kayıtta onaylı saat ile fiilî saat farklı`)
  if (record_no_approver.length) uyarilar.push(`${record_no_approver.length} kayıtta onaylayan yazmıyor`)
  if (budget.known && budget.exceeded) uyarilar.push('Aylık mesai bütçesi aşıldı')
  if (person_limit.known && person_limit.over.length) uyarilar.push(`${person_limit.over.length} kişi aylık kişi tavanını aştı`)
  if (yearly_limit.known && yearly_limit.over.length) uyarilar.push(`${yearly_limit.over.length} kişi yıllık 270 saat sınırını aştı`)

  return {
    period,
    scope: { dept_id: dept_id == null ? null : Number(dept_id), project_id: project_id == null ? null : Number(project_id) },
    totals: { hours: toplamSaat, records: kayitlar.length, people: kisiler.length, requests: onOnaylar.length },
    chain: { approved_no_record, record_no_request, record_no_approver, hours_mismatch },
    budget,
    person_limit,
    yearly_limit,
    month_end_forecast,
    fairness: dagilimAdaleti(kisiler.map(k => k.hours)),
    top_people: kisiler.slice(0, 15),
    warnings: uyarilar,
    // Okunamayan kaynak gizlenirse boş sonuç "mesai yok" sanılır.
    unavailable: sorunlar,
  }
}

// Bütçe tanımı yalnız yöneticide; tavan koymak operasyonel bir karardır.
export function upsertOvertimeBudget(input = {}, db = getDB()) {
  const { scope, scope_id = null, period = null } = input
  if (!['global', 'department', 'project'].includes(scope)) {
    throw Object.assign(new Error('Geçersiz kapsam'), { statusCode: 400 })
  }
  // Number(null) === 0 olduğu için boşluk kontrolü ayrı yapılır; aksi halde
  // scope_id'siz departman bütçesi sessizce 0'a yazılır ve hiçbir departmanla
  // eşleşmez.
  const kapsamBos = scope_id == null || scope_id === ''
  if (scope !== 'global' && (kapsamBos || !Number.isFinite(Number(scope_id)))) {
    throw Object.assign(new Error('Departman/proje kapsamında scope_id zorunlu'), { statusCode: 400 })
  }
  if (period != null && !isPeriod(period)) {
    throw Object.assign(new Error('Geçersiz dönem (YYYY-AA)'), { statusCode: 400 })
  }

  const sayi = (v, ad) => {
    if (v == null || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${ad} sıfırdan küçük olamaz`), { statusCode: 400 })
    return n
  }
  const aylik = sayi(input.monthly_hours, 'Aylık tavan')
  const kisi = sayi(input.per_person_monthly_hours, 'Kişi tavanı')
  const yillik = sayi(input.yearly_person_hours, 'Yıllık tavan')

  const kapsamId = scope === 'global' ? null : Number(scope_id)
  db.prepare(`
    INSERT INTO overtime_budgets (scope, scope_id, period, monthly_hours, per_person_monthly_hours, yearly_person_hours, note)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(scope, COALESCE(scope_id, -1), COALESCE(period, '')) DO UPDATE SET
      monthly_hours = excluded.monthly_hours,
      per_person_monthly_hours = excluded.per_person_monthly_hours,
      yearly_person_hours = excluded.yearly_person_hours,
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP
  `).run(scope, kapsamId, period, aylik, kisi, yillik, input.note || null)

  return db.prepare(`
    SELECT * FROM overtime_budgets
    WHERE scope = ? AND COALESCE(scope_id, -1) = COALESCE(?, -1) AND COALESCE(period, '') = COALESCE(?, '')
  `).get(scope, kapsamId, period)
}

export function listOvertimeBudgets(db = getDB()) {
  return db.prepare(`
    SELECT b.*, d.name AS department_name, p.name AS project_name
    FROM overtime_budgets b
    LEFT JOIN departments d ON b.scope = 'department' AND d.id = b.scope_id
    LEFT JOIN projects p ON b.scope = 'project' AND p.id = b.scope_id
    ORDER BY b.scope, b.scope_id, b.period
  `).all()
}
