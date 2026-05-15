import * as queries from './queries.js'

export function getHousekeepingReport(date) {
  const tasks = queries.getCleaningTasks(date)
  const total = tasks.length
  const done = tasks.filter(t => t.durum === 'Tamamlandi').length
  const skipped = tasks.filter(t => t.durum === 'Atlandi').length
  return { tasks, total, done, skipped, pending: total - done - skipped }
}

export function getMaintenanceReport() {
  const requests = queries.getWeeklyMaintenance()
  const open = requests.filter(r => r.durum !== 'Tamamlandi').length
  const closed = requests.filter(r => r.durum === 'Tamamlandi').length
  const overdue = requests.filter(r => r.sla === 'ASILDI').length
  return { requests, total: requests.length, open, closed, overdue }
}

export function getOccupancyReport() {
  const blocks = queries.getOccupancyByBlock()
  const totals = blocks.reduce((a, b) => ({
    oda: a.oda + b.oda_sayisi,
    yatak: a.yatak + b.toplam_yatak,
    dolu: a.dolu + b.dolu_yatak,
  }), { oda: 0, yatak: 0, dolu: 0 })
  const personnel = queries.getPersonnelByCompany()
  return { blocks, totals, personnel }
}

export function getDisciplineReport() {
  const records = queries.getDisciplineRecords()
  return { records, total: records.length }
}

export function getCompaniesReportSvc() {
  const companies = queries.getCompaniesReport()
  const active = companies.filter(c => c.is_active)
  const expired = companies.filter(c => c.days_left != null && c.days_left < 0 && c.is_active)
  const expiringSoon = companies.filter(c => c.days_left != null && c.days_left >= 0 && c.days_left <= 30 && c.is_active)
  const totalQuota = companies.reduce((s, c) => s + (c.bed_quota || 0), 0)
  const totalRevenue = companies.reduce((s, c) => s + (c.bed_quota || 0) * (c.price_per_bed || 0), 0)
  return { companies, total: companies.length, active: active.length, expired: expired.length, expiring_soon: expiringSoon.length, total_quota: totalQuota, total_revenue: totalRevenue }
}

export function getSurveysReportSvc() {
  return queries.getSurveysReport(30)
}

export function getDrillsReportSvc() {
  const records = queries.getDrillsReport()
  const lastYear = records.length
  const avgAttendance = records.filter(r => r.expected_count && r.actual_count).reduce((s, r, _, a) => s + (r.actual_count / r.expected_count) / a.length, 0)
  return { records, total: lastYear, avg_attendance_pct: Math.round(avgAttendance * 100) }
}

export function getVisitorsReportSvc() {
  const records = queries.getVisitorsReport(30)
  const active = records.filter(r => !r.check_out_at).length
  const avgMin = records.filter(r => r.check_out_at).reduce((s, r, _, a) => s + r.minutes / (a.length || 1), 0)
  return { records, total: records.length, active, avg_minutes: Math.round(avgMin) }
}

export function getExpensesReportSvc() {
  return queries.getExpensesReport(3)
}

export function getExecutiveReportSvc() {
  return queries.getExecutiveData()
}
