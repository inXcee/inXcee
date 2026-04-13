import { describe, it, expect, beforeEach } from 'vitest'
import { initDB, getDB } from './index.js'
import { initProdDB } from './initProd.js'

beforeEach(() => {
  process.env.DB_PATH = ':memory:'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-vitest'
  initDB()
})

describe('initProdDB', () => {
  it('campus_manager yoksa admin oluşturur', () => {
    initProdDB()
    const db = getDB()
    const admin = db.prepare("SELECT * FROM users WHERE role='campus_manager'").get()
    expect(admin).toBeTruthy()
    expect(admin.username).toBe('admin')
    expect(admin.role).toBe('campus_manager')
    expect(admin.password_hash).toBeTruthy()
  })

  it('ikinci çağrıda tekrar admin oluşturmaz', () => {
    initProdDB()
    initProdDB() // ikinci kez çağır
    const db = getDB()
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='campus_manager'").get().c
    expect(count).toBe(1)
  })

  it('mevcut admin varsa değiştirmez', async () => {
    const db = getDB()
    const { default: bcrypt } = await import('bcryptjs')
    const hash = bcrypt.hashSync('mevcut-sifre', 10)
    db.prepare("INSERT INTO users(username, password_hash, role, full_name) VALUES('varolan_admin', ?, 'campus_manager', 'Mevcut Admin')").run(hash)

    initProdDB()

    const admins = db.prepare("SELECT * FROM users WHERE role='campus_manager'").all()
    expect(admins.length).toBe(1)
    expect(admins[0].username).toBe('varolan_admin')
  })
})
