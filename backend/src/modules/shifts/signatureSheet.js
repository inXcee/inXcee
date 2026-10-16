// SADE HAFTALIK İMZA FÖYÜ — model sunucuda kurulur (Hermes "/foy yazdır" ve web aynı çıktıyı alır).
//
// Kullanıcı isteği (16.10.2026, Hermes'e): "fazla detay olmasın, kağıt sade gözüksün; aynı lokasyonu tek çatı
// altında topla, yanına sürekli görevini yazma; puantajdaki Kamp Alanı ve FPU olarak ayır". Bu yüzden:
//   • proje başına ayrı föy (proje atanmamış kişiler kaybolmasın diye kendi föyünde),
//   • bölüm bandı altında kişiler (görev sütunu yok), sıra yöneticinin çizelge sırası (schedule_order),
//   • hücrede vardiya saati yok: yalnız imza aranmayan günler (OFF / izin / rapor / yok) yazılır,
//   • planı henüz yüklenmemiş gün (gelecek hafta) BOŞ ve imzalanabilir — föy okunurken YYS o günün gerçek
//     çizelgesiyle karşılaştırır (signatureCheck), basıldığı andaki plana güvenmez.
// Çizim signaturePdf.js'te, köşe işaretleri + baskı kaydı signaturePrints.js'te (fotoğraftan okunur).
import { getDB } from '../../shared/db/index.js'
import { classifyScheduleCell } from './signatureCheck.js'

export const PLAIN_ROWS_PER_PAGE = 25
export const NO_PROJECT = 'none'
const NO_PROJECT_NAME = 'Proje atanmamış'
const NO_DEPARTMENT = 'BÖLÜMSÜZ'
const LABELS = { off: 'OFF', annual: 'YILLIK İZİN', report: 'RAPORLU', other_leave: 'İZİNLİ', absent: 'YOK' }
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const ISO = /^\d{4}-\d{2}-\d{2}$/

function utc(iso) {
  if (!ISO.test(String(iso || ''))) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d
}

/** ISO tarih → aynı haftanın pazartesisi (ISO) ya da geçersizse null. */
export function mondayOf(iso) {
  const d = utc(iso)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function weekDates(monday) {
  const d = utc(monday)
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d)
    x.setUTCDate(d.getUTCDate() + i)
    return x.toISOString().slice(0, 10)
  })
}

/** "1–7 Mart 2027", ay/yıl değişiyorsa "28 Eylül – 4 Ekim 2026" / "28 Aralık 2026 – 3 Ocak 2027". */
export function weekLabel(dates) {
  const [y1, m1, d1] = dates[0].split('-').map(Number)
  const [y2, m2, d2] = dates[dates.length - 1].split('-').map(Number)
  if (y1 !== y2) return `${d1} ${AYLAR[m1 - 1]} ${y1} – ${d2} ${AYLAR[m2 - 1]} ${y2}`
  if (m1 !== m2) return `${d1} ${AYLAR[m1 - 1]} – ${d2} ${AYLAR[m2 - 1]} ${y2}`
  return `${d1}–${d2} ${AYLAR[m2 - 1]} ${y2}`
}

// Föyde kim var: aktif, arşivlenmemiş, hafta başlamadan ayrılmamış, haftadan sonra işe girmeyecek personel.
function weekStaff(db, dates, group) {
  const params = [dates[0], dates[dates.length - 1]]
  let projectSql = 's.project_id IS NULL'
  if (group !== NO_PROJECT) {
    projectSql = 's.project_id = ?'
    params.push(Number(group))
  }
  return db.prepare(`
    SELECT s.id, s.full_name, s.schedule_order, d.name AS department
    FROM staff s LEFT JOIN departments d ON d.id = s.department_id
    WHERE s.is_active = 1 AND s.archived_at IS NULL
      AND (s.exit_date IS NULL OR s.exit_date >= ?)
      AND (s.hire_date IS NULL OR s.hire_date <= ?)
      AND ${projectSql}
  `).all(...params)
}

