import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { initDB, getDB } from '../db/index.js'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  process.env.NODE_ENV = 'test'
  process.env.VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  initDB()
  // FK icin dummy user — push_subscriptions.user_id REFERENCES users(id)
  getDB().prepare(`
    INSERT OR IGNORE INTO users(id, username, password_hash, role, full_name)
    VALUES(1, 'jobtest', 'x', 'campus_manager', 'Job Test')
  `).run()
})

beforeEach(() => {
  getDB().exec('DELETE FROM push_subscriptions')
})

describe('push.send handler', () => {
  it('sends notification to subscription', async () => {
    const webpush = (await import('web-push')).default
    webpush.sendNotification.mockReset()
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 })
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(1, 1, 'https://e.x/1', 'p1', 'a1')
    `).run()

    await handlers['push.send']({ subscriptionId: 1, payload: { title: 'hi' } })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    const [sub, json] = webpush.sendNotification.mock.calls[0]
    expect(sub.endpoint).toBe('https://e.x/1')
    expect(JSON.parse(json)).toEqual({ title: 'hi' })
  })

  it('deletes subscription and throws permanent on 410', async () => {
    const webpush = (await import('web-push')).default
    webpush.sendNotification.mockReset()
    const err = new Error('Gone')
    err.statusCode = 410
    webpush.sendNotification.mockRejectedValue(err)
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(2, 1, 'https://e.x/2', 'p2', 'a2')
    `).run()

    let caught
    try { await handlers['push.send']({ subscriptionId: 2, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
    const row = getDB().prepare('SELECT * FROM push_subscriptions WHERE id=2').get()
    expect(row).toBeUndefined()
  })

  it('throws (retry) on transient error', async () => {
    const webpush = (await import('web-push')).default
    webpush.sendNotification.mockReset()
    webpush.sendNotification.mockRejectedValue(new Error('network'))
    const { handlers } = await import('./handlers.js')

    getDB().prepare(`
      INSERT INTO push_subscriptions(id, user_id, endpoint, p256dh_key, auth_key)
      VALUES(3, 1, 'https://e.x/3', 'p3', 'a3')
    `).run()

    let caught
    try { await handlers['push.send']({ subscriptionId: 3, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.message).toBe('network')
    expect(caught?.permanent).toBeUndefined()
  })

  it('throws permanent if subscription not found in DB', async () => {
    const { handlers } = await import('./handlers.js')
    let caught
    try { await handlers['push.send']({ subscriptionId: 9999, payload: {} }) }
    catch (e) { caught = e }
    expect(caught?.permanent).toBe(true)
  })
})
