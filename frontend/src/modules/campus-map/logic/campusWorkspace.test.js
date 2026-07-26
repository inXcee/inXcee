import { describe, expect, it } from 'vitest'
import {
  buildCampusSearchResults,
  deriveCampusDataState,
  workspaceTabs,
} from './campusWorkspace.js'

describe('campusWorkspace logic', () => {
  it('blok, oda, kişi, arıza ve komut sonuçlarını tek listede birleştirir', () => {
    const common = {
      blocks: [{ block: 'M1', type: 'A' }],
      rooms: [{ id: 11, block: 'M1', room_no: '203', occupied: 2, active_beds: 4 }],
      personnel: [{ id: 31, full_name: 'Mert Kaya', block: 'M1', room_no: '203', room_id: 11 }],
      faults: [{ id: 41, block: 'M1', location: 'M1-203', description: 'Musluk arızası', priority: 'high' }],
      permissions: { faults: true, cleaning: true, rooms: true },
      role: 'campus_manager',
    }

    expect(buildCampusSearchResults({ ...common, query: 'M1' }).map(item => item.type))
      .toEqual(expect.arrayContaining(['block', 'room', 'person', 'fault']))
    expect(buildCampusSearchResults({ ...common, query: 'doluluk' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'command', mode: 'occupancy' })]))
  })

  it('yetkisiz komutları ve rol dışı raporu arama sonuçlarına koymaz', () => {
    const base = {
      blocks: [], rooms: [], personnel: [], faults: [],
      permissions: { faults: false, cleaning: true, rooms: false },
      role: 'housekeeper',
    }
    expect(buildCampusSearchResults({ ...base, query: 'arıza' })).toEqual([])
    expect(buildCampusSearchResults({ ...base, query: 'rapor' })).toEqual([])
    expect(buildCampusSearchResults({ ...base, query: 'temizlik' }))
      .toEqual([expect.objectContaining({ mode: 'cleaning' })])
  })

  it('veri durumlarını sıfır değerlerden bağımsız sınıflandırır', () => {
    expect(deriveCampusDataState({ online: false }).id).toBe('offline')
    expect(deriveCampusDataState({ loading: true }).id).toBe('loading')
    expect(deriveCampusDataState({ summaryError: true, operationsError: true }).id).toBe('error')
    expect(deriveCampusDataState({ summaryError: true }).id).toBe('partial')
    expect(deriveCampusDataState({ updatedAt: 1_000, now: 92_000 }).id).toBe('stale')
    expect(deriveCampusDataState({ updatedAt: 1_000, now: 50_000 }).id).toBe('live')
  })

  it('çalışma alanı sekmelerini bölüm yetkilerine göre gizler', () => {
    expect(workspaceTabs({ faults: true, cleaning: false, rooms: false }).map(tab => tab.id))
      .toEqual(['overview', 'faults', 'contact', 'activity'])
    expect(workspaceTabs({ faults: false, cleaning: true, rooms: false }).map(tab => tab.id))
      .toEqual(['overview', 'cleaning', 'activity'])
  })
})
