// İK kadro senkronu — resmi kadro kaynağı İK'nın puantaj Excel'i.
//
// PC ajanı (yys-puantaj-sync) her akşam Excel'deki kişileri (ad, TC, görev, işe giriş/çıkış, proje)
// gönderir; burada saklanır ve YYS personeliyle karşılaştırılır:
//   exit_pending      — puantajda çıkış tarihi var, YYS'de aktif ve işten çıkış başlatılmamış
//   archived_present  — YYS'de arşivli/pasif, puantajda çıkışsız yer alıyor
//   missing           — YYS'de aktif, puantajda yok
//   roster_only       — puantajda var, YYS'de karşılığı yok (ya da belirsiz)
//   mismatches        — işe giriş tarihi / proje iki tarafta da dolu ama farklı
//   fillable          — YYS'de boş (TC geçersiz) alan, puantajda dolu → "Boş alanları doldur"
// Bulgular personel takip uyarılarına da düşer (hr_roster_* kuralları). Görüntü 14 günden eskiyse
// bayat sayılır: bulgu üretilmez (eski veriyle uyarı açılmaz), panel ve Hermes bayatlığı söyler.
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { isIsoDate } from '../../shared/validation/date.js'
import { istanbulDate } from '../../shared/time.js'
import { normalizeName, foldName, validTc } from '../../shared/names.js'
import { buildStaffResolver, nameSimilarity } from './staffAliases.js'

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })
export const ROSTER_STALE_DAYS = 14
const KEEP_SNAPSHOTS = 30
export const RUN_SUMMARY_MAX = 200000
const MAX_PEOPLE = 3000

const clean = (v, max = 160) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, max) : null
}
const isoOrNull = v => (isIsoDate(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : null)

function projectResolver(db) {
  const rows = db.prepare('SELECT id, name, code FROM projects').all()
  const byKey = new Map()
  for (const p of rows) {
    byKey.set(foldName(p.name), p.id)
    if (p.code) byKey.set(foldName(p.code), p.id)
  }
  return name => (name ? byKey.get(foldName(name)) ?? null : null)
}

// ── Alma ──────────────────────────────────────────────────────────────────────
export function ingestRoster(body, userId) {
  const db = getDB()
  const people = Array.isArray(body?.people) ? body.people : null
  if (!people?.length) throw fail('Kadro listesi boş')
  if (people.length > MAX_PEOPLE) throw fail(`En fazla ${MAX_PEOPLE} kişi`)
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month || '') ? body.month : null
  const source = clean(body.source, 40) || 'puantaj_excel'
  let runSummary = null
  if (body.run && typeof body.run === 'object') {
    runSummary = JSON.stringify(body.run)
    // Tur özeti ay sonu puantaj raporunun kaynağıdır (ajanın `month_stats`'ı: iki ay × ~185 kişi ≈ 35 KB). 50 KB sınırı
    // aşılınca sessizce kırpılıyor, ay sayımı kayboluyordu → 200 KB (30 görüntü × 200 KB = en çok ~6 MB).
    if (runSummary.length > RUN_SUMMARY_MAX) runSummary = JSON.stringify({ truncated: true, counts: body.run.counts || null })
  }

  const resolve = buildStaffResolver(db, { includeInactive: true })
  const project = projectResolver(db)
  const rows = []
  for (const p of people) {
    const name = clean(p?.name)
    if (!name) continue
    const tc = validTc(p.tc)
    const r = resolve(name, tc)
    rows.push({
      name, name_fold: foldName(name), tc_no: tc, position: clean(p.position, 120),
      hire_date: isoOrNull(p.hire_date), exit_date: isoOrNull(p.exit_date),
      project_name: clean(p.project, 120), project_id: project(p.project),
      file: clean(p.file, 200), sheet_row: Number.isInteger(p.row) ? p.row : null,
      staff_id: r.staff?.id ?? null, match_method: r.method,
    })
  }
  if (!rows.length) throw fail('Geçerli satır yok')

  const insSnap = db.prepare(`INSERT INTO hr_roster_snapshots(source, month, taken_at, people_count, run_summary, created_by)
    VALUES(?,?,?,?,?,?)`)
  const insPerson = db.prepare(`INSERT INTO hr_roster_people(snapshot_id, name, name_fold, tc_no, position, hire_date,
    exit_date, project_name, project_id, file, sheet_row, staff_id, match_method)
    VALUES(@snapshot_id, @name, @name_fold, @tc_no, @position, @hire_date, @exit_date, @project_name, @project_id,
           @file, @sheet_row, @staff_id, @match_method)`)
  const snapshotId = db.transaction(() => {
    const id = insSnap.run(source, month, clean(body.taken_at, 40), rows.length, runSummary, userId || null).lastInsertRowid
    for (const row of rows) insPerson.run({ ...row, snapshot_id: id })
    // Son KEEP_SNAPSHOTS görüntü tutulur (kişiler CASCADE ile silinir).
    db.prepare(`DELETE FROM hr_roster_snapshots WHERE id NOT IN (
      SELECT id FROM hr_roster_snapshots ORDER BY id DESC LIMIT ?)`).run(KEEP_SNAPSHOTS)
    return id
  })()
  const methods = {}
  for (const r of rows) methods[r.match_method || 'unmatched'] = (methods[r.match_method || 'unmatched'] || 0) + 1
  return { snapshot_id: snapshotId, people: rows.length, matched: methods }
}

