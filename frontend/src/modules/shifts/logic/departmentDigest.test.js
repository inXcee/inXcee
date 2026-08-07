import { describe, it, expect } from 'vitest'
import {
  departmentShiftDigest, digestLine, departmentDayShiftMatrix, shiftLabel,
  DIGEST_DEFAULT_AREA, DIGEST_DEFAULT_SHIFT,
} from './departmentDigest.js'

const GUNLER = ['2026-08-10', '2026-08-11']

function calisan(shift, yer, gun = GUNLER[0]) {
  return { [gun]: { status: 'worked', shift_name: shift, work_location_name: yer } }
}

const GRUPLAR = [{
  name: 'Mutfak',
  people: [
    { full_name: 'A', days: { ...calisan('Gündüz', 'OTC Lokal'), ...calisan('Gündüz', 'OTC Lokal', GUNLER[1]) } },
    { full_name: 'B', days: { ...calisan('Akşam', 'Kamp') } },
    { full_name: 'C', days: { '2026-08-10': { status: 'on_leave' } } },
  ],
}, {
  name: 'Temizlik',
  people: [{ full_name: 'D', days: { ...calisan('Gündüz', 'Tas Bina') } }],
}]

describe('Departman vardiya özeti', () => {
  it('departman başına vardiya ve nokta sayar', () => {
    const [mutfak] = departmentShiftDigest(GRUPLAR, GUNLER)
    expect(mutfak.department).toBe('Mutfak')
    expect(mutfak.people).toBe(3)
    expect(mutfak.personDays).toBe(3) // A iki gün, B bir gün
    expect(mutfak.shifts).toEqual([{ name: 'Gündüz', count: 2 }, { name: 'Akşam', count: 1 }])
    expect(mutfak.areas).toEqual([{ name: 'OTC Lokal', count: 2 }, { name: 'Kamp', count: 1 }])
  })

  // İzinli/devamsız gün sayıma girmemeli; yoksa "bu vardiyada 3 kişi var" derken
  // sahada 2 kişi olur.
  it('çalışmayan günleri saymaz', () => {
    const [mutfak] = departmentShiftDigest(GRUPLAR, GUNLER)
    expect(mutfak.personDays).toBe(3)
    expect(mutfak.shifts.reduce((t, s) => t + s.count, 0)).toBe(3)
  })

  it('her departman ayrı satır', () => {
    const ozet = departmentShiftDigest(GRUPLAR, GUNLER)
    expect(ozet.map(o => o.department)).toEqual(['Mutfak', 'Temizlik'])
  })

  it('en kalabalık vardiya üstte', () => {
    const [mutfak] = departmentShiftDigest(GRUPLAR, GUNLER)
    expect(mutfak.shifts[0].name).toBe('Gündüz')
  })

  it('boş girdide patlamaz', () => {
    expect(departmentShiftDigest([], GUNLER)).toEqual([])
    expect(departmentShiftDigest()).toEqual([])
  })

  // Nokta girilmemiş hücre bir yere karışırsa o noktanın kadrosu şişer.
  it('noktasız çalışma ayrı kovaya düşer', () => {
    const g = [{ name: 'X', people: [{ days: { '2026-08-10': { status: 'worked', shift_name: 'Gündüz' } } }] }]
    expect(departmentShiftDigest(g, GUNLER)[0].areas).toEqual([{ name: DIGEST_DEFAULT_AREA, count: 1 }])
  })

  it('vardiya adı yoksa saat aralığı kullanılır', () => {
    expect(shiftLabel({ start_hour: 8, end_hour: 16 })).toBe('08-16')
    expect(shiftLabel({})).toBe(DIGEST_DEFAULT_SHIFT)
    expect(shiftLabel({ shift_name: 'Gece', start_hour: 0 })).toBe('Gece')
  })
})

describe('Özet satırı', () => {
  it('sayımları tek satırda yazar', () => {
    expect(digestLine([{ name: 'Gündüz', count: 12 }, { name: 'Akşam', count: 8 }]))
      .toBe('Gündüz 12 · Akşam 8')
  })

  // Kırpma sessiz kalırsa çıktı tam sanılır.
  it('kırpılan kalemleri açıkça bildirir', () => {
    const cok = Array.from({ length: 9 }, (_, i) => ({ name: `V${i}`, count: 9 - i }))
    expect(digestLine(cok, { max: 3 })).toBe('V0 9 · V1 8 · V2 7 · +6 diğer')
  })

  it('boş listede boş döner', () => {
    expect(digestLine([])).toBe('')
  })
})

describe('Gün × vardiya matrisi', () => {
  it('hangi gün hangi vardiyada kaç kişi', () => {
    const m = departmentDayShiftMatrix(GRUPLAR[0], GUNLER)
    expect(m.shifts).toEqual(['Akşam', 'Gündüz'])
    expect(m.rows.find(r => r.shift === 'Gündüz').days).toEqual([1, 1])
    expect(m.rows.find(r => r.shift === 'Akşam').days).toEqual([1, 0])
    expect(m.dayTotals).toEqual([2, 1])
  })

  it('toplamlar gün toplamlarıyla tutarlı', () => {
    const m = departmentDayShiftMatrix(GRUPLAR[0], GUNLER)
    const satirToplam = m.rows.reduce((t, r) => t + r.total, 0)
    expect(satirToplam).toBe(m.dayTotals.reduce((t, n) => t + n, 0))
  })

  it('kimse çalışmıyorsa boş matris', () => {
    const m = departmentDayShiftMatrix({ people: [] }, GUNLER)
    expect(m.rows).toEqual([])
    expect(m.dayTotals).toEqual([0, 0])
  })
})
