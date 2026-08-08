import { describe, it, expect } from 'vitest'
import { stepDay, canStep, dayKeyDelta } from './dayNav.js'

const HAFTA = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']

describe('gün ilerletme', () => {
  it('ileri ve geri gider', () => {
    expect(stepDay(HAFTA, '2026-08-05', 1)).toBe('2026-08-06')
    expect(stepDay(HAFTA, '2026-08-05', -1)).toBe('2026-08-04')
  })

  // Sarmalasaydı "ileri"ye basan kişi farkında olmadan pazartesiye dönerdi.
  it('hafta sınırında durur, başa sarmaz', () => {
    expect(stepDay(HAFTA, '2026-08-09', 1)).toBe('2026-08-09')
    expect(stepDay(HAFTA, '2026-08-03', -1)).toBe('2026-08-03')
  })

  it('sınırda düğme kapanır', () => {
    expect(canStep(HAFTA, '2026-08-03', -1)).toBe(false)
    expect(canStep(HAFTA, '2026-08-03', 1)).toBe(true)
    expect(canStep(HAFTA, '2026-08-09', 1)).toBe(false)
  })

  // Hafta değişince seçili gün listede olmayabilir; boş ekran yerine ilk güne düşer.
  it('gün listede yoksa ilk güne düşer', () => {
    expect(stepDay(HAFTA, '2026-09-01', 1)).toBe('2026-08-03')
  })

  it('boş listede patlamaz', () => {
    expect(stepDay([], '2026-08-05', 1)).toBe('2026-08-05')
    expect(stepDay(undefined, '2026-08-05', 1)).toBe('2026-08-05')
  })
})

describe('klavye ile gün değiştirme', () => {
  it('sol/sağ ok yön verir', () => {
    expect(dayKeyDelta({ key: 'ArrowRight' }, null)).toBe(1)
    expect(dayKeyDelta({ key: 'ArrowLeft' }, null)).toBe(-1)
    expect(dayKeyDelta({ key: 'a' }, null)).toBe(0)
  })

  // Arama kutusunda imleci gezdirirken gün değişmemeli.
  it('yazı alanında pasif kalır', () => {
    expect(dayKeyDelta({ key: 'ArrowRight' }, { tagName: 'INPUT' })).toBe(0)
    expect(dayKeyDelta({ key: 'ArrowRight' }, { tagName: 'TEXTAREA' })).toBe(0)
    expect(dayKeyDelta({ key: 'ArrowRight' }, { tagName: 'DIV', isContentEditable: true })).toBe(0)
  })

  // Ctrl+ok tarayıcı/kelime gezinmesi; devralmamalı.
  it('değiştirici tuşlarla birlikte pasif', () => {
    expect(dayKeyDelta({ key: 'ArrowRight', ctrlKey: true }, null)).toBe(0)
    expect(dayKeyDelta({ key: 'ArrowLeft', metaKey: true }, null)).toBe(0)
  })

  it('olay yoksa patlamaz', () => {
    expect(dayKeyDelta(null, null)).toBe(0)
  })
})
