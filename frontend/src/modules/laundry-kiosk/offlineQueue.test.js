import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  listQueued, enqueueBag, removeQueuedAt, buildBagFormData, dataUrlToBlob, flushQueue,
  MAX_QUEUE, QUEUE_TTL_MS,
} from './offlineQueue.js'

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('offlineQueue temel', () => {
  it('enqueue/list/remove döngüsü', () => {
    expect(listQueued()).toEqual([])
    enqueueBag({ payload: { block: 'M1' }, label: 'M1-101 · 2 parça' })
    enqueueBag({ payload: { block: 'A' }, label: 'A-5 · 1 parça' })
    expect(listQueued()).toHaveLength(2)
    expect(listQueued()[0].label).toBe('M1-101 · 2 parça')
    expect(listQueued()[0].queued_at).toBeTruthy()
    removeQueuedAt(0)
    expect(listQueued()).toHaveLength(1)
    expect(listQueued()[0].payload.block).toBe('A')
  })

  it('bozuk localStorage boş liste döner', () => {
    localStorage.setItem('kiosk-offline-bags', 'bozuk{json')
    expect(listQueued()).toEqual([])
  })
})

describe('offlineQueue — hassas veri kuyruğa girmez', () => {
  it('fotoğraf kuyruğa alınmaz', () => {
    enqueueBag({ payload: { block: 'M1' }, photoDataUrl: TINY_JPEG, label: 'a' })
    expect(listQueued()[0].photoDataUrl).toBeUndefined()
  })

  it('imza payload içinden temizlenir', () => {
    enqueueBag({ payload: { block: 'M1', intake_signature: 'data:image/png;base64,AAA' }, label: 'a' })
    expect(listQueued()[0].payload.intake_signature).toBeUndefined()
    expect(listQueued()[0].payload.block).toBe('M1')
  })
})

describe('offlineQueue — TTL ve limit', () => {
  it('24 saatten eski kayıtlar okunurken elenir', () => {
    const eski = new Date(Date.now() - QUEUE_TTL_MS - 60_000).toISOString()
    const yeni = new Date().toISOString()
    localStorage.setItem('kiosk-offline-bags', JSON.stringify([
      { payload: { block: 'ESKI' }, label: 'eski', queued_at: eski },
      { payload: { block: 'YENI' }, label: 'yeni', queued_at: yeni },
    ]))
    const q = listQueued()
    expect(q).toHaveLength(1)
    expect(q[0].payload.block).toBe('YENI')
  })

  it('kuyruk dolduğunda açık hata verir, en eskiyi sessizce atmaz', () => {
    for (let i = 0; i < MAX_QUEUE; i++) enqueueBag({ payload: { block: `B${i}` }, label: `l${i}` })
    expect(listQueued()).toHaveLength(MAX_QUEUE)
    expect(() => enqueueBag({ payload: { block: 'TASAN' }, label: 'tasan' })).toThrow(/dolu/i)
    expect(listQueued()).toHaveLength(MAX_QUEUE)
    expect(listQueued()[0].payload.block).toBe('B0') // en eski korundu
  })

  it('localStorage kotası dolarsa hata yüzeye çıkar', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => enqueueBag({ payload: { block: 'M1' }, label: 'a' })).toThrow(/kaydedilemedi/i)
  })
})

describe('buildBagFormData', () => {
  it('objeler JSON string, null/boş alanlar atlanır, foto eklenir', () => {
    const fd = buildBagFormData(
      { block: 'M1', item_count: 3, garments: [{ type_name: 'Gömlek' }], notes: null, urgent: false },
      TINY_JPEG,
    )
    expect(fd.get('block')).toBe('M1')
    expect(fd.get('item_count')).toBe('3')
    expect(JSON.parse(fd.get('garments'))).toEqual([{ type_name: 'Gömlek' }])
    expect(fd.get('notes')).toBe(null) // atlandı
    expect(fd.get('urgent')).toBe('false')
    const photo = fd.get('photo')
    expect(photo).toBeTruthy()
    expect(photo.type).toBe('image/jpeg')
  })

  it('dataUrlToBlob mime ve içeriği korur', () => {
    const blob = dataUrlToBlob(TINY_JPEG)
    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('flushQueue', () => {
  it('hepsi gönderilir, kuyruk boşalır', async () => {
    enqueueBag({ payload: { block: 'M1' }, label: 'a' })
    enqueueBag({ payload: { block: 'M2' }, label: 'b' })
    const post = vi.fn(() => Promise.resolve({}))
    const r = await flushQueue(post)
    expect(r.sent).toBe(2)
    expect(r.remaining).toBe(0)
    expect(listQueued()).toEqual([])
  })

  it('ağ hatasında (response yok) kalanlar kuyrukta bekler', async () => {
    enqueueBag({ payload: { block: 'M1' }, label: 'a' })
    enqueueBag({ payload: { block: 'M2' }, label: 'b' })
    const post = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('net'), {})) // response yok
    const r = await flushQueue(post)
    expect(r.sent).toBe(1)
    expect(r.remaining).toBe(1)
    expect(listQueued()[0].payload.block).toBe('M2')
  })

  it('sunucu reddi (4xx) kuyruğu tıkamaz — düşürülür ve raporlanır', async () => {
    enqueueBag({ payload: { block: 'M1' }, label: 'kötü' })
    enqueueBag({ payload: { block: 'M2' }, label: 'iyi' })
    const post = vi.fn()
      .mockRejectedValueOnce({ response: { data: { error: 'Oda bulunamadı' } } })
      .mockResolvedValueOnce({})
    const r = await flushQueue(post)
    expect(r.sent).toBe(1)
    expect(r.rejected).toEqual([{ label: 'kötü', error: 'Oda bulunamadı' }])
    expect(r.remaining).toBe(0)
    expect(listQueued()).toEqual([])
  })
})
