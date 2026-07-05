import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, personnelId
beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  token = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  const db = (await import('../../shared/db/index.js')).getDB()
  personnelId = db.prepare("INSERT INTO personnel(tc_no,full_name) VALUES('55555','Test P')").run().lastInsertRowid
})

describe('Discipline', () => {
  it('adds yellow card', async () => {
    const res = await request(app)
      .post('/api/discipline/records')
      .set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: personnelId, card_type: 'yellow', reason: 'Sigara ihlali' })
    expect(res.status).toBe(201)
  })
  it('auto-notifies at 3 yellow cards', async () => {
    for (let i = 0; i < 2; i++) {
      await request(app).post('/api/discipline/records').set('Authorization', `Bearer ${token}`)
        .send({ personnel_id: personnelId, card_type: 'yellow', reason: 'Test ihlal' })
    }
    const db = (await import('../../shared/db/index.js')).getDB()
    const notif = db.prepare("SELECT * FROM notifications WHERE message LIKE '%fesih%'").get()
    expect(notif).toBeTruthy()
  })

  it('filters stats by date range', async () => {
    const today = new Date().toISOString().split('T')[0]
    const res = await request(app)
      .get(`/api/discipline/stats?date_from=${today}&date_to=${today}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total_records')
    expect(res.body).toHaveProperty('recentActivity')
    // With date range, total_records should be a number
    expect(typeof res.body.total_records).toBe('number')
  })
  it('N1: 30 günde 3 sarı → otomatik kırmızı (idempotent)', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const { runDisciplineAutomation, AUTO_RED_REASON } = await import('./automation.js')
    const pid = db.prepare("INSERT INTO personnel(tc_no,full_name) VALUES('77001','AutoRed Test')").run().lastInsertRowid
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/discipline/records').set('Authorization', `Bearer ${token}`)
        .send({ personnel_id: pid, card_type: 'yellow', reason: 'Otomasyon ihlal ' + (i + 1) })
    }

    const r1 = runDisciplineAutomation()
    expect(r1.auto_red).toBeGreaterThanOrEqual(1)
    const red = db.prepare("SELECT * FROM discipline_records WHERE personnel_id=? AND card_type='red' AND reason=?")
      .all(pid, AUTO_RED_REASON)
    expect(red.length).toBe(1)

    // İkinci çalıştırma aynı kişiye ikinci kırmızıyı BASMAZ
    runDisciplineAutomation()
    const red2 = db.prepare("SELECT * FROM discipline_records WHERE personnel_id=? AND card_type='red' AND reason=?")
      .all(pid, AUTO_RED_REASON)
    expect(red2.length).toBe(1)

    const audit = db.prepare("SELECT * FROM audit_log WHERE target_id=? AND action='discipline_auto_red'").get(pid)
    expect(audit).toBeTruthy()
  })

  it('N1: 90 gün temiz → 1 puan af (90 günde tek sefer)', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const { runDisciplineAutomation } = await import('./automation.js')
    // Puanı var ama hiç kaydı olmayan (>=90g temiz sayılır) personel
    const pid = db.prepare("INSERT INTO personnel(tc_no,full_name,discipline_points) VALUES('77002','Amnesty Test',2)").run().lastInsertRowid

    const r1 = runDisciplineAutomation()
    expect(r1.amnesty).toBeGreaterThanOrEqual(1)
    let p = db.prepare('SELECT discipline_points FROM personnel WHERE id=?').get(pid)
    expect(p.discipline_points).toBe(1)

    // Aynı 90 gün penceresinde ikinci af YOK (audit guard)
    runDisciplineAutomation()
    p = db.prepare('SELECT discipline_points FROM personnel WHERE id=?').get(pid)
    expect(p.discipline_points).toBe(1)

    const audit = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE target_id=? AND action='discipline_amnesty'").get(pid)
    expect(audit.c).toBe(1)
  })

  it('N1: son 30 günde kaydı olmayan temiz personel kırmızı YEMEZ', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const { runDisciplineAutomation } = await import('./automation.js')
    const pid = db.prepare("INSERT INTO personnel(tc_no,full_name) VALUES('77003','Clean Test')").run().lastInsertRowid
    // Eski tarihli 3 sarı (35 gün önce) — pencere dışı
    const admin = db.prepare("SELECT id FROM users WHERE role='campus_manager' LIMIT 1").get().id
    for (let i = 0; i < 3; i++) {
      db.prepare("INSERT INTO discipline_records(personnel_id,card_type,reason,created_by,created_at) VALUES(?,?,?,?,datetime('now','-35 days'))")
        .run(pid, 'yellow', 'Eski ihlal', admin)
    }
    runDisciplineAutomation()
    const red = db.prepare("SELECT COUNT(*) c FROM discipline_records WHERE personnel_id=? AND card_type='red'").get(pid)
    expect(red.c).toBe(0)
  })

  it('auto-blacklists at 5 discipline points', async () => {
    const db = (await import('../../shared/db/index.js')).getDB()
    const pid = db.prepare("INSERT INTO personnel(tc_no,full_name) VALUES('66666','Blacklist Test')").run().lastInsertRowid
    // 3 yellow (3 pts) + 1 red (2 pts) = 5 pts
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/discipline/records').set('Authorization', `Bearer ${token}`)
        .send({ personnel_id: pid, card_type: 'yellow', reason: 'İhlal ' + (i + 1) })
    }
    await request(app).post('/api/discipline/records').set('Authorization', `Bearer ${token}`)
      .send({ personnel_id: pid, card_type: 'red', reason: 'Ağır ihlal' })
    const p = db.prepare('SELECT is_blacklisted, blacklist_reason FROM personnel WHERE id=?').get(pid)
    expect(p.is_blacklisted).toBe(1)
    expect(p.blacklist_reason).toContain('Otomatik')
    const audit = db.prepare("SELECT * FROM audit_log WHERE target_id=? AND action='auto_blacklist'").get(pid)
    expect(audit).toBeTruthy()
  })
})
