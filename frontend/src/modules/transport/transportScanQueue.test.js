import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetForTests } from '../../shared/utils/offlineDB.js'
import {
  enqueueTransportScan,
  flushTransportScanQueue,
  getTransportScanQueue,
} from './transportScanQueue.js'

afterEach(() => _resetForTests())

describe('transport IndexedDB scan queue', () => {
  it('keeps the stable client event id until sync succeeds', async () => {
    await enqueueTransportScan({
      tripId: 12,
      qrToken: 'AVS:QR-12',
      clientEventId: 'offline-event-0012',
      deviceTime: '2026-07-28T06:55:00.000Z',
    })
    expect(await getTransportScanQueue()).toHaveLength(1)

    const client = { post: vi.fn(() => Promise.resolve({ data: { result: 'boarded' } })) }
    const result = await flushTransportScanQueue(client)

    expect(client.post).toHaveBeenCalledWith('/transport/trips/12/scan', {
      qr_token: 'AVS:QR-12',
      client_event_id: 'offline-event-0012',
      device_time: '2026-07-28T06:55:00.000Z',
    })
    expect(result).toEqual({ sent: 1, dropped: 0, remaining: 0 })
  })

  it('retains network errors and drops permanent client errors', async () => {
    await enqueueTransportScan({ tripId: 1, qrToken: 'ONE', clientEventId: 'offline-event-0001' })
    const offline = { post: vi.fn(() => Promise.reject(new Error('offline'))) }
    expect((await flushTransportScanQueue(offline)).remaining).toBe(1)

    const rejected = {
      post: vi.fn(() => Promise.reject({ response: { status: 400 } })),
    }
    expect(await flushTransportScanQueue(rejected)).toEqual({ sent: 0, dropped: 1, remaining: 0 })
  })
})
