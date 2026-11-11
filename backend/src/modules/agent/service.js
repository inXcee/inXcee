import { getKPI, getBedOccupancy, getHealthScore, getAnomalies } from '../dashboard/queries.js'
import { listBackupsService } from '../backup/service.js'
import { alertsService } from '../water/service.js'

// Ajana giden her yanıt TOPLU sayıdır: personel adı, TC, telefon, imza gibi
// kişisel veri bu modülden çıkmaz (KVKK — veri LLM sağlayıcısına gider).
// Yeni alan eklerken aynı kural geçerli.

// Gece yedeği 03:00'te alınır, gün içinde ek yedekler de oluşur. Son yedek
// 26 saatten eskiyse en az bir gece kaçırılmış demektir.
export const BACKUP_STALE_HOURS = 26

const hoursSince = (iso, now) => Math.round(((now - new Date(iso).getTime()) / 3600000) * 10) / 10

export function backupStatusService({ now = Date.now() } = {}) {
  const backups = listBackupsService()
  const latest = backups[0] || null
  const latestAge = latest ? hoursSince(latest.created_at, now) : null
  return {
    total: backups.length,
    last_24h: backups.filter(b => hoursSince(b.created_at, now) <= 24).length,
    latest: latest && { name: latest.name, size: latest.size, created_at: latest.created_at, age_hours: latestAge },
    stale: latest === null || latestAge > BACKUP_STALE_HOURS,
    stale_after_hours: BACKUP_STALE_HOURS,
  }
}

export function waterAlertsService({ today } = {}) {
  const a = alertsService({ today })
  return {
    date: a.date,
    month: a.month,
    summary: a.summary,
    pending_waybill: a.pending_waybill,
    negative_stock: a.negative_stock,
    low_stock: a.low_stock,
    over_distributed: a.over_distributed,
    plan_behind_zones: a.plan_behind_zones,
  }
}

export function overviewService({ today } = {}) {
  const kpi = getKPI()
  const health = getHealthScore()
  return {
    generated_at: new Date().toISOString(),
    kpi,
    health_score: { score: health.score, color: health.color, breakdown: health.breakdown },
    anomalies: getAnomalies().anomalies,
    water: waterAlertsService({ today }).summary,
    backups: backupStatusService(),
  }
}

export { getBedOccupancy as occupancyService, getAnomalies as anomaliesService }
