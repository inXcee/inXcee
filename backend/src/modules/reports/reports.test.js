import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import * as service from './service.js'

let db
beforeAll(() => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  db = getDB()
})

describe('Reports Service', () => {
  it('returns housekeeping report structure', () => {
    const report = service.getHousekeepingReport(new Date().toISOString().split('T')[0])
    expect(report).toHaveProperty('tasks')
    expect(report).toHaveProperty('total')
    expect(report).toHaveProperty('done')
    expect(report).toHaveProperty('skipped')
    expect(report).toHaveProperty('pending')
    expect(Array.isArray(report.tasks)).toBe(true)
    expect(report.total).toBe(report.done + report.skipped + report.pending)
  })

  it('returns maintenance report structure', () => {
    const report = service.getMaintenanceReport()
    expect(report).toHaveProperty('requests')
    expect(report).toHaveProperty('total')
    expect(report).toHaveProperty('open')
    expect(report).toHaveProperty('closed')
    expect(report).toHaveProperty('overdue')
    expect(report.total).toBe(report.open + report.closed)
  })

  it('returns occupancy report with blocks and totals', () => {
    const report = service.getOccupancyReport()
    expect(report).toHaveProperty('blocks')
    expect(report).toHaveProperty('totals')
    expect(report).toHaveProperty('personnel')
    expect(Array.isArray(report.blocks)).toBe(true)
    expect(report.totals).toHaveProperty('oda')
    expect(report.totals).toHaveProperty('yatak')
    expect(report.totals).toHaveProperty('dolu')
  })

  it('occupancy blocks have expected fields', () => {
    const { blocks } = service.getOccupancyReport()
    if (blocks.length > 0) {
      const b = blocks[0]
      expect(b).toHaveProperty('block')
      expect(b).toHaveProperty('oda_sayisi')
      expect(b).toHaveProperty('toplam_yatak')
      expect(b).toHaveProperty('dolu_yatak')
    }
  })

  it('returns discipline report structure', () => {
    const report = service.getDisciplineReport()
    expect(report).toHaveProperty('records')
    expect(report).toHaveProperty('total')
    expect(Array.isArray(report.records)).toBe(true)
    expect(report.total).toBe(report.records.length)
  })
})
