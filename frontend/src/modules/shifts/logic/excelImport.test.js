import { describe, it, expect } from 'vitest'
import { classifyCell, parseCampScheduleGrid } from './excelImport.js'

describe('classifyCell — hücre sınıflandırma', () => {
  it('boş/çizgi → blank', () => {
    expect(classifyCell('').kind).toBe('blank')
    expect(classifyCell('   ').kind).toBe('blank')
    expect(classifyCell('-').kind).toBe('blank')
    expect(classifyCell(null).kind).toBe('blank')
  })

  it('saat aralığı (boşluk veya tire) → shift, scheduled', () => {
    expect(classifyCell('08:00 17:00')).toMatchObject({ kind: 'shift', startHour: 8, endHour: 17, status: 'scheduled' })
    expect(classifyCell('08:00-17:00')).toMatchObject({ kind: 'shift', startHour: 8, endHour: 17 })
    expect(classifyCell('06:00-15:00')).toMatchObject({ startHour: 6, endHour: 15 })
    expect(classifyCell('00:00-08:00')).toMatchObject({ startHour: 0, endHour: 8 })
  })

  it('gece yarısı bitişi (00:00) → 24 olarak normalize', () => {
    expect(classifyCell('15:00-00:00')).toMatchObject({ startHour: 15, endHour: 24 })
    expect(classifyCell('15:00 00:00')).toMatchObject({ startHour: 15, endHour: 24 })
  })

  it('24 saatlik vardiya 08:00-08:00 korunur', () => {
    expect(classifyCell('08:00-08:00')).toMatchObject({ startHour: 8, endHour: 8, status: 'scheduled' })
  })

  it('OTC / KAMP önekleri yok sayılır, saat aralığı alınır', () => {
    expect(classifyCell('OTC 08:00-17:00')).toMatchObject({ startHour: 8, endHour: 17 })
    expect(classifyCell('OTC - 15:00-00:00')).toMatchObject({ startHour: 15, endHour: 24 })
    expect(classifyCell('KAMP 06:00-15:00')).toMatchObject({ startHour: 6, endHour: 15 })
  })

  it('OFF / RAPORLU / İZİN türleri → doğru izin statüsü + tip', () => {
    expect(classifyCell('OFF')).toMatchObject({ kind: 'leave', status: 'off', leaveType: 'weekly_off' })
    expect(classifyCell('RAPORLU')).toMatchObject({ leaveType: 'sick' })
    expect(classifyCell('YILLIK İZİN')).toMatchObject({ leaveType: 'annual' })
    expect(classifyCell('Ü.İ')).toMatchObject({ leaveType: 'unpaid' })
    expect(classifyCell('ÜCRETSİZ İZİN')).toMatchObject({ leaveType: 'unpaid' })
  })

  it('anlaşılmayan metin → unknown', () => {
    expect(classifyCell('ZZZ?').kind).toBe('unknown')
  })
})

describe('parseCampScheduleGrid — tam çizelge', () => {
  // Gerçek "KAMP ALANI ÇİZELGE" yapısını taklit eden ızgara.
  const grid = [
    ['AVS KAMP ALANI PERSONEL', '', '', '', '', '', '', '', ''],
    ['', '', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'],
    ['SIRA NO', 'ADI SOYADI', new Date(2026, 4, 18), new Date(2026, 4, 19), new Date(2026, 4, 20), new Date(2026, 4, 21), new Date(2026, 4, 22), new Date(2026, 4, 23), new Date(2026, 4, 24)],
    ['KAT HİZMETLERİ VE MEYDANCILAR', '', '', '', '', '', '', '', ''],
    ['1', 'MELİKE AKÇA', '08:00 17:00', '08:00 17:00', '08:00 17:00', '08:00 17:00', '08:00 17:00', '08:00 17:00', 'OFF'],
    ['2', 'ESİN KIYAK', '08:00 17:00', '08:00 17:00', 'RAPORLU', '08:00 17:00', '08:00 17:00', 'OFF', '08:00 17:00'],
    ['TEKNİK SERVİS', '', '', '', '', '', '', '', ''],
    ['3', 'ONUR TOPLUCUK', '06:00-15:00', '06:00-15:00', '15:00-00:00', '15:00-00:00', 'YILLIK İZİN', 'OFF', '06:00-15:00'],
    ['LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK', 'LOJİSTİK'],
    ['4', 'KADİR YENER', '', '', '', '', '', '', ''], // bu hafta vardiyası yok ama personel
  ]

  it('haftalık tarihleri başlıktan otomatik çıkarır', () => {
    const r = parseCampScheduleGrid(grid)
    expect(r.error).toBeUndefined()
    expect(r.weekDates).toEqual(['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'])
  })

  it('departman bantlarını personele atar', () => {
    const r = parseCampScheduleGrid(grid)
    const melike = r.rows.find(x => x.name === 'MELİKE AKÇA')
    expect(melike.deptName).toBe('KAT HİZMETLERİ VE MEYDANCILAR')
    const onur = r.rows.find(x => x.name === 'ONUR TOPLUCUK')
    expect(onur.deptName).toBe('TEKNİK SERVİS')
    expect(r.rows.length).toBe(4)
  })

  it('vardiyasız ama sıra-numaralı personel düşürülmez (LOJİSTİK bandı korunur)', () => {
    const r = parseCampScheduleGrid(grid)
    const kadir = r.rows.find(x => x.name === 'KADİR YENER')
    expect(kadir).toBeTruthy()
    expect(kadir.deptName).toBe('LOJİSTİK')
    expect(kadir.cells.length).toBe(0)
  })

  it('hücreleri doğru tarihe + duruma çevirir', () => {
    const r = parseCampScheduleGrid(grid)
    const melike = r.rows.find(x => x.name === 'MELİKE AKÇA')
    const mon = melike.cells.find(c => c.date === '2026-05-18')
    expect(mon).toMatchObject({ startHour: 8, endHour: 17, status: 'scheduled' })
    const sun = melike.cells.find(c => c.date === '2026-05-24')
    expect(sun.status).toBe('off')
    const esin = r.rows.find(x => x.name === 'ESİN KIYAK')
    expect(esin.cells.find(c => c.date === '2026-05-20').status).toBe('on_leave') // RAPORLU
  })

  it('boş dosya → error', () => {
    expect(parseCampScheduleGrid([]).error).toBeTruthy()
  })

  it('tarih başlığı yoksa error (eski basit şablona düşülmesi için)', () => {
    const simple = [['İSİM', 'Pzt', 'Sal'], ['Ali', '1', '2']]
    expect(parseCampScheduleGrid(simple).error).toBeTruthy()
  })
})
