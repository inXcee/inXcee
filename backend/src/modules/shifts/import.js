// Excel çizelge içe aktarma — uzlaştırma (reconciliation) + DB yazımı.
//
// Frontend ham Excel'i kanonik bir yapıya çevirir (bkz. frontend
// shifts/logic/excelImport.js) ve buraya gönderir:
//   {
//     weekDates: ['2026-05-18', ... 7 gün],
//     rows: [{ name, deptName, cells: [{ date, startHour, endHour, status, raw }] }],
//     unrecognized: [{ name, date, raw }]
//   }
//
// Bu modül eksik departman / vardiya tanımı / personeli (createMissing açıkken)
// otomatik oluşturur, sonra shift_schedule'a upsert yapar. dryRun=true ise
// hiçbir şey yazmaz, sadece "ne olurdu" raporunu döndürür (önizleme).

import { getDB } from '../../shared/db/index.js'
import { guessGender } from './nameGender.js'
import { analyzeAnomalies } from './analyze.js'
import { recordPersonnelEvent } from '../personnel/tracking-events.js'

const IMPORT_SCHEDULE_FIELDS = ['dept_id', 'shift_def_id', 'work_location_id', 'status', 'leave_type']

function importedScheduleChanged(before, after) {
  return IMPORT_SCHEDULE_FIELDS.some(field => (before?.[field] ?? null) !== (after?.[field] ?? null))
}

// İsim normalizasyonu — büyük/küçük harf + fazla boşlukları yok say (TR locale).
export function normalizeName(s) {
  return String(s || '').toLocaleLowerCase('tr').trim().replace(/\s+/g, ' ')
}

// Aksan-katlamalı isim anahtarı — Türkçe diakritikleri sadeleştirir ki
// "Melike Akca" ile "MELİKE AKÇA" aynı kişi sayılsın (mükerrer personel önlenir).
const FOLD_MAP = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
export function foldName(s) {
  return normalizeName(s)
    .replace(/[çğıİiöşüâîû]/g, ch => FOLD_MAP[ch] || ch)
    .replace(/[^a-z0-9 ]/g, '') // kalan noktalama/aksanı at
    .replace(/\s+/g, ' ')
    .trim()
}

// Otomatik oluşturulan departman/vardiya için renk paletleri.
const DEPT_COLORS = ['bg-blue-600', 'bg-teal-600', 'bg-amber-600', 'bg-purple-600', 'bg-rose-600', 'bg-cyan-600', 'bg-lime-600', 'bg-indigo-600']
const SHIFT_COLORS = ['bg-blue-400', 'bg-orange-400', 'bg-indigo-600', 'bg-emerald-500', 'bg-pink-500', 'bg-yellow-500']

// (start,end) saatine bilinen vardiya adı; yoksa "HH:00-HH:00".
function shiftDefName(start, end) {
  const known = {
    '8-17': 'Gündüz', '15-24': 'Akşam', '0-8': 'Gece', '6-15': 'Sabah', '8-8': '24 Saat',
  }
  const pad = h => String(h % 24).padStart(2, '0')
  return known[`${start}-${end}`] || `${pad(start)}:00-${pad(end)}:00`
}

// Ardışık tarihleri (ISO) gruplara ayır: [{ start, end, days }].
export function groupConsecutive(dates) {
  const sorted = [...new Set(dates)].sort()
  const runs = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last) {
      const next = new Date(last.end); next.setDate(next.getDate() + 1)
      const nextIso = next.toISOString().slice(0, 10)
      if (nextIso === d) { last.end = d; last.days++; continue }
    }
    runs.push({ start: d, end: d, days: 1 })
  }
  return runs
}

// Satırlardan izin taleplerine dönüşecek koşuları çıkar (yalnızca sick & annual;
// OFF=haftalık tatil ve unpaid=ücretsiz izin enum'da yok → leave_request üretmez).
export function buildLeaveRuns(rows) {
  const out = []
  for (const r of rows) {
    const byType = { sick: [], annual: [] }
    for (const c of r.cells || []) {
      if (c.status === 'on_leave' && (c.leaveType === 'sick' || c.leaveType === 'annual')) {
        byType[c.leaveType].push(c.date)
      }
    }
    for (const type of ['sick', 'annual']) {
      for (const run of groupConsecutive(byType[type])) {
        out.push({ name: r.name, leaveType: type, ...run })
      }
    }
  }
  return out
}

