// İmza föyü baskı kaydı — PDF her basıldığında bir numara alır; köşe işaretleri bu numarayı taşır.
// Okuyucu (fotoğraftan imza okuma) yerleşimi ve basılı şablonu buradan çeker. Bkz. signatureMarkers.js.
import { getDB } from '../../shared/db/index.js'
import { MAX_PRINT_ID } from './signatureMarkers.js'

export function createPrint({ weekStart = null, dates = [], userId = null }) {
  const r = getDB().prepare(`
    INSERT INTO signature_sheet_prints(week_start, dates_json, created_by) VALUES(?, ?, ?)
  `).run(weekStart, JSON.stringify(dates), userId)
  const id = Number(r.lastInsertRowid)
  // Köşe işaretleri 62.499 baskıya kadar kimlik taşıyabilir (haftada birkaç baskıyla yüzyıllar). Aşılırsa
  // işaretsiz basılır — föy yine kullanılır, yalnız fotoğraftan okunmaz.
  return id <= MAX_PRINT_ID ? id : null
}

export function finalizePrint(id, { layout, pdf, pageCount }) {
  getDB().prepare('UPDATE signature_sheet_prints SET layout_json=?, pdf=?, page_count=? WHERE id=?')
    .run(JSON.stringify(layout), pdf, pageCount, id)
}

export function deletePrint(id) {
  getDB().prepare('DELETE FROM signature_sheet_prints WHERE id=?').run(id)
}

export function getPrint(id) {
  const row = getDB().prepare(`
    SELECT p.id, p.week_start, p.dates_json, p.layout_json, p.page_count, p.created_at, u.full_name AS created_by_name
    FROM signature_sheet_prints p LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id=? AND p.layout_json IS NOT NULL
  `).get(id)
  if (!row) return null
  const { dates_json: dates, layout_json: layout, ...rest } = row
  return { ...rest, dates: JSON.parse(dates), layout: JSON.parse(layout) }
}

export function getPrintPdf(id) {
  return getDB().prepare('SELECT pdf FROM signature_sheet_prints WHERE id=? AND pdf IS NOT NULL').get(id)?.pdf || null
}
