// Yıllık izin bakiyesi — TEK KAYNAK. Ekran, izin onayı, kiosk, self-servis, personel dosyası
// ve düşük bakiye listesi kalanı buradan alır. Hesabın dayanağı (basis) her zaman açıkça döner:
//
//   opening — İK onaylı tarihli açılış bakiyesi var:
//             kalan = açılış + açılıştan sonra dolan yıl dönümü hakları
//                     − açılış tarihinden SONRA başlayan onaylı yıllık izinler
//   legal   — açılış yok, işe giriş tarihi var: İş Kanunu m.53 hakkı − bu takvim yılındaki onaylı
//             yıllık izinler (önceki yıllardan devir BİLİNMİYOR → `carryover_unknown`)
//   unknown — ikisi de yok: kalan hesaplanamaz (null). Eskiden varsayılan 15 gün gösteriliyordu.
//
// Kullanılan gün kaynağı onaylı `leave_requests` defteridir; `leave_balance.annual_used`
// yalnız sayaçtır (personel takip uyarısı ikisinin farkını izler).
import { getDB } from '../../shared/db/index.js'
import { istanbulDate } from '../../shared/time.js'
import { computeAnnualEntitlement } from './leave-entitlement.js'

function addYearsIso(iso, n) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + n)
  return d.toISOString().slice(0, 10)
}

// (after, until] aralığında dolan her yıl dönümünde doğan hak.
export function accruedBetween({ hireDate, birthDate, after, until }) {
  if (!hireDate) return { days: 0, anniversaries: [] }
  const anniversaries = []
  for (let n = 1; n < 80; n++) {
    const date = addYearsIso(hireDate, n)
    if (date > until) break
    if (date <= after) continue
    const days = computeAnnualEntitlement({ hireDate, birthDate, asOf: date }).entitled_days
    anniversaries.push({ date, days })
  }
  return { days: anniversaries.reduce((sum, a) => sum + a.days, 0), anniversaries }
}

function approvedAnnualDays(db, staffId, { after = null, year = null } = {}) {
  if (after) {
    return db.prepare(`SELECT COALESCE(SUM(total_days),0) d FROM leave_requests
      WHERE staff_id=? AND leave_type='annual' AND status='approved' AND start_date > ?`).get(staffId, after).d
  }
  return db.prepare(`SELECT COALESCE(SUM(total_days),0) d FROM leave_requests
    WHERE staff_id=? AND leave_type='annual' AND status='approved' AND substr(start_date,1,4)=?`).get(staffId, String(year)).d
}

export function latestOpening(db, staffId, asOf) {
  return db.prepare(`
    SELECT id, as_of_date, days, source, source_label, decided_at FROM leave_opening_balances
    WHERE staff_id=? AND status='approved' AND as_of_date <= ?
    ORDER BY as_of_date DESC, id DESC LIMIT 1
  `).get(staffId, asOf) || null
}

export function computeAnnualBalance(staffId, { asOf, db = getDB() } = {}) {
  const staff = db.prepare('SELECT id, full_name, hire_date, birth_date FROM staff WHERE id=?').get(staffId)
  if (!staff) return null
  const today = asOf || istanbulDate()
  const pending = db.prepare(`SELECT id, as_of_date, days FROM leave_opening_balances
    WHERE staff_id=? AND status='pending' ORDER BY id DESC LIMIT 1`).get(staffId) || null
  const base = { staff_id: staff.id, as_of: today, pending_opening: pending }

  const opening = latestOpening(db, staffId, today)
  if (opening) {
    const accrued = accruedBetween({ hireDate: staff.hire_date, birthDate: staff.birth_date, after: opening.as_of_date, until: today })
    const used = approvedAnnualDays(db, staffId, { after: opening.as_of_date })
    return {
      ...base,
      basis: 'opening',
      opening,
      accrued: accrued.days,
      anniversaries: accrued.anniversaries,
      accrual_unknown: !staff.hire_date,
      used,
      remaining: Number(opening.days) + accrued.days - used,
    }
  }

  if (staff.hire_date) {
    const ent = computeAnnualEntitlement({ hireDate: staff.hire_date, birthDate: staff.birth_date, asOf: today })
    const year = Number(today.slice(0, 4))
    const used = approvedAnnualDays(db, staffId, { year })
    return {
      ...base,
      basis: 'legal',
      entitled: ent.entitled_days,
      has_started: ent.has_started,
      year,
      used,
      remaining: ent.has_started ? ent.entitled_days - used : 0,
      carryover_unknown: true,
    }
  }

  return {
    ...base,
    basis: 'unknown',
    used: approvedAnnualDays(db, staffId, { year: Number(today.slice(0, 4)) }),
    remaining: null,
    reason: 'İşe giriş tarihi ya da onaylı açılış bakiyesi yok — kalan izin hesaplanamaz',
  }
}

export const BASIS_LABEL = {
  opening: 'Onaylı açılış bakiyesi',
  legal: 'Yasal hak (devir hariç)',
  unknown: 'Hesaplanamıyor',
}
