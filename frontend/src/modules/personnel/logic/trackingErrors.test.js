import { describe, it, expect } from 'vitest'
import { failureReason, describeTrackingErrors } from './trackingErrors.js'

const hata = (status, body) => ({ response: { status, data: body }, message: 'Request failed' })
const sorgu = error => ({ query: { isError: !!error, error } })

describe('hata sebebi', () => {
  it('sunucunun kendi mesajını taşır', () => {
    expect(failureReason(hata(500, { error: 'no such table: personnel_tracking_events' })))
      .toMatchObject({ kind: 'server', status: 500, message: 'no such table: personnel_tracking_events' })
  })

  // Sebep bağlantı değilken "bağlantıyı kontrol edin" demek kullanıcıyı
  // yanlış yere bakmaya gönderiyordu.
  it('yanıt yoksa bağlantı, varsa değil', () => {
    expect(failureReason({ message: 'Network Error' }).kind).toBe('network')
    expect(failureReason(hata(500, {})).kind).toBe('server')
  })

  it('yetki ve oturum ayrı ayrı anlaşılır', () => {
    expect(failureReason(hata(401, {})).kind).toBe('auth')
    expect(failureReason(hata(403, {})).kind).toBe('forbidden')
    expect(failureReason(hata(404, {})).kind).toBe('missing')
  })

  it('hata nesnesi yoksa patlamaz', () => {
    expect(failureReason(null).kind).toBe('unknown')
  })
})

describe('takip hatası özeti', () => {
  const bolumler = (...hatalar) => [
    { label: 'Özet', ...sorgu(hatalar[0]) },
    { label: 'Personel listesi', ...sorgu(hatalar[1]) },
    { label: 'Hareketler', ...sorgu(hatalar[2]) },
    { label: 'Uyarılar', ...sorgu(hatalar[3]) },
  ]

  it('hata yoksa null döner', () => {
    expect(describeTrackingErrors(bolumler())).toBeNull()
    expect(describeTrackingErrors([])).toBeNull()
  })

  // Asıl eksik buydu: hangi bölümün düştüğü yazılmıyordu.
  it('düşen bölümleri adıyla sayar', () => {
    const ozet = describeTrackingErrors(bolumler(hata(500, { error: 'no such table' }), null, null, hata(500, { error: 'no such table' })))
    expect(ozet.labels).toEqual(['Özet', 'Uyarılar'])
    expect(ozet.text).toContain('Özet, Uyarılar')
  })

  it('sunucu mesajını gösterir ve tekrarı sadeleştirir', () => {
    const ozet = describeTrackingErrors(bolumler(hata(500, { error: 'no such table: x' }), hata(500, { error: 'no such table: x' })))
    expect(ozet.reasons).toEqual(['no such table: x (HTTP 500)'])
  })

  it('farklı sebepler ayrı ayrı görünür', () => {
    const ozet = describeTrackingErrors(bolumler(hata(500, { error: 'patladi' }), hata(403, {})))
    expect(ozet.reasons).toHaveLength(2)
  })

  // "Yenile" önerisi yalnız tekrar denemenin anlamlı olduğu hallerde.
  it('yetki hatasında tekrar denemeyi önermez', () => {
    expect(describeTrackingErrors(bolumler(hata(403, {}))).retryable).toBe(false)
    expect(describeTrackingErrors(bolumler(hata(500, {}))).retryable).toBe(true)
    expect(describeTrackingErrors(bolumler({ message: 'Network Error' })).retryable).toBe(true)
  })
})
