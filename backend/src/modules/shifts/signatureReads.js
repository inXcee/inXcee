// İMZA FÖYÜ SAYFA OKUMALARI — fotoğraftan okunan her sayfa kaydedilir, föy kontrolü HAFTALIK BİRLEŞİMLE yapılır.
//
// Neden: föy takibi (signature_check_runs) bölüm × gün başına SON kontrolü gösterir. Sayfalar tek tek kontrol
// edildiğinde birden fazla sayfaya ya da projeye (FPU / Kamp Alanı) yayılan bir bölümde sonraki sayfa öncekini
// eziyordu. Burada her sayfanın son okuması saklanır; kontrol, o haftanın tüm baskılarındaki okumaların
// birleşimiyle (aynı kişi + gün için en yeni okuma) yapılır → her kontrol o ana kadar gelen her şeyi kapsar.
// Aynı kayıtlar "hangi föy sayfası geldi / gelmedi" takibinin (weekProgress) kaynağıdır.
import { getDB } from '../../shared/db/index.js'
import { checkSignatureSheet } from './signatureCheck.js'
import { mondayOf } from './signatureSheet.js'

export class ReadError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const MARKS = new Set(['signed', 'blank'])

function parsePrint(row) {
  const layout = JSON.parse(row.layout_json)
  const dates = JSON.parse(row.dates_json || '[]')
  const firstDay = dates[0] || layout.columns?.[0]?.date
  return {
    id: row.id,
    week: row.week_start || (firstDay ? mondayOf(firstDay) : null),
    groupKey: row.group_key || null,
    title: row.title || null,
    createdAt: row.created_at,
    layout,
  }
}

/** Baskının imza sayfaları: [{ index (fiziksel), no (1'den), title, staff: Set }]. Değişiklik sayfası hariç. */
export function rosterPages(print) {
  return print.layout.pages.filter(p => p.kind === 'roster').map((p, i) => ({
    index: p.index,
    no: i + 1,
    title: p.department || '',
    staff: new Set(p.rows.filter(r => !r.blank && r.staff_id).map(r => r.staff_id)),
  }))
}

function printTitle(print) {
  if (print.title) return print.title
  const titles = [...new Set(rosterPages(print).map(p => p.title).filter(Boolean))]
  return titles.length <= 1 ? (titles[0] || `Föy ${print.id}`) : `${titles[0]} +${titles.length - 1}`
}

function loadPrint(db, id) {
  const row = db.prepare(`SELECT id, week_start, dates_json, layout_json, group_key, title, created_at
    FROM signature_sheet_prints WHERE id = ? AND layout_json IS NOT NULL`).get(id)
  return row ? parsePrint(row) : null
}

/** O haftanın (pazartesi ISO) tüm baskıları. week_start'ı olmayan eski baskılar ilk günlerinden haftaya bağlanır. */
export function weekPrints(week, db = getDB()) {
  return db.prepare(`SELECT id, week_start, dates_json, layout_json, group_key, title, created_at
    FROM signature_sheet_prints WHERE layout_json IS NOT NULL AND (week_start = ? OR week_start IS NULL)`)
    .all(week).map(parsePrint).filter(p => p.week === week)
}

/** Her (baskı, sayfa) için SON okuma: Map(printId → Map(pageIndex → { id, rows, photo_day, created_at, stats })). */
function latestReads(db, printIds) {
  const out = new Map()
  if (!printIds.length) return out
  const marks = printIds.map(() => '?').join(',')
  for (const r of db.prepare(`SELECT id, print_id, page_index, rows_json, stats_json, photo_day, created_at
      FROM signature_sheet_reads WHERE print_id IN (${marks}) ORDER BY id`).all(...printIds)) {
    if (!out.has(r.print_id)) out.set(r.print_id, new Map())
    out.get(r.print_id).set(r.page_index, {
      id: r.id, rows: JSON.parse(r.rows_json), photo_day: r.photo_day, created_at: r.created_at,
      stats: r.stats_json ? JSON.parse(r.stats_json) : null,
    })
  }
  return out
}

function validateRows(rows, page, dates) {
  const seen = new Map()
  for (const r of rows) {
    if (!page.staff.has(r.staff_id)) throw new ReadError(400, `Personel #${r.staff_id} bu föy sayfasında basılı değil`)
    if (!dates.has(r.date)) throw new ReadError(400, `${r.date} bu föyün günlerinden değil`)
    if (!MARKS.has(r.mark)) throw new ReadError(400, `Geçersiz işaret: ${r.mark}`)
    seen.set(`${r.staff_id}|${r.date}`, { staff_id: r.staff_id, date: r.date, mark: r.mark })
  }
  return [...seen.values()]
}

