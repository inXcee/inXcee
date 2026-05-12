import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import {
  createNotification,
  getNotifications,
  markRead,
  addSSEClient,
  removeSSEClient,
} from './service.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
})

beforeEach(() => {
  getDB().exec('DELETE FROM notifications')
})

describe('createNotification', () => {
  it('creates a notification and returns it', () => {
    const n = createNotification({ message: 'Test mesajı', type: 'info', module: 'test' })
    expect(n).not.toBeNull()
    expect(n.id).toBeGreaterThan(0)
    expect(n.message).toBe('Test mesajı')
    expect(n.type).toBe('info')
  })

  it('stores target_role and target_user_id', () => {
    const n = createNotification({ message: 'Rol mesajı', type: 'warning', target_role: 'campus_manager' })
    expect(n.target_role).toBe('campus_manager')
    expect(n.target_user_id).toBeNull()
  })

  // A→Z Faz 1
  it('event_kind, severity, entity_*, link alanlarını yazar', () => {
    const n = createNotification({
      message: 'Stok düştü', event_kind: 'inventory.stock.low',
      target_role: 'campus_manager', entity_type: 'inventory_item', entity_id: 42,
    })
    expect(n).not.toBeNull()
    expect(n.event_kind).toBe('inventory.stock.low')
    expect(n.severity).toBe('warning') // DEFAULT_SEVERITY'den
    expect(n.module).toBe('inventory')  // moduleFromEventKind
    expect(n.entity_id).toBe(42)
    expect(n.link).toBe('/inventory?item=42') // LINK_TEMPLATES
  })

  it('geçersiz event_kind reddedilir', () => {
    const n = createNotification({ message: 'X', event_kind: 'sahte.olay.olmayan' })
    expect(n).toBeNull()
  })

  it('eski type kullanımı geriye uyumlu — severity otomatik kopyalanır', () => {
    const n = createNotification({ message: 'Legacy', type: 'critical' })
    expect(n.severity).toBe('critical')
    expect(n.type).toBe('critical')
  })
})

describe('Notification deduplication', () => {
  it('does not insert duplicate with same dedup_key on same day', () => {
    const key = 'test_dedup_key'
    const first = createNotification({ message: 'İlk', type: 'info', dedup_key: key })
    const second = createNotification({ message: 'Tekrar', type: 'info', dedup_key: key })
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    const rows = getDB().prepare('SELECT COUNT(*) as c FROM notifications WHERE dedup_key=?').get(key)
    expect(rows.c).toBe(1)
  })

  it('allows different dedup_keys', () => {
    createNotification({ message: 'A', type: 'info', dedup_key: 'key_a' })
    createNotification({ message: 'B', type: 'info', dedup_key: 'key_b' })
    const rows = getDB().prepare('SELECT COUNT(*) as c FROM notifications').get()
    expect(rows.c).toBe(2)
  })

  it('allows null dedup_key multiple times', () => {
    createNotification({ message: 'No dedup 1', type: 'info' })
    createNotification({ message: 'No dedup 2', type: 'info' })
    const rows = getDB().prepare('SELECT COUNT(*) as c FROM notifications').get()
    expect(rows.c).toBe(2)
  })
})

describe('SSE client eviction', () => {
  it('evicts oldest client when global limit reached', () => {
    // Her client'a unique userId vererek per-user limitini bypass et
    const fakeClients = []
    let evicted = 0
    for (let i = 0; i < 501; i++) {
      const client = { write: () => {}, end: () => { evicted++ } }
      fakeClients.push(client)
      addSSEClient(client, i, 'campus_manager')
    }
    // 501. client eklenince en eski client evict edilmeli
    expect(evicted).toBe(1)
    fakeClients.forEach(c => removeSSEClient(c))
  })

  it('evicts oldest per-user client when same user opens too many tabs', () => {
    const fakeClients = []
    let evicted = 0
    // Aynı user'dan 5 bağlantı aç (limit 4) — en eskisi evict olmalı
    for (let i = 0; i < 5; i++) {
      const client = { write: () => {}, end: () => { evicted++ } }
      fakeClients.push(client)
      addSSEClient(client, 42, 'campus_manager')
    }
    expect(evicted).toBe(1)
    fakeClients.forEach(c => removeSSEClient(c))
  })
})

describe('getNotifications', () => {
  it('returns global notifications (no target) for any user', () => {
    createNotification({ message: 'Herkese 1', type: 'info' })
    createNotification({ message: 'Herkese 2', type: 'info' })
    const result = getNotifications(999, 'shift_supervisor')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('returns notifications for a specific role', () => {
    createNotification({ message: 'Müdüre', type: 'warning', target_role: 'campus_manager' })
    const result = getNotifications(1, 'campus_manager')
    expect(result.some(n => n.target_role === 'campus_manager')).toBe(true)
  })
})

describe('markRead', () => {
  it('marks a notification as read', () => {
    const n = createNotification({ message: 'Okunacak', type: 'info' })
    expect(n.is_read).toBe(0)
    markRead(n.id)
    const updated = getDB().prepare('SELECT is_read FROM notifications WHERE id=?').get(n.id)
    expect(updated.is_read).toBe(1)
  })
})