// ── Okuma ─────────────────────────────────────────────────────────────────────
export function latestSnapshot(db = getDB()) {
  const snap = db.prepare(`SELECT *, (julianday('now') - julianday(received_at)) * 24 AS age_hours
    FROM hr_roster_snapshots ORDER BY id DESC LIMIT 1`).get()
  if (!snap) return null
  let run = null
  try { run = snap.run_summary ? JSON.parse(snap.run_summary) : null } catch { run = null }
  const { run_summary: _drop, ...meta } = snap
  return { ...meta, age_hours: Math.round(snap.age_hours * 10) / 10, stale: snap.age_hours > ROSTER_STALE_DAYS * 24, run }
}

// Bulgular. stale (ya da hiç görüntü yok) → boş listeler; uyarılar açılmaz.
export function rosterFindings(db = getDB(), { today = istanbulDate(), includeStale = false } = {}) {
  const snapshot = latestSnapshot(db)
  const empty = { snapshot, exit_pending: [], archived_present: [], missing: [], roster_only: [], mismatches: [], fillable: [], exempt: [] }
  if (!snapshot || (snapshot.stale && !includeStale)) return empty

  const people = db.prepare('SELECT * FROM hr_roster_people WHERE snapshot_id=? ORDER BY name').all(snapshot.id)
  const resolve = buildStaffResolver(db, { includeInactive: true })
  const projects = new Map(db.prepare('SELECT id, name FROM projects').all().map(p => [p.id, p.name]))
  const usedTc = new Map(resolve.staff.filter(s => validTc(s.tc_no)).map(s => [validTc(s.tc_no), s.id]))
  const out = { ...empty }

  // Aynı kişi iki dosyada (iki proje) olabilir — staff_id başına birleştir.
  const byStaff = new Map()
  for (const p of people) {
    // Kayıt sonrası eklenen eşleştirmeler de sayılsın: her okumada yeniden çözülür.
    const r = resolve(p.name, p.tc_no)
    if (!r.staff) {
      if (p.exit_date && p.exit_date <= today) continue // zaten ayrılmış, YYS'de olmaması normal
      out.roster_only.push({ name: p.name, position: p.position, hire_date: p.hire_date, exit_date: p.exit_date,
        project: p.project_name, ambiguous: r.method === 'ambiguous',
        candidates: (r.candidates || []).map(s => ({ staff_id: s.id, full_name: s.full_name })) })
      continue
    }
    const list = byStaff.get(r.staff.id) || []
    list.push({ ...p, method: r.method })
    byStaff.set(r.staff.id, list)
  }

  for (const [staffId, entries] of byStaff) {
    const s = resolve.byId.get(staffId)
    const e = entries[0]
    const exit = entries.map(x => x.exit_date).filter(Boolean).sort().pop() || null
    const stillListed = entries.some(x => !x.exit_date || x.exit_date > today)
    if (s.is_active && exit && exit <= today && !stillListed && !s.offboarding_started_at && !s.exit_date) {
      out.exit_pending.push({ staff_id: s.id, full_name: s.full_name, exit_date: exit, roster_name: e.name, project: e.project_name })
    }
    if (!s.is_active && stillListed) {
      out.archived_present.push({ staff_id: s.id, full_name: s.full_name, archive_reason: s.archive_reason,
        archived_at: s.archived_at, roster_name: e.name, project: e.project_name, position: e.position })
    }
    // Alan karşılaştırması: iki proje varsa proje karşılaştırılmaz (çift görevli).
    const projectIds = [...new Set(entries.map(x => x.project_id).filter(Boolean))]
    const diffs = []
    if (s.hire_date && e.hire_date && s.hire_date.slice(0, 10) !== e.hire_date) {
      diffs.push({ field: 'hire_date', yys: s.hire_date.slice(0, 10), roster: e.hire_date })
    }
    if (s.project_id && projectIds.length === 1 && s.project_id !== projectIds[0]) {
      diffs.push({ field: 'project_id', yys: projects.get(s.project_id) || s.project_id, roster: projects.get(projectIds[0]) || projectIds[0] })
    }
    if (diffs.length && s.is_active) out.mismatches.push({ staff_id: s.id, full_name: s.full_name, diffs })

    const fields = {}
    const tc = entries.map(x => x.tc_no).find(Boolean)
    if (tc && !validTc(s.tc_no) && (!usedTc.has(tc) || usedTc.get(tc) === s.id)) fields.tc_no = tc
    if (!s.hire_date && e.hire_date) fields.hire_date = e.hire_date
    if (!s.position && e.position) fields.position = e.position
    if (!s.project_id && projectIds.length === 1) fields.project_id = projectIds[0]
    if (Object.keys(fields).length && s.is_active) {
      out.fillable.push({ staff_id: s.id, full_name: s.full_name, fields,
        project_name: fields.project_id ? projects.get(fields.project_id) : undefined })
    }
  }

  const listed = new Set(byStaff.keys())
  const departments = new Map(db.prepare('SELECT id, name FROM departments').all().map(d => [d.id, d.name]))
  // Son vardiya günü (ileri tarihli plan dahil; OFF/izin sayılmaz): hâlâ çalışıyor mu, ayrılmış mı ayırt edilsin.
  const lastScheduled = db.prepare(`SELECT MAX(work_date) d FROM shift_schedule
    WHERE staff_id=? AND COALESCE(status,'') NOT IN ('off','on_leave','absent')`)
  for (const s of resolve.staff) {
    if (!s.is_active || listed.has(s.id)) continue
    const row = { staff_id: s.id, full_name: s.full_name, department: departments.get(s.department_id) || null,
      project: projects.get(s.project_id) || null }
    if (s.hr_roster_exempt) out.exempt.push({ ...row, reason: s.hr_roster_exempt })
    else out.missing.push({ ...row, last_scheduled: lastScheduled.get(s.id)?.d || null })
  }
  // Eşleşmeyen iki taraf için "aynı kişi olabilir" adayları (ör. ASLAN/ARSLAN).
  for (const r of out.roster_only) {
    if (r.candidates.length) continue
    r.candidates = out.missing
      .map(m => ({ staff_id: m.staff_id, full_name: m.full_name, score: Math.round(nameSimilarity(r.name, m.full_name) * 100) / 100 }))
      .filter(c => c.score >= 0.75)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }
  for (const k of ['exit_pending', 'archived_present', 'missing', 'mismatches', 'fillable', 'exempt']) {
    out[k].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'))
  }
  return out
}

