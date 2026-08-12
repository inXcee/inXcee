import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _getRawQueueForTests, _resetForTests } from '../../shared/utils/offlineDB.js'
import { enqueueScan, flushQueue, loadQueue, migrateLegacyStationQueue, queueLength } from './scanQueue.js'

beforeEach(async () => {
  localStorage.clear()
  await _resetForTests()
})

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone: () => ({ json: async () => body }),
  }
}

describe('şifreli istasyon kuyruğu', () => {
  it('okutma zamanı, fotoğraf ve idempotency anahtarıyla şifreli saklanır', async () => {
    expect(await enqueueScan({ raw_uid: 'UID1', meal_type: 'lunch', photo: new Blob(['foto']) })).toBe(1)
    const queue = await loadQueue()
    expect(queue[0].payload).toMatchObject({ raw_uid: 'UID1', meal_type: 'lunch', client_action_id: queue[0].id })
    expect(queue[0].blobIds).toHaveLength(1)
    const raw = await _getRawQueueForTests()
    expect(raw[0]).not.toHaveProperty('payload')
    expect(JSON.stringify(raw[0])).not.toContain('UID1')
  })

  it('başarılı gönderimi synced yapar ve formda orijinal zamanı taşır', async () => {
    await enqueueScan({ raw_uid: 'A', meal_type: 'dinner' })
    let sentBody
    const fetcher = vi.fn(async (_url, options) => { sentBody = options.body; return response(200, { result: 'ok' }) })
    expect(await flushQueue('ST-key', fetcher)).toMatchObject({ sent: 1, remaining: 0 })
    expect(sentBody.get('raw_uid')).toBe('A')
    expect(sentBody.get('meal_type')).toBe('dinner')
    expect(sentBody.get('scanned_at')).toBeTruthy()
    expect(sentBody.get('client_action_id')).toBeTruthy()
    expect(await queueLength()).toBe(0)
  })

  it('4xx kaydı silmez, rejected durumunda korur; ağ hatasında pending bırakır', async () => {
    await enqueueScan({ raw_uid: 'A' })
    await flushQueue('ST-key', async () => response(422))
    expect((await loadQueue())[0].status).toBe('rejected')

    await _resetForTests()
    await enqueueScan({ raw_uid: 'B' })
    await flushQueue('ST-key', async () => { throw new Error('offline') })
    expect((await loadQueue())[0]).toMatchObject({ status: 'pending', retries: 1 })
  })

  it('eski localStorage kuyruğunu kayıpsız taşır', async () => {
    localStorage.setItem('yys_station_scan_queue', JSON.stringify([{ raw_uid: 'OLD', scanned_at: '2026-08-12T10:00:00.000Z' }]))
    expect(await migrateLegacyStationQueue()).toMatchObject({ migrated: 1, failed: 0 })
    expect(localStorage.getItem('yys_station_scan_queue')).toBeNull()
    expect((await loadQueue())[0].payload.raw_uid).toBe('OLD')
  })
})
