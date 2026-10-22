import { createNotification } from '../../shared/notifications/service.js'

// Çamaşır uyarılarının alıcıları. Eskiden kritik SLA ve kritik sarf stoğu hedefsiz (herkese) gidiyordu:
// kat görevlisi ve teknisyen de rafta unutulan torbaların "SLA KRİTİK"ini her hafta görüyordu. SLA
// uyarısı ise yalnız vardiya amirine gidiyor, asıl işi yapan çamaşırcı hiç görmüyordu.
// Sıra önemli: ilk rolün tekrar anahtarı (dedup_key) eki almaz — mevcut kayıtlarla süreklilik.
export const LAUNDRY_ALERT_ROLES = Object.freeze(['shift_supervisor', 'laundry'])
export const LAUNDRY_CRITICAL_ROLES = Object.freeze(['shift_supervisor', 'laundry', 'campus_manager'])

export function notifyLaundryRoles(roles, { dedup_key, ...notification }) {
  return roles.map((role, index) => createNotification({
    ...notification,
    target_role: role,
    dedup_key: dedup_key && index > 0 ? `${dedup_key}_${role}` : dedup_key,
  })).filter(Boolean)
}
