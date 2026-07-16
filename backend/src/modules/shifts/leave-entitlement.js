import { getDB } from '../../shared/db/index.js'

// Türk İş Kanunu m.53 — yıllık ücretli izin hak edişi.
// Hizmet süresi 1 yıldan az → hak doğmamış. Kıdeme göre:
//   1–5 yıl (5 dahil)          → 14 gün
//   5 yıldan fazla, 15'ten az   → 20 gün
//   15 yıl ve üzeri             → 26 gün
// Yaş kuralı: 18'den küçük veya 50 ve üzeri → en az 20 gün.

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

// İki tarih arasındaki tam yıl/ay farkı (takvim bazlı, gün taşımalı).
function diffYearsMonths(from, to) {
  let years = to.getUTCFullYear() - from.getUTCFullYear()
  let months = to.getUTCMonth() - from.getUTCMonth()
  let days = to.getUTCDate() - from.getUTCDate()
  if (days < 0) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  return { years: Math.max(0, years), months: Math.max(0, months) }
}

function addYears(date, count) {
  const next = new Date(date.getTime())
  next.setUTCFullYear(next.getUTCFullYear() + count)
  return next
}

function tierDays(serviceYears) {
  if (serviceYears < 1) return 0
  if (serviceYears <= 5) return 14        // 1–5 yıl (5 dahil)
  if (serviceYears < 15) return 20        // 5'ten fazla, 15'ten az
  return 26                                // 15 yıl ve üzeri
}

export function computeAnnualEntitlement({ hireDate, birthDate, asOf } = {}) {
  const hire = parseDate(hireDate)
  const today = parseDate(asOf) || new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  if (!hire) {
    return {
      has_hire_date: false, has_started: false, entitled_days: 0,
      service_years: 0, service_months: 0, age_rule_applied: false,
      entitlement_start_date: null, next_anniversary: null, days_to_start: null,
    }
  }
  const service = diffYearsMonths(hire, today)
  const entitlementStart = addYears(hire, 1)
  const hasStarted = today.getTime() >= entitlementStart.getTime()

  let entitledDays = tierDays(service.years)
  // Yaş kuralı — yalnız hak doğmuşsa uygulanır.
  let ageRuleApplied = false
  const birth = parseDate(birthDate)
  if (hasStarted && birth) {
    const age = diffYearsMonths(birth, today).years
    if (age < 18 || age >= 50) {
      entitledDays = Math.max(entitledDays, 20)
      ageRuleApplied = true
    }
  }
  if (!hasStarted) entitledDays = 0

  // Bir sonraki yıl dönümü (hak yenilenme tarihi).
  let nextAnniversary = entitlementStart
  while (nextAnniversary.getTime() <= today.getTime()) {
    nextAnniversary = addYears(nextAnniversary, 1)
  }
  const daysToStart = hasStarted
    ? 0
    : Math.ceil((entitlementStart.getTime() - today.getTime()) / 86400000)

  return {
    has_hire_date: true,
    has_started: hasStarted,
    entitled_days: entitledDays,
    service_years: service.years,
    service_months: service.months,
    age_rule_applied: ageRuleApplied,
    entitlement_start_date: isoDate(entitlementStart),
    next_anniversary: isoDate(nextAnniversary),
    days_to_start: daysToStart,
  }
}

// Personel + bakiye ile birleşik hak ediş özeti.
export function annualLeaveSummary(staffId, { asOf } = {}) {
  const db = getDB()
  const staff = db.prepare('SELECT id, full_name, hire_date, birth_date FROM staff WHERE id=?').get(staffId)
  if (!staff) return null
  const entitlement = computeAnnualEntitlement({
    hireDate: staff.hire_date, birthDate: staff.birth_date, asOf,
  })
  const year = new Date().getFullYear()
  db.prepare('INSERT OR IGNORE INTO leave_balance(staff_id, year) VALUES(?,?)').run(staffId, year)
  const balance = db.prepare('SELECT * FROM leave_balance WHERE staff_id=? AND year=?').get(staffId, year)
  const used = balance?.annual_used || 0
  const trackedTotal = balance?.annual_total ?? null
  const remaining = entitlement.has_started ? Math.max(0, entitlement.entitled_days - used) : 0
  return {
    staff_id: staff.id,
    hire_date: staff.hire_date,
    ...entitlement,
    year,
    annual_used: used,
    tracked_total: trackedTotal,
    remaining,
    // Yasal hak ile takip edilen bakiye uyuşmuyorsa uyarı (annual_total elle set edilmiş olabilir).
    mismatch: entitlement.has_started && trackedTotal != null && trackedTotal !== entitlement.entitled_days,
  }
}
