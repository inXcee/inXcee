import { describe, it, expect } from 'vitest'
import { parseSignatureSheet } from './signatureSheetParse.js'

const GUN = '2026-10-07'

describe('parseSignatureSheet', () => {
  it('işaretsiz satır imzalı sayılır, numara ve boş satır atlanır', () => {
    const { rows, errors } = parseSignatureSheet('1. Ayşe Demir\n\n2) Mehmet Kaya', GUN)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { name: 'Ayşe Demir', date: GUN, mark: 'signed' },
      { name: 'Mehmet Kaya', date: GUN, mark: 'signed' },
    ])
  })

  it('ayraç ve işaret çeşitlerini tanır, büyük harf ve Türkçe karakterden bağımsız', () => {
    const { rows } = parseSignatureSheet([
      'Ali Veli - OFF',
      'Fatma Yıldız; RAPOR',
      'Can Er\tyıllık',
      'Deniz Ak: İzinli',
      'Ece Su | gelmedi',
      'Oya Gül - boş',
      'Ufuk Ay - ✓',
    ].join('\n'), GUN)
    expect(rows.map(r => r.mark)).toEqual(['off', 'report', 'annual', 'leave', 'absent', 'blank', 'signed'])
  })

  it('üçüncü parça not olarak taşınır', () => {
    const { rows } = parseSignatureSheet('Hasan Tan - rapor - kenarda yazıyor', GUN)
    expect(rows[0]).toMatchObject({ mark: 'report', note: 'kenarda yazıyor' })
  })

  it('tanınmayan işaret tahmin edilmez, hata olarak döner', () => {
    const { rows, errors } = parseSignatureSheet('Ayşe Demir - belki\nMehmet Kaya', GUN)
    expect(rows).toHaveLength(1)
    expect(errors[0]).toMatchObject({ line: 1 })
    expect(errors[0].reason).toMatch(/belki/)
  })

  it('isimde tire boşluksuzsa ayraç sayılmaz', () => {
    const { rows } = parseSignatureSheet('Ayşe Demir-Kaya', GUN)
    expect(rows[0]).toMatchObject({ name: 'Ayşe Demir-Kaya', mark: 'signed' })
  })
})