export function rosterReconciliation() {
  const f = rosterFindings(getDB(), { includeStale: true })
  const counts = Object.fromEntries(['exit_pending', 'archived_present', 'missing', 'roster_only', 'mismatches', 'fillable', 'exempt']
    .map(k => [k, f[k].length]))
  return { ...f, counts }
}

// ── Puantaj dışı işareti (müdür) ─────────────────────────────────────────────
// reason dolu → işaretle, null → kaldır. Önceki gerekçe döner (Hermes geri alması için).
export function setRosterExempt(userId, staffId, reason) {
  const db = getDB()
  const id = Number(staffId)
  const staff = Number.isInteger(id) && id > 0 ? db.prepare('SELECT id, full_name, hr_roster_exempt FROM staff WHERE id=?').get(id) : null
  if (!staff) throw fail('Personel bulunamadı', 404)
  const next = reason === null ? null : clean(reason, 200)
  if (reason !== null && !next) throw fail('Gerekçe zorunlu (ör. taşeron firma personeli)')
  db.prepare('UPDATE staff SET hr_roster_exempt=? WHERE id=?').run(next, id)
  logAudit(userId, next ? 'staff_hr_roster_exempt' : 'staff_hr_roster_exempt_remove', 'personnel', id, next || staff.hr_roster_exempt || '')
  return { staff_id: id, full_name: staff.full_name, reason: next, previous: staff.hr_roster_exempt || null }
}

