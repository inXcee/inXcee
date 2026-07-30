import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// notifyItemReady gerçek WhatsApp'a gitmesin — kaç kez çağrıldığını sayıyoruz.
const notifySpy = vi.fn(() => Promise.resolve())
vi.mock('./whatsapp.js', async (importOriginal) => ({
  ...(await importOriginal()),
  notifyItemReady: (...args) => notifySpy(...args),
}))

const { initDB, getDB } = await import('../../shared/db/index.js')
const { seedDev } = await import('../../shared/db/seed.js')
const { advanceItemService, createItemService, revertItemService } = await import('./service.js')
const { markReadyNotifiedQuery } = await import('./queries.js')
const { _resetDedupWindowForTests } = await import('../../shared/notifications/service.js')

let userId, roomId, machineId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const db = getDB()
  userId = db.prepare("SELECT id FROM users WHERE role='laundry' LIMIT 1").get().id
  roomId = db.prepare('SELECT id FROM rooms LIMIT 1').get().id
  machineId = db.prepare("SELECT id FROM laundry_machines WHERE type='washer' LIMIT 1").get().id
})

beforeEach(() => {
  notifySpy.mockClear()
  _resetDedupWindowForTests()
})

function toReady(id) {
  advanceItemService(id, { machine_id: machineId }, userId) // dirty → washing
  advanceItemService(id, { shelf_location: 'A-01' }, userId) // washing → ready
}

function readyNotifications(id) {
  return getDB().prepare('SELECT COUNT(*) AS c FROM notifications WHERE dedup_key=?')
    .get(`laundry_ready_${id}`).c
}

describe('rafta hazır bildirimi tekilliği', () => {
  it('ilk hazır oluşta bir kez gider ve damgalanır', () => {
    const id = createItemService({ room_id: roomId, item_count: 2 }, userId).id
    toReady(id)

    expect(notifySpy).toHaveBeenCalledTimes(1)
    expect(readyNotifications(id)).toBe(1)
    expect(getDB().prepare('SELECT ready_notified_at FROM laundry_items WHERE id=?').get(id).ready_notified_at)
      .toBeTruthy()
  })

  it('damga varken ikinci gönderim yapılmaz', () => {
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    toReady(id)
    expect(markReadyNotifiedQuery(id)).toBe(false)
  })

  it('aynı gün ikinci kez hazır olsa bile in-app bildirim çoğalmaz', () => {
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    toReady(id)
    revertItemService(id, 'dirty', userId)
    _resetDedupWindowForTests()
    toReady(id)

    expect(readyNotifications(id)).toBe(1)
  })

  it('ready geri alınınca damga silinir ve tekrar hazır olunca WhatsApp yeniden gider', () => {
    const id = createItemService({ room_id: roomId, item_count: 1 }, userId).id
    toReady(id)
    expect(notifySpy).toHaveBeenCalledTimes(1)

    revertItemService(id, 'dirty', userId)
    expect(getDB().prepare('SELECT ready_notified_at FROM laundry_items WHERE id=?').get(id).ready_notified_at)
      .toBe(null)

    toReady(id)
    expect(notifySpy).toHaveBeenCalledTimes(2)
  })
})
