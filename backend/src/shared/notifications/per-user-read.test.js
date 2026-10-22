// Kişiye özel okundu / temizlendi (migration 124). Eskiden is_read paylaşımlıydı: bir müdür okuyunca diğer
// müdürlerde de okunmuş görünüyor, "okunanları temizle" rol bildirimini o roldeki herkesten siliyordu.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDB, getDB } from '../db/index.js'
import { seedDev } from '../db/seed.js'
import { getNotifications, markRead, markAllRead, clearRead, getNotificationStats } from './service.js'

let db, ayse, berk
const ROLE = 'campus_manager'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  const ins = db.prepare("INSERT INTO users(username, password_hash, role, full_name) VALUES(?, 'x', ?, ?)")
  ayse = Number(ins.run('okuma_ayse', ROLE, 'Ayşe Müdür').lastInsertRowid)
  berk = Number(ins.run('okuma_berk', ROLE, 'Berk Müdür').lastInsertRowid)
})

beforeEach(() => db.exec('DELETE FROM notifications'))

const roleNote = (message, extra = {}) => Number(db.prepare(
  'INSERT INTO notifications(type, message, target_role, target_user_id, is_read) VALUES(?, ?, ?, ?, ?)',
).run('info', message, extra.role === undefined ? ROLE : extra.role, extra.user ?? null, extra.is_read ?? 0).lastInsertRowid)

const view = (userId) => Object.fromEntries(getNotifications(userId, ROLE).items.map(n => [n.message, n.is_read]))

describe('kişiye özel okundu', () => {
  it('bir müdürün okuması diğer müdürde okunmamış kalır', () => {
    const id = roleNote('Su kritik')
    markRead(id, ayse)
    expect(view(ayse)['Su kritik']).toBe(1)
    expect(view(berk)['Su kritik']).toBe(0)
  })

  it('"hepsini okundu yap" yalnız yapan kişiyi etkiler; kişisel bildirim yine tek sahipli', () => {
    roleNote('Rol 1'); roleNote('Herkese', { role: null })
    roleNote('Ayşeye özel', { role: null, user: ayse })
    expect(markAllRead(ayse, ROLE)).toBe(3)
    expect(view(ayse)).toEqual({ 'Rol 1': 1, Herkese: 1, 'Ayşeye özel': 1 })
    expect(view(berk)).toEqual({ 'Rol 1': 0, Herkese: 0 })
    expect(markAllRead(ayse, ROLE)).toBe(0) // ikinci kez değişen yok
  })

  it('"okunanları temizle" rol bildirimini yalnız temizleyenin listesinden gizler, silmez', () => {
    const id = roleNote('Temizlenecek')
    markRead(id, ayse)
    expect(clearRead(ayse, ROLE)).toBe(1)
    expect(view(ayse)).toEqual({})
    expect(view(berk)).toEqual({ Temizlenecek: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM notifications WHERE id=?').get(id).c).toBe(1)
  })

  it('migration öncesi paylaşımlı okunmuş rol bildirimi herkes için okunmuş sayılır ve temizlenebilir', () => {
    roleNote('Eski okunmuş', { is_read: 1 })
    expect(view(ayse)['Eski okunmuş']).toBe(1)
    expect(view(berk)['Eski okunmuş']).toBe(1)
    clearRead(berk, ROLE)
    expect(view(berk)).toEqual({})
    expect(view(ayse)).toEqual({ 'Eski okunmuş': 1 })
  })

  it('okunmamış filtresi kişiye göre çalışır; istatistik "hiç okunmamış"ı sayar', () => {
    const a = roleNote('A'); roleNote('B')
    markRead(a, ayse)
    expect(getNotifications(ayse, ROLE, { unread_only: true }).items.map(n => n.message)).toEqual(['B'])
    expect(getNotifications(berk, ROLE, { unread_only: true }).items.map(n => n.message).sort()).toEqual(['A', 'B'])
    expect(getNotificationStats({ days: 7 }).unread).toBe(1) // A'yı biri okudu, B'yi kimse
  })
})
