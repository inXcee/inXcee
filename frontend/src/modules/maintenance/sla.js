import { parseSqlUtc } from '../../shared/logic/localDate.js'

// Gecikme sunucunun tanımıyla (backend sla.js): tamamlanmamış ve SLA süresi UTC anına göre dolmuş.
// Sayfa eskiden yalnız status=open talepleri alıp sla_deadline'ı yerel saat sanıyordu.
export function isSlaOverdue(request, now = new Date()) {
  if (!request || request.status === 'done') return false
  const deadline = parseSqlUtc(request.sla_deadline)
  return deadline != null && deadline < now
}
