import { describe, it, expect, beforeAll } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { departmentToInventoryCategory, getKioskSystemUserId } from './inventory-helpers.js'

beforeAll(() => { process.env.DB_PATH = ':memory:'; initDB() })

describe('departmentToInventoryCategory', () => {
  it('Temizlik → housekeeping', () => expect(departmentToInventoryCategory('Temizlik')).toBe('housekeeping'))
  it('Teknik → maintenance', () => expect(departmentToInventoryCategory('Teknik')).toBe('maintenance'))
  it('Çamaşırhane → laundry', () => expect(departmentToInventoryCategory('Çamaşırhane')).toBe('laundry'))
  it('bilinmeyen departman → null', () => expect(departmentToInventoryCategory('Güvenlik')).toBeNull())
  it('boş/null → null', () => {
    expect(departmentToInventoryCategory('')).toBeNull()
    expect(departmentToInventoryCategory(null)).toBeNull()
  })
})

describe('getKioskSystemUserId', () => {
  it('idempotent geçerli id döner ve hesap login edilemez', () => {
    const id1 = getKioskSystemUserId()
    const id2 = getKioskSystemUserId()
    expect(id1).toBe(id2)
    expect(Number.isInteger(id1)).toBe(true)
    const u = getDB().prepare('SELECT username, password_hash FROM users WHERE id=?').get(id1)
    expect(u.username).toBe('avs_kiosk_system')
    expect(u.password_hash).toBe('!')
  })
})
