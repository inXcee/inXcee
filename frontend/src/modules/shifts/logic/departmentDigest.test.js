import { describe, it, expect } from 'vitest'
import {
  departmentShiftDigest, digestLine, departmentDayShiftMatrix, shiftLabel,
  dayRoster, namesLine,
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

describe('Gün gün döküm (kim, hangi vardiyada)', () => {
  it('her gün için vardiya → nokta → isim kırılımı verir', () => {
    const [gun1] = dayRoster(GRUPLAR, GUNLER)
    expect(gun1.date).toBe(GUNLER[0])
    expect(gun1.total).toBe(3) // A, B (Mutfak) + D (Temizlik)
    const gunduz = gun1.shifts.find(v => v.shift === 'Gündüz')
    expect(gunduz.count).toBe(2)
    expect(gunduz.locations.map(l => l.location).sort()).toEqual(['OTC Lokal', 'Tas Bina'])
  })

  it('isimleri alfabetik ve bölümüyle taşır', () => {
    const [gun1] = dayRoster(GRUPLAR, GUNLER)
    const aksam = gun1.shifts.find(v => v.shift === 'Akşam')
    expect(aksam.locations[0].people).toEqual([{ name: 'B', department: 'Mutfak', role: '' }])
  })

  // İzinli kişi listede görünürse o gece sahada olduğu sanılır.
  it('çalışmayanları listelemez', () => {
    const [gun1] = dayRoster(GRUPLAR, GUNLER)
    const tumIsimler = gun1.shifts.flatMap(v => v.locations.flatMap(l => l.people.map(p => p.name)))
    expect(tumIsimler).not.toContain('C')
  })

  it('ikinci günde yalnız o günün kayıtları', () => {
    const [, gun2] = dayRoster(GRUPLAR, GUNLER)
    expect(gun2.total).toBe(1)
    expect(gun2.shifts[0].shift).toBe('Gündüz')
  })

  it('en kalabalık vardiya üstte', () => {
    const [gun1] = dayRoster(GRUPLAR, GUNLER)
    expect(gun1.shifts[0].shift).toBe('Gündüz')
  })

  it('nokta kırılımı kapatılabilir', () => {
    const [gun1] = dayRoster(GRUPLAR, GUNLER, { byLocation: false })
    const gunduz = gun1.shifts.find(v => v.shift === 'Gündüz')
    expect(gunduz.locations).toHaveLength(1)
    expect(gunduz.locations[0].count).toBe(2)
  })

  it('boş girdide gün başına boş sonuç', () => {
    expect(dayRoster([], GUNLER)).toEqual([
      { date: GUNLER[0], total: 0, shifts: [] },
      { date: GUNLER[1], total: 0, shifts: [] },
    ])
  })
})

describe('İsim satırı', () => {
  it('isimleri virgülle yazar', () => {
    expect(namesLine([{ name: 'Ali' }, { name: 'Veli' }])).toBe('Ali, Veli')
  })

  // Kırpma sessiz kalırsa liste tam sanılır ve eksik kişi fark edilmez.
  it('kırpmayı açıkça bildirir', () => {
    const cok = Array.from({ length: 20 }, (_, i) => ({ name: `K${i}` }))
    expect(namesLine(cok, { max: 3 })).toBe('K0, K1, K2 … +17 kişi')
  })

  it('boş listede boş döner', () => {
    expect(namesLine([])).toBe('')
  })
})
