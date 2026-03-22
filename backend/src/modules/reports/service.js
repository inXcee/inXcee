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