// ── Boş alanları doldur (müdür) ──────────────────────────────────────────────
// Yalnız hâlâ boş olan alan yazılır (bu arada elle doldurulan alana dokunulmaz).
export function applyRosterFills(userId, { staffIds } = {}) {
  const db = getDB()
  const { fillable, snapshot } = rosterFindings(db)
  if (!snapshot) throw fail('Henüz İK kadro listesi alınmadı', 409)
  if (snapshot.stale) throw fail('İK kadro listesi bayat — ajanın güncel liste göndermesini bekleyin', 409)
  const only = Array.isArray(staffIds) && staffIds.length ? new Set(staffIds.map(Number)) : null
  const targets = fillable.filter(f => !only || only.has(f.staff_id))
  let staff = 0, fields = 0
  db.transaction(() => {
    for (const t of targets) {
      const cur = db.prepare('SELECT tc_no, hire_date, position, project_id FROM staff WHERE id=?').get(t.staff_id)
      const sets = Object.entries(t.fields).filter(([k]) => (k === 'tc_no' ? !validTc(cur.tc_no) : cur[k] == null || cur[k] === ''))
      if (sets.some(([k]) => k === 'tc_no')) {
        const clash = db.prepare('SELECT id FROM staff WHERE tc_no=? AND id<>?').get(t.fields.tc_no, t.staff_id)
        if (clash) sets.splice(sets.findIndex(([k]) => k === 'tc_no'), 1)
      }
      if (!sets.length) continue
      db.prepare(`UPDATE staff SET ${sets.map(([k]) => `${k}=?`).join(', ')} WHERE id=?`).run(...sets.map(([, v]) => v), t.staff_id)
      logAudit(userId, 'staff_fill_from_hr_roster', 'personnel', t.staff_id,
        sets.map(([k, v]) => `${k}: ${k === 'tc_no' ? `${String(v).slice(0, 3)}…` : v}`).join('; ').slice(0, 480))
      staff++
      fields += sets.length
    }
  })()
  return { staff, fields, snapshot_id: snapshot.id }
}

// ── Çizelge aktarımı için: yeni (YYS'de olmayan) kişinin İK bilgisi ─────────
// Güncel görüntüde ada (birebir ya da aksansız) TEK kayıt varsa döner; belirsizse null.
export function rosterLookupFactory(db = getDB()) {
  const snapshot = latestSnapshot(db)
  if (!snapshot || snapshot.stale) return () => null
  const rows = db.prepare('SELECT * FROM hr_roster_people WHERE snapshot_id=?').all(snapshot.id)
  const byExact = new Map(), byFold = new Map()
  const add = (map, key, row) => map.set(key, [...(map.get(key) || []), row])
  for (const r of rows) {
    add(byExact, normalizeName(r.name), r)
    add(byFold, r.name_fold, r)
  }
  return name => {
    const hits = byExact.get(normalizeName(name)) || byFold.get(foldName(name)) || []
    const tcs = new Set(hits.map(h => h.tc_no || h.name_fold))
    if (!hits.length || tcs.size > 1) return null // iki farklı kişi aynı adla → tahmin yok
    const projectIds = [...new Set(hits.map(h => h.project_id).filter(Boolean))]
    const h = hits[0]
    return {
      tc_no: h.tc_no, position: h.position, hire_date: h.hire_date, exit_date: h.exit_date,
      project_id: projectIds.length === 1 ? projectIds[0] : null, snapshot_id: snapshot.id,
    }
  }
}