function addLocationCandidate(index, key, location) {
  if (!key) return
  if (!index.has(key)) index.set(key, [])
  const candidates = index.get(key)
  if (!candidates.some(item => item.id === location.id)) candidates.push(location)
}

export function buildLocationResolver(locations = []) {
  const byId = new Map(locations.map(location => [Number(location.id), location]))
  const byName = new Map()
  const bySite = new Map()
  for (const location of locations) {
    const name = foldName(location.name)
    const site = foldName(location.site)
    addLocationCandidate(byName, name, location)
    if (site) {
      addLocationCandidate(byName, `${site} ${name}`, location)
      addLocationCandidate(byName, `${name} ${site}`, location)
      addLocationCandidate(bySite, site, location)
    }
  }

  return (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return { status: 'empty', location: null, raw }
    const numeric = raw.match(/^#?(\d+)$/)
    if (numeric) {
      const location = byId.get(Number(numeric[1]))
      return location ? { status: 'matched', location, raw } : { status: 'unmatched', location: null, raw }
    }
    const key = foldName(raw)
    const direct = byName.get(key) || []
    if (direct.length === 1) return { status: 'matched', location: direct[0], raw }
    if (direct.length > 1) return { status: 'ambiguous', location: null, candidates: direct, raw }
    const site = bySite.get(key) || []
    if (site.length === 1) return { status: 'matched', location: site[0], raw }
    if (site.length > 1) return { status: 'ambiguous', location: null, candidates: site, raw }
    return { status: 'unmatched', location: null, raw }
  }
}

function normalizeScheduleStatus(cell) {
  return cell?.leaveType === 'weekly_off' ? 'off' : (cell?.status || 'scheduled')
}

// Kanonik payload'ı uzlaştır + (dryRun değilse) DB'ye yaz. Tek transaction.
// Dönüş: rapor (eşleşen/oluşturulan sayıları + isim listeleri + uyarılar).
export function importSchedule(payload, userId, { dryRun = false, createMissing = true, excludeDepts = [], mappings = {} } = {}) {
  const db = getDB()
  const { weekDates = [], unrecognized = [] } = payload || {}
  let rows = payload?.rows || []
  // Seçilmeyen departmanları içe aktarımdan çıkar.
  if (excludeDepts.length) {
    const skip = new Set(excludeDepts.map(normalizeName))
    rows = rows.filter(r => !skip.has(normalizeName(r.deptName || '')))
  }

  // ── Mevcut varlıkları indeksle ──
  const deptByName = new Map(
    db.prepare('SELECT id, name FROM departments').all().map(d => [normalizeName(d.name), d])
  )
  const shiftByHours = new Map(
    db.prepare('SELECT id, name, start_hour, end_hour FROM shift_definitions').all()
      .map(s => [`${s.start_hour}-${s.end_hour}`, s])
  )
  const workLocationRows = db.prepare(`
    SELECT id, name, site, dept_id
    FROM work_locations
    WHERE is_active = 1
    ORDER BY sort_order, name
  `).all()
  const resolveLocation = buildLocationResolver(workLocationRows)
  const allStaffRows = db.prepare('SELECT id, full_name, department_id FROM staff').all()
  const staffByName = new Map(allStaffRows.map(s => [normalizeName(s.full_name), s]))
  // Aksan-katlamalı ikincil indeks — yazım farkından doğan mükerrerleri yakalar.
  const staffByFold = new Map()
  for (const s of allStaffRows) {
    const k = foldName(s.full_name)
    if (k && !staffByFold.has(k)) staffByFold.set(k, s)
  }
  const staffById = new Map(allStaffRows.map(s => [s.id, s]))
  // Kullanıcının elle yaptığı eşleştirmeler (excelAdı → mevcut staffId).
  const mapNorm = new Map(Object.entries(mappings || {}).map(([k, v]) => [normalizeName(k), +v]))
  // Excel adını mevcut personele eşle: önce elle eşleştirme, sonra birebir, sonra aksan-katlamalı.
  const resolveStaff = (name) => {
    const mapped = mapNorm.get(normalizeName(name))
    if (mapped && staffById.has(mapped)) return { staff: staffById.get(mapped), fuzzy: false, manual: true }
    const exact = staffByName.get(normalizeName(name))
    if (exact) return { staff: exact, fuzzy: false }
    const fold = staffByFold.get(foldName(name))
    if (fold) return { staff: fold, fuzzy: true }
    return { staff: null, fuzzy: false }
  }

  // ── Hangi varlıkların eksik olduğunu topla (yazmadan önce planla) ──
  const report = {
    weekDates,
    depts: { matched: [], created: [] },
    shiftDefs: { matched: [], created: [] },
    locations: { matched: [], unmatched: [], ambiguous: [], withoutLocation: 0 },
    staff: { matched: 0, matchedNames: [], created: [], fuzzyMatched: [], genderGuessed: 0, genderUnknown: [] },
    scheduleEntries: 0,
    scheduleNew: 0,
    scheduleUpdated: 0,
    leaves: { created: 0, annualDays: 0, sickDays: 0 },
    deptSummary: [],
    skippedNoStaff: [],
    unrecognized,
  }

  // Lokasyonlar mevcut tanımlarla uzlaştırılır. Belirsiz/yanlış adlar sessizce
  // başka bir noktaya atanmaz; önizlemede açıkça gösterilir ve kayıtta boş bırakılır.
  const locationReport = new Map()
  for (const r of rows) {
    for (const c of r.cells || []) {
      if (!['scheduled', 'worked', 'overtime'].includes(normalizeScheduleStatus(c))) continue
      const excelName = String(c.locationName || r.locationName || '').trim()
      if (!excelName) {
        report.locations.withoutLocation++
        continue
      }
      const resolved = resolveLocation(excelName)
      const key = `${resolved.status}:${foldName(excelName)}`
      if (!locationReport.has(key)) {
        locationReport.set(key, {
          excelName,
          count: 0,
          ...(resolved.location ? { id: resolved.location.id, matchedTo: resolved.location.name } : {}),
          ...(resolved.candidates ? { candidates: resolved.candidates.map(item => item.name) } : {}),
          status: resolved.status,
        })
      }
      locationReport.get(key).count++
    }
  }
  for (const item of locationReport.values()) {
    const { status, ...summary } = item
    if (status === 'matched') report.locations.matched.push(summary)
    else if (status === 'ambiguous') report.locations.ambiguous.push(summary)
    else report.locations.unmatched.push(summary)
  }

  // Departmanlar
  const distinctDepts = [...new Set(rows.map(r => r.deptName).filter(Boolean))]
  for (const name of distinctDepts) {
    if (deptByName.has(normalizeName(name))) report.depts.matched.push(name)
    else report.depts.created.push(name)
  }

  // Vardiya tanımları (sadece çalışılan/scheduled hücrelerden, saatli olanlar)
  const distinctShifts = new Map() // 'start-end' → {start,end}
  for (const r of rows) {
    for (const c of r.cells || []) {
      if (c.startHour == null || c.endHour == null) continue
      const key = `${c.startHour}-${c.endHour}`
      if (!distinctShifts.has(key)) distinctShifts.set(key, { start: c.startHour, end: c.endHour })
    }
  }
  for (const [key, { start, end }] of distinctShifts) {
    const name = shiftDefName(start, end)
    if (shiftByHours.has(key)) report.shiftDefs.matched.push({ key, name })
    else report.shiftDefs.created.push({ key, name, start, end })
  }

  // Personel
  for (const r of rows) {
    if (!r.name) continue
    const { staff, fuzzy } = resolveStaff(r.name)
    if (staff) {
      report.staff.matched++
      report.staff.matchedNames.push(r.name)
      if (fuzzy) report.staff.fuzzyMatched.push({ excelName: r.name, matchedTo: staff.full_name })
    } else if (createMissing) {
      const gender = guessGender(r.name)
      if (gender) report.staff.genderGuessed++
      else report.staff.genderUnknown.push(r.name)
      report.staff.created.push({ name: r.name, deptName: r.deptName || null, gender })
    } else {
      report.staff.skippedNoStaff.push(r.name)
    }
  }

  // Departman bazlı özet (önizleme için): her departmanda kaç personel + kaç hücre.
  const deptAgg = new Map()
  for (const r of rows) {
    const key = r.deptName || '— (departmansız)'
    if (!deptAgg.has(key)) deptAgg.set(key, { name: key, staffCount: 0, cellCount: 0 })
    const a = deptAgg.get(key)
    a.staffCount++
    a.cellCount += r.cells?.length || 0
  }
  report.deptSummary = [...deptAgg.values()]

  // ── Anomali analizi (saf yapısal: dinlenme/ardışık gün/gece) ──
  const anomalies = analyzeAnomalies(rows, weekDates)
  // ── DB-tabanlı: mevcut personel onaylı izinliyken vardiya atanıyor mu? ──
  const leaveStmt = db.prepare(`
    SELECT leave_type FROM leave_requests
    WHERE staff_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
  `)
  for (const r of rows) {
    const { staff } = resolveStaff(r.name)
    if (!staff) continue
    for (const c of r.cells || []) {
      if (c.status !== 'scheduled' || !c.date) continue
      const lv = leaveStmt.get(staff.id, c.date)
      if (lv) {
        anomalies.warnings.push({ staff: r.name, kind: 'on_approved_leave',
          message: `${r.name}: ${c.date} onaylı ${lv.leave_type} izni varken vardiya atanıyor` })
        anomalies.counts.on_approved_leave = (anomalies.counts.on_approved_leave || 0) + 1
      }
    }
  }
  report.anomalies = anomalies

  // Üzerine-yazma farkındalığı: mevcut çizelgede aynı (personel, tarih) var mı?
  // dryRun'da yalnızca hâlihazırda var olan personel için sayılabilir.
  const existsStmt = db.prepare('SELECT 1 FROM shift_schedule WHERE staff_id = ? AND work_date = ?')
  const countConflicts = () => {
    let nu = 0, up = 0
    for (const r of rows) {
      const { staff } = resolveStaff(r.name)
      for (const c of r.cells || []) {
        if (!c.date) continue
        if (staff && existsStmt.get(staff.id, c.date)) up++
        else nu++
      }
    }
    return { nu, up }
  }

  // İzin koşuları (sick/annual) — leave_requests adayları.
  const leaveRuns = buildLeaveRuns(rows)
  report.leaves.created = leaveRuns.length
  report.leaves.annualDays = leaveRuns.filter(r => r.leaveType === 'annual').reduce((n, r) => n + r.days, 0)
  report.leaves.sickDays = leaveRuns.filter(r => r.leaveType === 'sick').reduce((n, r) => n + r.days, 0)

  if (dryRun) {
    report.scheduleEntries = rows.reduce((n, r) => n + (r.cells?.length || 0), 0)
    const { nu, up } = countConflicts()
    report.scheduleNew = nu
    report.scheduleUpdated = up
    return report
  }

  if (!createMissing && distinctDepts.some(n => !deptByName.has(normalizeName(n)))) {
    // createMissing kapalıysa eksik departmanlı personeli departmansız bırakırız.
  }

  // ── Gerçek yazım — tek transaction ──
  const insertDept = db.prepare('INSERT INTO departments(name, color_class, description) VALUES(?,?,?)')
  const insertShift = db.prepare('INSERT INTO shift_definitions(name, start_hour, end_hour, color_class) VALUES(?,?,?,?)')
  const insertStaff = db.prepare('INSERT INTO staff(full_name, department_id, gender, is_active) VALUES(?,?,?,1)')
  const upsert = db.prepare(`
    INSERT INTO shift_schedule(staff_id, dept_id, shift_def_id, work_location_id, work_date, status, leave_type, created_by)
    VALUES(@staff_id, @dept_id, @shift_def_id, @work_location_id, @work_date, @status, @leave_type, @created_by)
    ON CONFLICT(staff_id, work_date) DO UPDATE SET
      shift_def_id = excluded.shift_def_id,
      dept_id = excluded.dept_id,
      work_location_id = excluded.work_location_id,
      status = excluded.status,
      leave_type = excluded.leave_type
  `)

  // Geri alma (undo) için snapshot: oturumun yarattığı + üzerine yazdığı her şey.
  const undo = { createdStaffIds: [], createdDeptIds: [], createdShiftDefIds: [], createdLeaves: [], schedulePrev: [], scheduleInserted: [] }
  const getPrevStmt = db.prepare('SELECT * FROM shift_schedule WHERE staff_id = ? AND work_date = ?')
  const getScheduleStmt = db.prepare('SELECT * FROM shift_schedule WHERE staff_id = ? AND work_date = ?')
  const insBatch = db.prepare(`INSERT INTO schedule_import_batches(created_by, label, summary, undo_data) VALUES(?,?,?,?)`)

  const tx = db.transaction(() => {
    // Departmanlar
    let dColor = deptByName.size
    for (const name of report.depts.created) {
      const id = insertDept.run(name, DEPT_COLORS[dColor % DEPT_COLORS.length], 'Excel içe aktarımı').lastInsertRowid
      deptByName.set(normalizeName(name), { id, name })
      undo.createdDeptIds.push(id)
      dColor++
    }
    // Vardiya tanımları
    let sColor = shiftByHours.size
    for (const { key, name, start, end } of report.shiftDefs.created) {
      // İsim UNIQUE — çakışırsa saatli isme düş.
      let finalName = name
      const exists = db.prepare('SELECT 1 FROM shift_definitions WHERE name = ?').get(finalName)
      if (exists) finalName = `${String(start).padStart(2, '0')}:00-${String(end % 24).padStart(2, '0')}:00 (${key})`
      const id = insertShift.run(finalName, start, end, SHIFT_COLORS[sColor % SHIFT_COLORS.length]).lastInsertRowid
      shiftByHours.set(key, { id, name: finalName, start_hour: start, end_hour: end })
      undo.createdShiftDefIds.push(id)
      sColor++
    }
    // Personel
    for (const { name, deptName, gender } of report.staff.created) {
      const dept = deptName ? deptByName.get(normalizeName(deptName)) : null
      const id = insertStaff.run(name, dept?.id || null, gender || null).lastInsertRowid
      staffByName.set(normalizeName(name), { id, full_name: name, department_id: dept?.id || null })
      undo.createdStaffIds.push(id)
      recordPersonnelEvent({
        staffId: id,
        eventType: 'employment_started',
        effectiveAt: weekDates[0] || db.prepare("SELECT date('now','localtime') AS value").get().value,
        sourceType: 'staff',
        sourceId: id,
        after: db.prepare('SELECT * FROM staff WHERE id=?').get(id),
        reason: 'Vardiya Excel aktariminda personel olusturuldu',
        actorUserId: userId || null,
        metadata: { source: 'schedule_import' },
      })
    }

    // Çizelge upsert — yeni-oluşturulanlar staffByName'e zaten eklendi, resolveStaff onları görür.
    let count = 0, nu = 0, up = 0
    for (const r of rows) {
      const { staff } = resolveStaff(r.name)
      if (!staff) continue
      const dept = r.deptName ? deptByName.get(normalizeName(r.deptName)) : null
      const deptId = dept?.id || staff.department_id || null
      for (const c of r.cells || []) {
        if (!c.date) continue
        let shiftDefId = null
        if (c.startHour != null && c.endHour != null) {
          shiftDefId = shiftByHours.get(`${c.startHour}-${c.endHour}`)?.id || null
        }
        const prev = getPrevStmt.get(staff.id, c.date)
        if (prev) { up++; undo.schedulePrev.push({ staff_id: staff.id, work_date: c.date, ...prev }) }
        else { nu++; undo.scheduleInserted.push({ staff_id: staff.id, work_date: c.date }) }
        const status = normalizeScheduleStatus(c)
        const explicitLocation = c.locationName || r.locationName
        const locationResult = explicitLocation ? resolveLocation(explicitLocation) : null
        const workLocationId = ['scheduled', 'worked', 'overtime'].includes(status) && locationResult?.status === 'matched'
          ? locationResult.location.id
          : null
        upsert.run({
          staff_id: staff.id,
          dept_id: deptId,
          shift_def_id: shiftDefId,
          work_location_id: workLocationId,
          work_date: c.date,
          status,
          leave_type: status === 'on_leave' ? (c.leaveType || null) : null,
          created_by: userId || null,
        })
        const after = getScheduleStmt.get(staff.id, c.date)
        if (prev && importedScheduleChanged(prev, after)) {
          recordPersonnelEvent({
            staffId: staff.id,
            eventType: 'shift_changed',
            effectiveAt: c.date,
            sourceType: 'shift_schedule',
            sourceId: after.id,
            before: prev,
            after,
            reason: 'Vardiya Excel aktarimi ile guncellendi',
            actorUserId: userId || null,
            metadata: { source: 'schedule_import' },
          })
        } else if (!prev && after.status === 'absent') {
          recordPersonnelEvent({
            staffId: staff.id,
            eventType: 'absence_recorded',
            effectiveAt: c.date,
            sourceType: 'shift_schedule',
            sourceId: after.id,
            after,
            reason: 'Devamsizlik Excel vardiya aktarimi ile kaydedildi',
            actorUserId: userId || null,
            metadata: { source: 'schedule_import' },
          })
        }
        count++
      }
    }
    report.scheduleEntries = count
    report.scheduleNew = nu
    report.scheduleUpdated = up

    // ── İzin talepleri (sick/annual) — onaylı kayıt + bakiye düşümü ──
    const findLeave = db.prepare(`SELECT id FROM leave_requests
      WHERE staff_id = ? AND leave_type = ? AND start_date = ? AND end_date = ?`)
    const insLeave = db.prepare(`INSERT INTO leave_requests
      (staff_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_at)
      VALUES (?,?,?,?,?,?, 'approved', ?, datetime('now'))`)
    const ensureBal = db.prepare(`INSERT OR IGNORE INTO leave_balance(staff_id, year) VALUES(?, ?)`)
    const bumpAnnual = db.prepare(`UPDATE leave_balance SET annual_used = annual_used + ? WHERE staff_id = ? AND year = ?`)
    const bumpSick = db.prepare(`UPDATE leave_balance SET sick_used = sick_used + ? WHERE staff_id = ? AND year = ?`)

    let leavesCreated = 0
    for (const run of leaveRuns) {
      const { staff } = resolveStaff(run.name)
      if (!staff) continue
      if (findLeave.get(staff.id, run.leaveType, run.start, run.end)) continue // idempotent
      const lid = insLeave.run(staff.id, run.leaveType, run.start, run.end, run.days, 'Excel içe aktarımı', userId || null).lastInsertRowid
      const year = +run.start.slice(0, 4)
      ensureBal.run(staff.id, year)
      if (run.leaveType === 'annual') bumpAnnual.run(run.days, staff.id, year)
      else if (run.leaveType === 'sick') bumpSick.run(run.days, staff.id, year)
      undo.createdLeaves.push({ id: lid, staffId: staff.id, leaveType: run.leaveType, days: run.days, year })
      recordPersonnelEvent({
        staffId: staff.id,
        eventType: 'leave_changed',
        effectiveAt: run.start,
        sourceType: 'leave_request',
        sourceId: lid,
        after: db.prepare('SELECT * FROM leave_requests WHERE id=?').get(lid),
        reason: 'Izin Excel vardiya aktarimi ile olusturuldu',
        actorUserId: userId || null,
        metadata: { source: 'schedule_import' },
      })
      leavesCreated++
    }
    report.leaves.created = leavesCreated

    // Oturumu kaydet (geri alınabilsin).
    const summary = {
      weekDates, scheduleEntries: count, scheduleNew: nu, scheduleUpdated: up,
      staffCreated: report.staff.created.length, deptsCreated: report.depts.created.length,
      shiftDefsCreated: report.shiftDefs.created.length, locationsMatched: report.locations.matched.length, leavesCreated,
    }
    const label = weekDates.length ? `${weekDates[0]} → ${weekDates[weekDates.length - 1]}` : 'Excel içe aktarım'
    report.batchId = insBatch.run(userId || null, label, JSON.stringify(summary), JSON.stringify(undo)).lastInsertRowid
  })
  tx()

  return report
}

// ── İçe aktarım oturumlarını listele ──
export function listImportBatches(limit = 20) {
  return getDB().prepare(`
    SELECT b.id, b.created_at, b.label, b.summary, b.undone_at, u.username AS created_by_name
    FROM schedule_import_batches b
    LEFT JOIN users u ON u.id = b.created_by
    ORDER BY b.id DESC LIMIT ?
  `).all(limit).map(b => ({ ...b, summary: safeParse(b.summary) }))
}

function safeParse(s) { try { return JSON.parse(s) } catch { return null } }

// ── Bir oturumu geri al: yarattıklarını sil, üzerine yazdıklarını eski haline döndür ──
export function undoImportBatch(batchId, userId = null) {
  const db = getDB()
  const batch = db.prepare('SELECT * FROM schedule_import_batches WHERE id = ?').get(batchId)
  if (!batch) throw new Error('İçe aktarım oturumu bulunamadı')
  if (batch.undone_at) throw new Error('Bu oturum zaten geri alınmış')
  const undo = safeParse(batch.undo_data)
  if (!undo) throw new Error('Geri alma verisi okunamadı')

  const delSched = db.prepare('DELETE FROM shift_schedule WHERE staff_id = ? AND work_date = ?')
  const restoreSched = db.prepare(`UPDATE shift_schedule SET dept_id = ?, shift_def_id = ?, work_location_id = ?, status = ?, leave_type = ? WHERE staff_id = ? AND work_date = ?`)
  const delLeave = db.prepare('DELETE FROM leave_requests WHERE id = ?')
  const unbumpAnnual = db.prepare('UPDATE leave_balance SET annual_used = MAX(0, annual_used - ?) WHERE staff_id = ? AND year = ?')
  const unbumpSick = db.prepare('UPDATE leave_balance SET sick_used = MAX(0, sick_used - ?) WHERE staff_id = ? AND year = ?')
  const delLeaveByStaff = db.prepare('DELETE FROM leave_requests WHERE staff_id = ?')
  const delBalByStaff = db.prepare('DELETE FROM leave_balance WHERE staff_id = ?')
  const delSchedByStaff = db.prepare('DELETE FROM shift_schedule WHERE staff_id = ?')
  const archiveStaff = db.prepare(`
    UPDATE staff
    SET is_active=0, archived_at=CURRENT_TIMESTAMP,
      archive_reason='Vardiya Excel aktarimi geri alindi',
      project_id=NULL, department_id=NULL, role_id=NULL
    WHERE id=?
  `)
  const staffRefByDept = db.prepare('SELECT 1 FROM staff WHERE department_id = ? LIMIT 1')
  const delDept = db.prepare('DELETE FROM departments WHERE id = ?')
  const schedRefByDef = db.prepare('SELECT 1 FROM shift_schedule WHERE shift_def_id = ? LIMIT 1')
  const delDef = db.prepare('DELETE FROM shift_definitions WHERE id = ?')
  const getSchedule = db.prepare('SELECT * FROM shift_schedule WHERE staff_id=? AND work_date=?')

  const result = { scheduleRestored: 0, scheduleDeleted: 0, leavesDeleted: 0, staffDeleted: 0, deptsDeleted: 0, shiftDefsDeleted: 0 }

  db.transaction(() => {
    // 1) Oluşturulan izinleri sil + bakiyeyi geri yükle
    for (const lv of undo.createdLeaves || []) {
      const before = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(lv.id)
      delLeave.run(lv.id)
      if (lv.leaveType === 'annual') unbumpAnnual.run(lv.days, lv.staffId, lv.year)
      else if (lv.leaveType === 'sick') unbumpSick.run(lv.days, lv.staffId, lv.year)
      if (before) {
        recordPersonnelEvent({
          staffId: lv.staffId,
          eventType: 'leave_changed',
          effectiveAt: before.start_date,
          sourceType: 'leave_request',
          sourceId: lv.id,
          before,
          after: null,
          reason: `Vardiya Excel aktarimi #${batchId} geri alindi`,
          actorUserId: userId,
          metadata: { source: 'schedule_import_undo', batch_id: batchId },
        })
      }
      result.leavesDeleted++
    }
    // 2) Yeni eklenen çizelge satırlarını sil
    for (const s of undo.scheduleInserted || []) {
      const before = getSchedule.get(s.staff_id, s.work_date)
      delSched.run(s.staff_id, s.work_date)
      if (before) {
        recordPersonnelEvent({
          staffId: s.staff_id,
          eventType: 'shift_changed',
          effectiveAt: s.work_date,
          sourceType: 'shift_schedule',
          sourceId: before.id,
          before,
          after: null,
          reason: `Vardiya Excel aktarimi #${batchId} geri alindi`,
          actorUserId: userId,
          metadata: { source: 'schedule_import_undo', batch_id: batchId },
        })
      }
      result.scheduleDeleted++
    }
    // 3) Üzerine yazılanları eski değerlerine döndür
    for (const p of undo.schedulePrev || []) {
      const before = getSchedule.get(p.staff_id, p.work_date)
      restoreSched.run(p.dept_id, p.shift_def_id, p.work_location_id || null, p.status, p.leave_type || null, p.staff_id, p.work_date)
      const after = getSchedule.get(p.staff_id, p.work_date)
      if (before && after && importedScheduleChanged(before, after)) {
        recordPersonnelEvent({
          staffId: p.staff_id,
          eventType: 'shift_changed',
          effectiveAt: p.work_date,
          sourceType: 'shift_schedule',
          sourceId: after.id,
          before,
          after,
          reason: `Vardiya Excel aktarimi #${batchId} geri alindi`,
          actorUserId: userId,
          metadata: { source: 'schedule_import_undo', batch_id: batchId },
        })
      }
      result.scheduleRestored++
    }
    // 4) Oluşturulan personeli (ve onlara ait tüm izleri) sil
    for (const sid of undo.createdStaffIds || []) {
      const before = db.prepare('SELECT * FROM staff WHERE id=?').get(sid)
      delSchedByStaff.run(sid); delLeaveByStaff.run(sid); delBalByStaff.run(sid); archiveStaff.run(sid)
      const after = db.prepare('SELECT * FROM staff WHERE id=?').get(sid)
      if (before && after) {
        recordPersonnelEvent({
          staffId: sid,
          eventType: 'employment_ended',
          effectiveAt: db.prepare("SELECT date('now','localtime') AS value").get().value,
          sourceType: 'schedule_import_undo',
          sourceId: `${batchId}:${sid}`,
          before,
          after,
          reason: `Vardiya Excel aktarimi #${batchId} geri alindi`,
          actorUserId: userId,
          metadata: { source: 'schedule_import_undo', batch_id: batchId },
        })
      }
      result.staffDeleted++
    }
    // 5) Artık kullanılmayan oluşturulmuş departmanları sil
    for (const did of undo.createdDeptIds || []) {
      if (!staffRefByDept.get(did)) { delDept.run(did); result.deptsDeleted++ }
    }
    // 6) Artık kullanılmayan oluşturulmuş vardiya tanımlarını sil
    for (const sdid of undo.createdShiftDefIds || []) {
      if (!schedRefByDef.get(sdid)) { delDef.run(sdid); result.shiftDefsDeleted++ }
    }
    db.prepare("UPDATE schedule_import_batches SET undone_at = datetime('now') WHERE id = ?").run(batchId)
  })()

  return result
}
