import { describe, expect, it } from 'vitest'
import {
  gateEntryFileBase,
  gateEntryRows,
  truckBadgeBySeverity,
  truckCheckSlots,
  truckFilterDefs,
  truckPriorityScore,
} from './truckOperations.js'

describe('water truck operation helpers', () => {
  it('builds bounded reminder slots and clamps intervals to fifteen minutes', () => {
    expect(truckCheckSlots({
      reminder_start_time: '08:00',
      reminder_end_time: '09:00',
      reminder_interval_minutes: 30,
    })).toEqual(['08:00', '08:30', '09:00'])

    expect(truckCheckSlots({
      reminder_start_time: '08:00',
      reminder_end_time: '08:45',
      reminder_interval_minutes: 5,
    })).toEqual(['08:00', '08:15', '08:30', '08:45'])

    expect(truckCheckSlots({
      reminder_start_time: '18:00',
      reminder_end_time: '08:00',
    })).toEqual([])
    expect(truckCheckSlots({
      reminder_start_time: '00:00',
      reminder_end_time: '23:59',
      reminder_interval_minutes: 15,
    })).toHaveLength(16)
  })

  it('orders operational risk using deadline, arrival, mail, date and photo signals', () => {
    expect(truckPriorityScore({
      deadline_passed: true,
      arrival_phase: 'late',
      mail_required: true,
      missing_mail_fields: ['Telefon'],
      arrival_date: '2026-07-15',
      photo_count: 0,
      status: 'planned',
    }, '2026-07-15')).toBe(172)

    expect(truckPriorityScore({
      mail_required: false,
      missing_mail_fields: [],
      arrival_date: '2026-07-14',
      photo_count: 0,
      status: 'cancelled',
    }, '2026-07-15')).toBe(0)
  })

  it('keeps filter and severity metadata stable for the panel', () => {
    expect(Object.isFrozen(truckFilterDefs)).toBe(true)
    expect(truckFilterDefs.map(item => item.key)).toEqual([
      'action', 'mail', 'ready', 'missing', 'photo', 'today', 'late', 'all',
    ])
    expect(truckBadgeBySeverity('critical')).toBe('badge-red')
    expect(truckBadgeBySeverity('attention')).toBe('badge-blue')
    expect(truckBadgeBySeverity('unknown')).toBe('badge-gray')
  })

  it('creates deterministic gate-entry filenames and eleven export rows', () => {
    const truck = {
      arrival_date: '2026-07-15',
      plate: '34 ABC 123',
      driver_name: 'Yüksel Bektaş',
      driver_phone: '05550000000',
      identity_type: 'passport',
      driver_tc: 'P12345',
      trailer_plate: '34 DRS 456',
      visit_company: 'AVS',
      host_person_name: 'Sercan Sucu',
      host_person_phone: '05390000000',
      arrival_start_time: '08:00',
      arrival_end_time: '12:00',
      entry_reason: 'SU AMAÇLI NAKLİYE',
      work_area: 'FPU KAMP',
    }

    expect(gateEntryFileBase(truck)).toBe('su-nakliye-personel-giris-2026-07-15-34-ABC-123')
    expect(gateEntryFileBase({ plate: '' }, '2026-07-16')).toBe(
      'su-nakliye-personel-giris-2026-07-16-arac',
    )

    const rows = gateEntryRows(truck)
    expect(rows).toHaveLength(11)
    expect(rows).toContainEqual(['ADI SOYADI', 'Yüksel Bektaş'])
    expect(rows).toContainEqual(['T.C. KİMLİK / PASAPORT NUMARASI', 'Pasaport: P12345'])
    expect(rows).toContainEqual(['ARAÇ PLAKASI', '34 ABC 123\n34 DRS 456'])
    expect(rows).toContainEqual(['GİRİŞ SAATİ', '08:00-12:00'])
    expect(rows).toContainEqual(['ÇALIŞMA YAPACAĞI BÖLGE', 'FPU KAMP'])
  })
})
