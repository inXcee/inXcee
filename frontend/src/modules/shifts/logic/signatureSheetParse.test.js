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

  describe('haftalık ızgara (Excel yapıştırma)', () => {
    const HAFTA = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

    it('başlığı atlar, hücreleri günlere dağıtır, boş hücre imza yok sayılır', () => {
      const { rows, errors } = parseSignatureSheet([
        'Ad Soyad\tPzt\tSal\tÇar\tPer\tCum\tCmt\tPaz',
        'Ayşe Demir\t✓\t✓\t\trapor\t✓\toff\toff',
      ].join('\n'), GUN, HAFTA)
      expect(errors).toEqual([])
      expect(rows).toHaveLength(7)
      expect(rows.map(r => r.mark)).toEqual(['signed', 'signed', 'blank', 'report', 'signed', 'off', 'off'])
      expect(rows[3]).toEqual({ name: 'Ayşe Demir', date: '2026-10-08', mark: 'report' })
    })

    it('tarihli başlığı ve satır sonu boş sütunları tolere eder', () => {
      const { rows, errors } = parseSignatureSheet([
        'İsim\t05.10\t06.10\t07.10',
        'Mehmet Kaya\t+\t+\timza\t\t\t\t\t\t',
      ].join('\n'), GUN, HAFTA)
      expect(errors).toEqual([])
      expect(rows.map(r => r.date)).toEqual(HAFTA)
      expect(rows.slice(0, 3).every(r => r.mark === 'signed')).toBe(true)
    })

    it('tanınmayan hücrede satırın tamamı reddedilir, gün numarası söylenir', () => {
      const { rows, errors } = parseSignatureSheet('Ali Veli\t✓\tbelki\t✓', GUN, HAFTA)
      expect(rows).toEqual([])
      expect(errors[0].reason).toMatch(/2\. gün.*belki/)
    })

    it('dolu fazla sütun hata verir', () => {
      const { errors } = parseSignatureSheet(`Ali Veli${'\t✓'.repeat(8)}`, GUN, HAFTA)
      expect(errors[0].reason).toMatch(/8 gün sütunu/)
    })

    it('"Ad ⇥ rapor ⇥ not" tek günlük biçim olarak kalır', () => {
      const { rows } = parseSignatureSheet('Hasan Tan\trapor\tkenarda', GUN, HAFTA)
      expect(rows).toEqual([{ name: 'Hasan Tan', date: GUN, mark: 'report', note: 'kenarda' }])
    })
  })

  it('isimde tire boşluksuzsa ayraç sayılmaz', () => {
    const { rows } = parseSignatureSheet('Ayşe Demir-Kaya', GUN)
    expect(rows[0]).toMatchObject({ name: 'Ayşe Demir-Kaya', mark: 'signed' })
  })
})