/** Föy grupları (proje sırasıyla; boş grup yok): [{ key: '<proje id>'|'none', name, people }]. */
export function signatureSheetGroups(monday, db = getDB()) {
  const dates = weekDates(monday)
  const groups = db.prepare('SELECT id, name FROM projects WHERE is_active = 1 ORDER BY sort_order, name').all()
    .map(p => ({ key: String(p.id), name: p.name, people: weekStaff(db, dates, String(p.id)).length }))
  groups.push({ key: NO_PROJECT, name: NO_PROJECT_NAME, people: weekStaff(db, dates, NO_PROJECT).length })
  return groups.filter(g => g.people > 0)
}

function cellFor(cell, date) {
  const category = classifyScheduleCell(cell)
  if (category === 'working' || category === 'unplanned') {
    return { date, category, label: '', detail: '', can_sign: true }
  }
  return { date, category, label: LABELS[category], detail: '', can_sign: false }
}

const tr = (a, b) => a.localeCompare(b, 'tr')

/**
 * @returns {{ model: object, title: string, groupName: string } | null}  grup yoksa / boşsa null
 */
export function buildPlainWeeklyModel({ weekStart, group }, db = getDB()) {
  const monday = mondayOf(weekStart)
  if (!monday) return null
  const dates = weekDates(monday)
  let groupName = NO_PROJECT_NAME
  if (group !== NO_PROJECT) {
    const p = db.prepare('SELECT name FROM projects WHERE id = ?').get(Number(group))
    if (!p) return null
    groupName = p.name
  }
  const people = weekStaff(db, dates, group)
  if (!people.length) return null

  const marks = dates.map(() => '?').join(',')
  const cells = new Map()
  for (const c of db.prepare(`SELECT staff_id, work_date, status, leave_type FROM shift_schedule WHERE work_date IN (${marks})`)
    .all(...dates)) cells.set(`${c.staff_id}|${c.work_date}`, c)

  const order = (p) => (p.schedule_order == null ? Number.MAX_SAFE_INTEGER : p.schedule_order)
  const rows = people
    .map(p => ({ ...p, department: (p.department || NO_DEPARTMENT).toLocaleUpperCase('tr') }))
    .sort((a, b) => ((a.department === NO_DEPARTMENT) - (b.department === NO_DEPARTMENT))
      || tr(a.department, b.department) || order(a) - order(b) || tr(a.full_name, b.full_name))
    .map(p => ({
      staff_id: p.id,
      full_name: p.full_name,
      role: '',
      department: p.department,
      days: dates.map(d => cellFor(cells.get(`${p.id}|${d}`), d)),
    }))

  const title = groupName.toLocaleUpperCase('tr')
  const pageCount = Math.ceil(rows.length / PLAIN_ROWS_PER_PAGE)
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    department: title,
    title: `${title} — HAFTALIK İMZA FÖYÜ`,
    combined: true,
    rows: rows.slice(i * PLAIN_ROWS_PER_PAGE, (i + 1) * PLAIN_ROWS_PER_PAGE),
    page: i + 1,
    page_count: pageCount,
    row_offset: i * PLAIN_ROWS_PER_PAGE,
    show_blank_rows: i === pageCount - 1,
    people_total: rows.length,
  }))
  return {
    title,
    groupName,
    model: {
      dates,
      opts: {
        showLocationAndRole: false, doubleSignature: false, blankRows: 3, changeRows: 0, showDepartmentBands: true,
        shortDates: true,
      },
      pages,
      people_count: rows.length,
    },
  }
}

/** Dosya adı için ASCII parça: "KAMP ALANI" → "kamp-alani". */
export function slugTr(text) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }
  return String(text || '').toLocaleLowerCase('tr').replace(/[çğıiöşü]/g, ch => map[ch] || ch)
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'foy'
}
