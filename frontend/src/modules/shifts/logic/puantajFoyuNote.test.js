import { describe, it, expect } from 'vitest'
import { foyuCellNote, countFoyuNotes, NOTE_REASON_MISSING } from './puantajFoyuNote.js'

describe('Puantaj föyü hücre notu', () => {
  // Asıl şikâyet buydu: çalışılan her güne not düşünce kâğıt kırmızı üçgen
  // doluyordu. Bu bilgiler zaten VARDİYA DETAY sayfasında var.
  it('düz çalışılan güne not yazmaz', () => {
    expect(foyuCellNote({
      status: 'worked', date: '2026-08-03', shiftName: 'Gündüz',
      workLocationName: 'OTC Yemekhane',
    })).toBeNull()
  })

  it('izin, hafta tatili ve kayıtsız güne not yazmaz', () => {
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

  // Planlı gün ÇOK sayıda olabiliyor (plan girilip puantaj işlenmemiş aylar);
  // her birine not düşmek kâğıdı yine kırmızıya boğuyordu.
  it('planlı güne not yazmaz', () => {
    expect(foyuCellNote({ status: 'scheduled' })).toBeNull()
    expect(foyuCellNote({ status: 'scheduled', shiftName: 'Gündüz' })).toBeNull()
  })

  // Fiilen yapılan mesai kâğıdın yüzünde görünsün.
  it('gerçekleşen mesaiyi saatiyle yazar', () => {
    expect(foyuCellNote({ status: 'worked', overtimeHours: 3 })).toBe('Fazla mesai 3 saat')
    expect(foyuCellNote({ status: 'overtime', overtimeHours: 2.5 })).toBe('Fazla mesai 2.5 saat')
  })

  it('mesai yoksa çalışılan güne not yazmaz', () => {
    expect(foyuCellNote({ status: 'worked', overtimeHours: 0 })).toBeNull()
  })

  // Alacak izin = denkleştirme; ücret yerine serbest zaman olarak kullanılan hak.
  it('alacak izni (denkleştirme) işaretler', () => {
    expect(foyuCellNote({ status: 'on_leave', leaveType: 'owed' }))
      .toBe('Alacak izin (denkleştirme)')
  })

  it('diğer izin türlerine not yazmaz', () => {
    expect(foyuCellNote({ status: 'on_leave', leaveType: 'annual' })).toBeNull()
    expect(foyuCellNote({ status: 'on_leave', leaveType: 'sick' })).toBeNull()
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
      { status: 'absent', absentReason: '' }, { status: 'worked', overtimeHours: 2 }, { status: 'off' },
    ] },
    { cells: [{ status: 'worked' }, { status: 'on_leave', leaveType: 'owed' }] },
  ]

  it('istisnaları köşede gösterilmek üzere sayar', () => {
    expect(countFoyuNotes(ROWS)).toEqual({ absent: 2, missingReason: 1, overtime: 1, owed: 1, total: 4 })
  })

  it('boş girdide sıfırlanır', () => {
    expect(countFoyuNotes([])).toEqual({ absent: 0, missingReason: 0, overtime: 0, owed: 0, total: 0 })
    expect(countFoyuNotes()).toEqual({ absent: 0, missingReason: 0, overtime: 0, owed: 0, total: 0 })
  })
})
