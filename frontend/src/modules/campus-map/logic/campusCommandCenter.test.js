import { describe, expect, it } from 'vitest'
import { buildBlockRisk, buildCampusCommandSummary } from './campusCommandCenter.js'

const summary = {
  M1: {
    block: 'M1', total_beds: 60, occupied: 58, occupancy_pct: 97,
    open_faults: 2, quarantine: 1, maintenance: 0,
    cleaning_total: 20, cleaning_done: 16,
  },
  S1: {
    block: 'S1', total_beds: 40, occupied: 20, occupancy_pct: 50,
    open_faults: 0, quarantine: 0, maintenance: 1,
    cleaning_total: 10, cleaning_done: 10,
  },
}

describe('buildBlockRisk', () => {
  it('operasyon risklerini ağırlıklı ve açıklamalı hesaplar', () => {
    const result = buildBlockRisk(summary.M1)
    expect(result.score).toBeGreaterThan(50)
    expect(result.reasons).toEqual(expect.arrayContaining(['2 arıza', '1 karantina', '4 temizlik', '%97 dolu']))
  })

  it('sorunsuz blok için sıfır risk döndürür', () => {
    expect(buildBlockRisk({ block: 'A', occupancy_pct: 40 }).score).toBe(0)
  })
})

describe('buildCampusCommandSummary', () => {
  it('kampüs iş yükünü ve boş yatak sayısını toplar', () => {
    const result = buildCampusCommandSummary(summary)
    expect(result.openFaults).toBe(2)
    expect(result.cleaningBacklog).toBe(4)
    expect(result.maintenanceRooms).toBe(1)
    expect(result.availableBeds).toBe(22)
    expect(result.criticalBlocks[0].block).toBe('M1')
  })

  it('boş veride sağlıklı ve güvenli sonuç üretir', () => {
    const result = buildCampusCommandSummary(null)
    expect(result.healthScore).toBe(100)
    expect(result.criticalBlocks).toEqual([])
    expect(result.availableBeds).toBe(0)
  })

  it('backend veri sorunu durumunu ve kanonik sağlık puanını kullanır', () => {
    const result = buildCampusCommandSummary(summary, {
      blocks: summary,
      campus: { health_score: 79, status: 'data_issue' },
      data_quality: { unmapped_fault_count: 2 },
      freshness: { status: 'current' },
    })
    expect(result.healthScore).toBe(79)
    expect(result.status.label).toBe('Veri sorunu')
    expect(result.dataIssueCount).toBe(2)
  })
})
