import { describe, it, expect, beforeEach } from 'vitest'
import { loadQueue, enqueueScan, queueLength, flushQueue } from './scanQueue.js'

const ok = { ok: true, status: 200 }
const clientErr = { ok: false, status: 404 }
const serverErr = { ok: false, status: 503 }

beforeEach(() => localStorage.clear())

describe('station/scanQueue', () => {
  it('enqueue kuyruğa scanned_at damgasıyla ekler', () => {
    const n = enqueueScan({ raw_uid: 'UID1' })
    expect(n).toBe(1)
    const q = loadQueue()
    expect(q[0].raw_uid).toBe('UID1')
    expect(q[0].scanned_at).toBeTruthy()
  })

  it('bozuk localStorage boş kuyruk sayılır', () => {
    localStorage.setItem('yys_station_scan_queue', '{bozuk')
    expect(loadQueue()).toEqual([])
  })

  it('flush: başarılı gönderim kuyruğu boşaltır', async () => {
    enqueueScan({ raw_uid: 'A' }); enqueueScan({ raw_uid: 'B', meal_type: 'lunch' })
    const r = await flushQueue('ST-key', async () => ok)
    expect(r).toEqual({ sent: 2, dropped: 0, remaining: 0 })
    expect(queueLength()).toBe(0)
  })

  it('flush: 4xx kalıcı ret düşürülür, kuyruk tıkanmaz', async () => {
    enqueueScan({ raw_uid: 'A' })
    const r = await flushQueue('ST-key', async () => clientErr)
    expect(r).toEqual({ sent: 0, dropped: 1, remaining: 0 })
  })

  it('flush: 5xx ve ağ hatası kuyrukta KALIR', async () => {
    enqueueScan({ raw_uid: 'A' }); enqueueScan({ raw_uid: 'B' })
    let i = 0
    const r = await flushQueue('ST-key', async () => {
      i++
      if (i === 1) return serverErr
      throw new TypeError('network')
    })
    expect(r).toEqual({ sent: 0, dropped: 0, remaining: 2 })
    expect(queueLength()).toBe(2)
  })

  it('flush: scanned_at ve meal_type form alanı olarak gönderilir', async () => {
    enqueueScan({ raw_uid: 'A', meal_type: 'dinner' })
    let sentBody
    await flushQueue('ST-key', async (_url, opts) => { sentBody = opts.body; return ok })
    expect(sentBody.get('raw_uid')).toBe('A')
    expect(sentBody.get('meal_type')).toBe('dinner')
    expect(sentBody.get('scanned_at')).toBeTruthy()
  })
})