/** Bir föy sayfasının fotoğraftan okunmuş kesin hücreleri. → { readId, week } */
export function recordPageRead({ printId, page, rows, stats = null, photoDay = null, source = 'telegram', userId = null },
  db = getDB()) {
  const print = loadPrint(db, printId)
  if (!print) throw new ReadError(404, 'Föy baskısı bulunamadı')
  const pg = rosterPages(print).find(p => p.index === page)
  if (!pg) throw new ReadError(400, 'Bu sayfa baskının imza sayfası değil')
  const clean = validateRows(rows, pg, new Set((print.layout.columns || []).map(c => c.date)))
  const id = db.prepare(`INSERT INTO signature_sheet_reads(print_id, page_index, photo_day, rows_json, stats_json, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(printId, page, photoDay, JSON.stringify(clean), stats ? JSON.stringify(stats) : null,
    source, userId).lastInsertRowid
  return { readId: Number(id), week: print.week }
}

/** Okunan hücrede elle düzeltme (belirsiz hücre → imzalı / boş). Okumanın satırları güncellenir. → { readId, week } */
export function correctRead(readId, corrections, db = getDB()) {
  const read = db.prepare('SELECT id, print_id, page_index, rows_json FROM signature_sheet_reads WHERE id = ?').get(readId)
  if (!read) throw new ReadError(404, 'Föy okuması bulunamadı')
  const print = loadPrint(db, read.print_id)
  const pg = print && rosterPages(print).find(p => p.index === read.page_index)
  if (!pg) throw new ReadError(404, 'Föy baskısı bulunamadı')
  const merged = new Map(JSON.parse(read.rows_json).map(r => [`${r.staff_id}|${r.date}`, r]))
  for (const r of validateRows(corrections, pg, new Set((print.layout.columns || []).map(c => c.date)))) {
    merged.set(`${r.staff_id}|${r.date}`, r)
  }
  db.prepare('UPDATE signature_sheet_reads SET rows_json = ? WHERE id = ?').run(JSON.stringify([...merged.values()]), readId)
  return { readId, week: print.week }
}

/**
 * Haftanın birleşik kontrolü: tüm baskıların her sayfasının son okuması; aynı kişi + gün için en yeni okuma geçerli.
 * Föy takibine işlemek çağıranın işi (recordSignatureCheck). Satır yoksa null.
 */
export function checkWeek(week, db = getDB()) {
  const prints = weekPrints(week, db)
  const reads = [...latestReads(db, prints.map(p => p.id)).values()].flatMap(m => [...m.values()]).sort((a, b) => a.id - b.id)
  const merged = new Map()
  for (const r of reads) for (const row of r.rows) merged.set(`${row.staff_id}|${row.date}`, row)
  const rows = [...merged.values()]
  if (!rows.length) return null
  const onSheet = new Set()
  for (const p of prints) for (const pg of rosterPages(p)) for (const id of pg.staff) onSheet.add(id)
  return checkSignatureSheet({ rows, sheet_staff_ids: [...onSheet] }, db)
}

/**
 * Haftanın föy sayfaları: grup başına beklenen baskı + hangi sayfa okundu.
 * Grup (sade föy: proje) başına tek baskı beklenir; yeniden basılmışsa EN ÇOK okunan (eşitse en yeni) esas alınır.
 * Grupsuz baskı (web bölüm föyü) yalnız okunmuş sayfası varsa listelenir — denemelik baskı "eksik" uyarısı üretmez.
 * → [{ print_id, group_key, title, total, read, pages: [{ no, index, read_id, read_at, photo_day }], missing: [no] }]
 */
export function weekProgress(week, db = getDB()) {
  const prints = weekPrints(week, db)
  const reads = latestReads(db, prints.map(p => p.id))
  const chosen = new Map()
  for (const p of prints) {
    const nReads = reads.get(p.id)?.size || 0
    if (!p.groupKey && nReads === 0) continue
    const key = p.groupKey ? `g:${p.groupKey}` : `p:${p.id}`
    const cur = chosen.get(key)
    if (!cur || nReads > cur.nReads || (nReads === cur.nReads && p.id > cur.print.id)) chosen.set(key, { print: p, nReads })
  }
  return [...chosen.values()]
    .map(({ print }) => {
      const pages = rosterPages(print).map(pg => {
        const r = reads.get(print.id)?.get(pg.index)
        return { no: pg.no, index: pg.index, read_id: r?.id ?? null, read_at: r?.created_at ?? null, photo_day: r?.photo_day ?? null }
      })
      return {
        print_id: print.id, group_key: print.groupKey, title: printTitle(print),
        total: pages.length, read: pages.filter(p => p.read_id).length,
        pages, missing: pages.filter(p => !p.read_id).map(p => p.no),
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
}

/**
 * Föy takibi için: SADE haftalık föyü basılmış haftalar ve bölüm başına föy sayfaları.
 * → Map(week → { due, depts: Map(deptId → [{ read, photo_day }]) }) — due: föyün gelmesi beklenen son gün (hafta
 * bitiminden sonraki pazartesi); o güne kadar okunmamış gün "gelmedi" değil "bekleniyor" sayılır.
 */
export function printedWeekDeptPages(weeks, db = getDB()) {
  const out = new Map()
  const deptOf = new Map(db.prepare('SELECT id, department_id FROM staff').all().map(s => [s.id, s.department_id]))
  for (const week of weeks) {
    const progress = weekProgress(week, db)
    if (!progress.some(p => p.group_key)) continue          // yalnız sade haftalık föy basılmış haftalar
    const depts = new Map()
    for (const pr of progress) {
      const print = loadPrint(db, pr.print_id)
      for (const pg of rosterPages(print)) {
        const info = pr.pages.find(x => x.index === pg.index)
        const page = { read: info?.read_id != null, photo_day: info?.photo_day ?? null }
        for (const d of new Set([...pg.staff].map(id => deptOf.get(id)).filter(x => x != null))) {
          if (!depts.has(d)) depts.set(d, [])
          depts.get(d).push(page)
        }
      }
    }
    const due = new Date(`${week}T00:00:00Z`)
    due.setUTCDate(due.getUTCDate() + 7)
    out.set(week, { due: due.toISOString().slice(0, 10), depts })
  }
  return out
}
