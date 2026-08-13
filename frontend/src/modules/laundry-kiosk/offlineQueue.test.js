import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { _getRawQueueForTests, _resetForTests, getBlob } from '../../shared/utils/offlineDB.js'
import {
  buildBagFormData,
  enqueueBag,
  flushQueue,
  listQueued,
  migrateLegacyLaundryQueue,
} from './offlineQueue.js'

beforeEach(async () => {
  localStorage.clear()
  await _resetForTests()
})

describe('şifreli çamaşır kuyruğu', () => {
  it('payload, fotoğraf ve imzayı AES-GCM kayıt içinde korur', async () => {
    const photo = 'data:image/jpeg;base64,Zm90bw=='
    const roomNo = 'ROOM-PLAINTEXT-SECRET'
    await enqueueBag({
      payload: { client_request_id: 'bag-offline-0001', room_no: roomNo, intake_signature: 'data:image/png;base64,aW16YQ==' },
      photoDataUrl: photo,
      label: 'A1-101',
    })

    const queue = await listQueued()
    expect(queue[0].payload).toMatchObject({ room_no: roomNo, intake_signature: expect.stringContaining('base64') })
    expect(queue[0].blobIds).toHaveLength(1)
    expect(await getBlob(queue[0].blobIds[0])).toBeInstanceOf(Blob)

    const raw = await _getRawQueueForTests()
    expect(raw[0]).not.toHaveProperty('payload')
    expect(JSON.stringify(raw[0])).not.toContain(roomNo)
    expect(raw[0].encrypted_payload.encrypted).toBeTruthy()
  })

  it('başarılı sync kaydı görünür kuyruktan çıkarır fakat receipt durumunu korur', async () => {
    await enqueueBag({ payload: { client_request_id: 'bag-offline-0002', room_no: '102' } })
    const result = await flushQueue(async (form, key) => ({ data: { bag_no: 'T-1', key, room: form.get('room_no') } }))
    expect(result).toMatchObject({ sent: 1, remaining: 0 })
    expect(await listQueued()).toEqual([])
    const raw = await _getRawQueueForTests()
    expect(raw[0].status).toBe('synced')
  })

  it('ağ hatasında kaydı silmez; sunucu reddini inceleme durumunda saklar', async () => {
    await enqueueBag({ payload: { client_request_id: 'bag-offline-0003', room_no: '103' } })
    await flushQueue(async () => { throw new Error('offline') })
    expect((await listQueued())[0]).toMatchObject({ status: 'pending', retries: 1 })

    await flushQueue(async () => {
      const error = new Error('Geçersiz oda')
      error.response = { status: 422, data: { error: 'Geçersiz oda' } }
      throw error
    })
    expect((await listQueued())[0]).toMatchObject({ status: 'rejected', error: 'Geçersiz oda' })
  })

  it('kart verisini şifreler ve sunucunun kart reddini manuel incelemeye alır', async () => {
    await enqueueBag({
      payload: {
        client_request_id: 'bag-offline-card-1',
        room_no: '104',
        card_code: 'AVS-C:SECRET',
        card_override_reason: null,
      },
    })
    const raw = await _getRawQueueForTests()
    expect(JSON.stringify(raw[0])).not.toContain('AVS-C:SECRET')

    const result = await flushQueue(async form => {
      expect(form.get('card_code')).toBe('AVS-C:SECRET')
      const error = new Error('Kart iptal edilmiş')
      error.response = { status: 409, data: { error: 'Kart iptal edilmiş', card_gate: { code: 'inactive_card', required: true } } }
      throw error
    })
    expect(result.rejected[0]).toMatchObject({ status: 'manual_review', error: 'Kart iptal edilmiş' })
    expect((await listQueued())[0]).toMatchObject({ status: 'manual_review' })
  })

  it('eski localStorage kuyruğunu kayıp olmadan IndexedDB içine taşır', async () => {
    localStorage.setItem('kiosk-offline-bags', JSON.stringify([{
      queued_at: '2026-08-12T10:00:00.000Z', label: 'Eski kayıt', payload: { client_request_id: 'legacy-bag-1', room_no: '201' },
    }]))
    expect(await migrateLegacyLaundryQueue()).toMatchObject({ migrated: 1, failed: 0 })
    expect(localStorage.getItem('kiosk-offline-bags')).toBeNull()
    expect((await listQueued())[0].payload.room_no).toBe('201')
  })
})

describe('FormData', () => {
  it('JSON, imza ve fotoğrafı gönderime hazırlar', () => {
    const form = buildBagFormData({ garments: [{ type: 'Gömlek' }], intake_signature: 'sig', _label: 'gizli' }, new Blob(['x'], { type: 'image/jpeg' }))
    expect(form.get('garments')).toContain('Gömlek')
    expect(form.get('intake_signature')).toBe('sig')
    expect(form.get('_label')).toBeNull()
    expect(form.get('photo')).toBeInstanceOf(File)
  })
})
