// Yemekhane iş mantığı — öğün hakkı (entitlement) kontrolü.
//
// ÖNEMLİ: Bu kontrol İNSANSIZ okutma (cafeteria istasyonu /stations/scan) için
// uygulanır. Manuel `/meals/log` (yönetici eylemi) KASITLI olarak kontrol
// uygulamaz — yönetici override yetkisine sahiptir (mevcut davranış korunur).

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

// İstasyon meal_type göndermezse okutma saatine göre öğünü türet.
// (Yemekhane istasyonu genelde tek öğün servis eder ama esneklik için fallback.)
export function mealTypeForNow(now = new Date()) {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 22) return 'dinner'
  return 'snack'
}

// { eligible: bool, reason: 'ok'|'duplicate'|'on_leave'|'not_scheduled' }
export function isEligible(db, staffId, mealType, date) {
  // 1) Aynı gün+öğün zaten alınmış mı (meal_logs UNIQUE ile aynı mantık, önden kontrol)
  const dup = db.prepare(
    'SELECT 1 FROM meal_logs WHERE staff_id=? AND meal_type=? AND meal_date=?'
  ).get(staffId, mealType, date)
  if (dup) return { eligible: false, reason: 'duplicate' }

  // 2) O tarihte onaylı izinde mi
  const onLeave = db.prepare(
    `SELECT 1 FROM leave_requests WHERE staff_id=? AND status='approved' AND ? BETWEEN start_date AND end_date`
  ).get(staffId, date)
  if (onLeave) return { eligible: false, reason: 'on_leave' }

  // 3) O gün vardiyada planlı/çalışıyor mu (absent/on_leave statüleri hak vermez)
  const scheduled = db.prepare(
    `SELECT 1 FROM shift_schedule WHERE staff_id=? AND work_date=? AND status IN ('scheduled','worked','overtime')`
  ).get(staffId, date)
  if (!scheduled) return { eligible: false, reason: 'not_scheduled' }

  return { eligible: true, reason: 'ok' }
}

// Cafeteria okutması başarılıysa meal_logs'a yaz (method='qr'). Uygunluk
// çağıran tarafından kontrol edilmiş varsayılır; UNIQUE çakışması yine de
// güvenli şekilde yakalanır (yarış durumu → duplicate).
export function logMealFromScan(db, staffId, mealType, date) {
  try {
    return db.prepare(
      `INSERT INTO meal_logs(staff_id, meal_type, meal_date, method) VALUES(?,?,?,'qr')`
    ).run(staffId, mealType, date).lastInsertRowid
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return null // başka istasyon aynı anda yazdı
    throw e
  }
}
