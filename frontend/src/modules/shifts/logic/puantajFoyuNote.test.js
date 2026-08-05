import { describe, it, expect } from 'vitest'
import { foyuCellNote, countFoyuNotes, NOTE_REASON_MISSING } from './puantajFoyuNote.js'

describe('Puantaj föyü hücre notu', () => {
  // Asıl şikâyet buydu: çalışılan her güne not düşünce kâğıt kırmızı üçgen
  // doluyordu. Bu bilgiler zaten VARDİYA DETAY sayfasında var.
  it('çalışılan güne not yazmaz', () => {
    expect(foyuCellNote({
      status: 'worked', date: '2026-08-03', shiftName: 'Gündüz',
      workLocationName: 'OTC Yemekhane', overtimeHours: 2,
    })).toBeNull()
  })

  it('izin, hafta tatili ve kayıtsız güne not yazmaz', () => {
    expect(foyuCellNote({ status: 'on_leave', leaveType: 'annual' })).toBeNull()
    expect(foyuCellNote({ status: 'off' })).toBeNull()
    expect(foyuCellNote({ status: 'no_record' })).toBeNull()
    expect(foyuCellNote({ status: 'sunday' })).toBeNull()
  })

  it('devamsızlığı nedeniyle birlikte yazar', () => {
    expect(foyuCellNote({ status: 'absent', absentReason: 'Habersiz' }))
      .toBe('Devamsız — Habersiz')
  })

  it('nedeni girilmemiş devamsızlığı açıkça işaretler', () => {
    expect(foyuCellNote({ status: 'absent', absentReason: '' })).toBe(NOTE_REASON_MISSING)
  })

  it('planlı ama gerçekleşmemiş günü veri boşluğu olarak işaretler', () => {
    expect(foyuCellNote({ status: 'scheduled' })).toBe('Planlı — gerçekleşme kaydı yok')
  })

  it('boş hücrede patlamaz', () => {
    expect(foyuCellNote(null)).toBeNull()
    expect(foyuCellNote({})).toBeNull()
  })
})

describe('Föy istisna sayacı', () => {
  const ROWS = [
    { cells: [
      { status: 'worked' }, { status: 'absent', absentReason: 'Hasta' },
      { status: 'absent', absentReason: '' }, { status: 'scheduled' }, { status: 'off' },
    ] },
    { cells: [{ status: 'worked' }, { status: 'on_leave' }] },
  ]

  it('istisnaları köşede gösterilmek üzere sayar', () => {
    expect(countFoyuNotes(ROWS)).toEqual({ absent: 2, missingReason: 1, planned: 1, total: 3 })
  })

  it('boş girdide sıfırlanır', () => {
    expect(countFoyuNotes([])).toEqual({ absent: 0, missingReason: 0, planned: 0, total: 0 })
    expect(countFoyuNotes()).toEqual({ absent: 0, missingReason: 0, planned: 0, total: 0 })
  })
})
