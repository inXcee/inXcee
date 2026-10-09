import crypto from 'node:crypto'
import { getDB } from '../../shared/db/index.js'
import { classifyScheduleCell } from './signatureCheck.js'

// İmzalı föy dönüş takibi.
//
// checkSignatureSheet sonucu gün × bölüm parçalarına bölünüp kaydedilir; kapsama
// tablosu "hangi bölümün hangi günkü föyü kontrol edildi / uyarılı / hiç gelmedi"
// sorusunu cevaplar. Puantaja yine hiçbir şey yazılmaz.

const FINDINGS_LIMIT = 60

const keyOf = (date, dept) => `${date}|${dept ?? ''}`

/**
 * @param {ReturnType<import('./signatureCheck.js').checkSignatureSheet>} result
 * @param {{ department_id?: number|null, source?: 'web'|'telegram', userId?: number|null }} opts
 */
export function recordSignatureCheck(result, { department_id = null, source = 'web', userId = null } = {}, db = getDB()) {
  const deptOf = new Map(db.prepare('SELECT id, department_id FROM staff').all().map(s => [s.id, s.department_id]))
  const parts = new Map()
  const part = (date, dept) => {
    const k = keyOf(date, dept)
    if (!parts.has(k)) {
      parts.set(k, {
        work_date: date, department_id: dept ?? null, rows_count: 0, signed_ok: 0, not_working_ok: 0, warnings: 0,
        missing_signature: 0, mark_mismatch: 0, signed_not_working: 0, unmatched: 0, not_on_sheet: 0, findings: [],
      })
    }
    return parts.get(k)
  }
  const note = (p, f) => { if (p.findings.length < FINDINGS_LIMIT) p.findings.push(f) }
  const requested = department_id != null ? Number(department_id) : null

  for (const i of result.items) {
    const p = part(i.date, deptOf.get(i.staff_id) ?? requested)
    p.rows_count++
    if (i.verdict === 'ok') p.signed_ok++
    if (i.verdict === 'ok_not_working' || i.verdict === 'ok_mark_matches') p.not_working_ok++
    if (i.verdict === 'missing_signature') p.missing_signature++
    if (i.verdict === 'mark_mismatch') p.mark_mismatch++
    if (i.verdict === 'signed_not_working' || i.verdict === 'signed_unplanned') p.signed_not_working++
    if (i.level === 'warn') {
      p.warnings++
      note(p, { kind: 'warn', name: i.full_name, text: i.text })
    }
  }
  for (const u of result.unmatched) {
    const p = part(u.date, requested)
    p.rows_count++
    p.unmatched++
    note(p, { kind: 'unmatched', name: u.name ?? `#${u.staff_id}`, text: u.reason })
  }
  for (const n of result.not_on_sheet) {
    const p = part(n.date, deptOf.get(n.staff_id) ?? requested)
    p.not_on_sheet++
    note(p, { kind: 'not_on_sheet', name: n.full_name, text: 'çalışıyor ama föyde yok' })
  }
  // Bölüm seçilip föyde o bölümden kimse çıkmadıysa da "kontrol edildi" izi kalsın.
  if (requested != null) for (const d of result.dates) part(d, requested)

  const batch = crypto.randomUUID()
  const ins = db.prepare(`
    INSERT INTO signature_check_runs(batch_id, work_date, department_id, source, rows_count, signed_ok, not_working_ok,
      warnings, missing_signature, mark_mismatch, signed_not_working, unmatched, not_on_sheet, findings_json, created_by)
    VALUES (@batch, @work_date, @department_id, @source, @rows_count, @signed_ok, @not_working_ok,
      @warnings, @missing_signature, @mark_mismatch, @signed_not_working, @unmatched, @not_on_sheet, @findings_json, @created_by)
  `)
  const rows = [...parts.values()]
  db.transaction(() => {
    for (const p of rows) {
      const { findings, ...rest } = p
      ins.run({ ...rest, batch, source, findings_json: findings.length ? JSON.stringify(findings) : null, created_by: userId })
    }
  })()
  return { batch_id: batch, parts: rows.length }
}

// Bir hücrenin durumu. Föy ertesi gün döner: bugünün eksiği "bekleniyor", geçmişinki "gelmedi".
export function cellStatus({ planned, run, date, today }) {
  if (run) return run.warnings || run.unmatched || run.not_on_sheet ? 'warn' : 'clean'
  if (!planned) return 'not_needed'
  return date < today ? 'missing' : 'pending'
}

/**
 * Kapsama: [from, to] günleri × çalışanı planlanmış bölümler.
 * @returns {{ days: string[], today: string, departments: Array<{id:number,name:string,cells:Record<string,object>}>, summary: object }}
 */
export function buildSignatureCoverage({ from, to }, db = getDB()) {
  const days = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  const today = db.prepare("SELECT date('now','localtime') AS d").get().d

  const planned = new Map()
  for (const c of db.prepare(`
    SELECT ss.work_date, s.department_id, ss.status, ss.leave_type FROM shift_schedule ss
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.work_date BETWEEN ? AND ? AND s.is_active = 1 AND s.department_id IS NOT NULL
  `).all(from, to)) {
    if (classifyScheduleCell(c) !== 'working') continue
    const k = keyOf(c.work_date, c.department_id)
    planned.set(k, (planned.get(k) || 0) + 1)
  }

  const runs = new Map()
  for (const r of db.prepare(`
    SELECT r.* FROM signature_check_runs r
    JOIN (SELECT work_date, department_id, MAX(id) AS id FROM signature_check_runs
          WHERE work_date BETWEEN ? AND ? AND department_id IS NOT NULL GROUP BY work_date, department_id) last
      ON last.id = r.id
  `).all(from, to)) runs.set(keyOf(r.work_date, r.department_id), r)

  const deptIds = new Set([...planned.keys(), ...runs.keys()].map(k => Number(k.split('|')[1])))
  const names = new Map(db.prepare('SELECT id, name FROM departments').all().map(d => [d.id, d.name]))
  const summary = { expected: 0, checked: 0, clean: 0, warn: 0, missing: 0, pending: 0 }

  const departments = [...deptIds]
    .map(id => {
      const cells = {}
      for (const date of days) {
        const k = keyOf(date, id)
        const run = runs.get(k) || null
        const status = cellStatus({ planned: planned.get(k) || 0, run, date, today })
        cells[date] = {
          status,
          planned: planned.get(k) || 0,
          ...(run ? {
            run_id: run.id, source: run.source, checked_at: run.created_at,
            warnings: run.warnings, unmatched: run.unmatched, not_on_sheet: run.not_on_sheet,
            missing_signature: run.missing_signature, mark_mismatch: run.mark_mismatch,
            findings: run.findings_json ? JSON.parse(run.findings_json) : [],
          } : {}),
        }
        if (planned.get(k)) summary.expected++
        if (run) summary.checked++
        if (status in summary) summary[status]++
      }
      return { id, name: names.get(id) || `#${id}`, cells }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return { days, today, departments, summary }
}
