import { describe, expect, it } from 'vitest'
import {
  aksiyonGerekenler,
  durumKovalari,
  kurulumOrani,
  partiDurumu,
  tahminiSayfa,
} from './qrDeployment.js'

describe('kurulum oranı', () => {
  // ASIL KURAL: ölçülemeyen oran gösterilmez. "%0" yazmak, etiketlerin
  // asılmadığı anlamına gelir; oysa bilinen tek şey kaydın olmadığıdır.
  it('hiçbir konumun durumu kayıtlı değilse yüzde göstermez', () => {
    const o = kurulumOrani({ total: 1078, known: 0, unknown: 1078 })
    expect(o.measurable).toBe(false)
    expect(o.percent).toBeUndefined()
    expect(o.reason).toMatch(/kaydedilmemiş/)
  })

  it('aktif konum yoksa gerekçesi farklıdır', () => {
    expect(kurulumOrani({ total: 0, known: 0 }).reason).toMatch(/Aktif konum yok/)
  })

  it('rapor okunamadıysa yüzde üretmez', () => {
    expect(kurulumOrani(null)).toMatchObject({ measurable: false })
  })

  // Payda BİLİNEN konumlardır; bilinmeyeni paydaya katmak oranı sahte düşürür.
  it('paydaya yalnız durumu bilinen konumları alır ve paydayı yazar', () => {
    const o = kurulumOrani({ total: 100, known: 20, unknown: 80, verified: 12, installed: 4, printed: 4 })
    expect(o.measurable).toBe(true)
    expect(o.percent).toBe(80)          // (12+4)/20
    expect(o.denominator).toBe(20)
    expect(o.label).toBe('80% (16/20 bilinen konum)')
  })

  it('doğrulanmamış ama asılmış etiketi kuruluya sayar', () => {
    expect(kurulumOrani({ known: 10, installed: 10 }).percent).toBe(100)
  })

  it('yalnız basılmış etiket kurulu sayılmaz', () => {
    expect(kurulumOrani({ known: 10, printed: 10 }).percent).toBe(0)
  })
})

describe('durum kovaları', () => {
  it('sıfır olan kovaları gizler, sırayı korur', () => {
    const k = durumKovalari({ verified: 3, printed: 2, unknown: 0, stale: 1 })
    expect(k.map(x => x.key)).toEqual(['verified', 'printed', 'stale'])
  })

  it('bilinmiyor kovası "kurulmadı değil" diye açıklanır', () => {
    const k = durumKovalari({ unknown: 5 })
    expect(k[0].aciklama).toMatch(/kurulmadı DEMEK DEĞİL/)
  })

  it('özet yoksa boş liste döner', () => {
    expect(durumKovalari(null)).toEqual([])
  })
})

describe('aksiyon listesi', () => {
  // "Bilinmiyor" saha listesine girmemeli: gidip asılacak bir şey yok.
  it('yalnız gerçekten iş gerektiren satırları alır', () => {
    const items = [
      { location_id: 1, state: 'unknown', actionable: false },
      { location_id: 2, state: 'stale', actionable: true },
      { location_id: 3, state: 'verified', actionable: false },
      { location_id: 4, state: 'printed', actionable: true },
    ]
    expect(aksiyonGerekenler(items).map(i => i.location_id)).toEqual([2, 4])
  })

  it('boş girdide patlamaz', () => {
    expect(aksiyonGerekenler()).toEqual([])
  })
})

describe('parti durumu', () => {
  it('bayat etiketi olan parti kırmızı uyarı verir', () => {
    expect(partiDurumu({ status: 'printed', stale_labels: 3 }))
      .toMatchObject({ renk: '#dc2626' })
    expect(partiDurumu({ status: 'printed', stale_labels: 3 }).metin).toMatch(/yeniden basılmalı/)
  })

  it('onaylanmamış parti "basıldığı onaylanmadı" der', () => {
    expect(partiDurumu({ status: 'generated', stale_labels: 0 }).metin).toMatch(/onaylanmadı/)
  })

  it('iptal edilen parti bayat uyarısını bastırır', () => {
    expect(partiDurumu({ status: 'cancelled', stale_labels: 9 }).metin).toBe('İptal edildi')
  })

  it('parti yoksa null döner', () => {
    expect(partiDurumu(null)).toBeNull()
  })
})

describe('sayfa tahmini', () => {
  it('sayfa başına kapasiteye göre yukarı yuvarlar', () => {
    expect(tahminiSayfa(1078, 8)).toBe(135)
    expect(tahminiSayfa(8, 8)).toBe(1)
    expect(tahminiSayfa(9, 8)).toBe(2)
  })

  it('eksik girdide sıfır döner', () => {
    expect(tahminiSayfa(0, 8)).toBe(0)
    expect(tahminiSayfa(10, 0)).toBe(0)
  })
})
