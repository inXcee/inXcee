import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueue, getQueue, dequeue, updateRetries,
  getBlob, saveDraft, loadDraft, clearDraft,
  _getRawQueueForTests, _resetForTests, setOfflineContext,
} from './offlineDB.js'

beforeEach(async () => {
  await _resetForTests()
})

describe('enqueue / getQueue / dequeue', () => {
  it('item ekler ve siler', async () => {
    setOfflineContext({ deviceId: 'device-1', principal: { kind: 'staff', id: 7, name: 'Ali' } })
    const id = await enqueue('complete_task', { taskId: 42 })
    const q = await getQueue()
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ type: 'complete_task', payload: { taskId: 42 }, retries: 0, blobIds: [] })
    expect(q[0]).toMatchObject({ device_id: 'device-1', principal: { kind: 'staff', id: 7 } })
    const raw = await _getRawQueueForTests()
    expect(raw[0]).not.toHaveProperty('payload')
    expect(JSON.stringify(raw[0])).not.toContain('taskId')
    expect(raw[0].encrypted_payload.encrypted).toBeTruthy()
    await dequeue(id)
    expect(await getQueue()).toHaveLength(0)
  })

  it('birden fazla item sırayla eklenir', async () => {
    await enqueue('complete_task', { taskId: 1 })
    await enqueue('skip_task', { taskId: 2, reason: 'meşgul' })
    const q = await getQueue()
    expect(q).toHaveLength(2)
    expect(q[0].type).toBe('complete_task')
    expect(q[1].type).toBe('skip_task')
  })
})

describe('updateRetries', () => {
  it('retry sayısını günceller', async () => {
    const id = await enqueue('complete_task', { taskId: 1 })
    await updateRetries(id, 2)
    const q = await getQueue()
    expect(q[0].retries).toBe(2)
  })
})

describe('blob desteği', () => {
  it('blob ile enqueue eder, getBlob döner, dequeue blob\'u da siler', async () => {
    const blob = new Blob(['foto'], { type: 'image/jpeg' })
    const id = await enqueue('fault_report', { location: 'A1' }, [blob])
    const q = await getQueue()
    expect(q[0].blobIds).toHaveLength(1)
    const fetched = await getBlob(q[0].blobIds[0])
    expect(fetched).toBe(blob)
    const blobId = q[0].blobIds[0]
    await dequeue(id)
    expect(await getBlob(blobId)).toBeNull()
  })
})

describe('form_drafts', () => {
  it('draft kaydeder ve yükler', async () => {
    await saveDraft('draft:checkin', { full_name: 'Ali', company: 'ABC' })
    const data = await loadDraft('draft:checkin')
    expect(data).toEqual({ full_name: 'Ali', company: 'ABC' })
  })

  it('yoksa null döner', async () => {
    expect(await loadDraft('draft:yok')).toBeNull()
  })

  it('clearDraft siler', async () => {
    await saveDraft('draft:test', { x: 1 })
    await clearDraft('draft:test')
    expect(await loadDraft('draft:test')).toBeNull()
  })
})
