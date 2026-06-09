import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { importPersonnel, undoPersonnelImport, listPersonnelImportBatches } from './import.js'

let managerToken
let freeRoom // seed'den aktif, boş yataklı bir oda

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'; initDB(); seedDev()
  managerToken = (await request(app).post('/api/auth/login').send({ username: 'mudur', password: 'admin123' })).body.token
  freeRoom = getDB().prepare(`
    SELECT r.* FROM rooms r
    WHERE r.status = 'active' AND r.active_beds > 0
      AND (SELECT COUNT(*) FROM room_assignments ra WHERE ra.room_id = r.id AND ra.check_out_at IS NULL) = 0
    LIMIT 1
  `).get()
})

describe('personnel import — importPersonnel', () => {
  it('dryRun hiçbir şey yazmaz, oluşturulacakları raporlar', () => {
    const before = getDB().prepare('SELECT COUNT(*) c FROM personnel').get().c
    const report = importPersonnel({ rows: [
      { fullName: 'Deneme Kişi Bir', tcNo: '12345678901', company: 'Test AŞ' },
    ] }, 1, { dryRun: true })
    expect(report.created.length).toBe(1)
    expect(getDB().prepare('SELECT COUNT(*) c FROM personnel').get().c).toBe(before)
  })

  it('yeni sakin oluşturur — check_in_date set, cinsiyet sözlükten tahmin', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'Ahmet İçeAktarım', tcNo: '11111111110', company: 'Yapı AŞ', hometown: 'Konya' },
    ] }, 1, { dryRun: false })
    expect(report.created.length).toBe(1)
    expect(report.batchId).toBeTruthy()
    const p = getDB().prepare('SELECT * FROM personnel WHERE tc_no = ?').get('11111111110')
    expect(p).toBeTruthy()
    expect(p.full_name).toBe('Ahmet İçeAktarım')
    expect(p.gender).toBe('male') // "Ahmet" sözlükte
    expect(p.check_in_date).toBeTruthy()
  })

  it('mevcut sakini TC ile eşler — mükerrer oluşturmaz', () => {
    const before = getDB().prepare('SELECT COUNT(*) c FROM personnel').get().c
    const report = importPersonnel({ rows: [
      { fullName: 'Farklı Yazım Ahmet', tcNo: '11111111110' },
    ] }, 1, { dryRun: false })
    expect(report.matched).toBe(1)
    expect(report.created.length).toBe(0)
    expect(getDB().prepare('SELECT COUNT(*) c FROM personnel').get().c).toBe(before)
  })

  it('aksan-katlamalı isimle eşler (TC yoksa) — fuzzyMatched raporlanır', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'AHMET ICEAKTARIM' }, // "Ahmet İçeAktarım"ın katlanmış hâli
    ] }, 1, { dryRun: false })
    expect(report.matched).toBe(1)
    expect(report.fuzzyMatched.length).toBe(1)
    expect(report.created.length).toBe(0)
  })

  it('geçersiz TC (11 hane değil) → kişi TC=NULL ile oluşturulur + raporlanır', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'Hatalı Tc Kişisi', tcNo: '123' },
    ] }, 1, { dryRun: false })
    expect(report.created.length).toBe(1)
    expect(report.invalidTc.length).toBe(1)
    const p = getDB().prepare("SELECT * FROM personnel WHERE full_name = 'Hatalı Tc Kişisi'").get()
    expect(p.tc_no).toBeNull()
  })

  it('dosya içi mükerrer satır (aynı TC) ikinci kez işlenmez', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'Tekrar Eden', tcNo: '22222222220' },
      { fullName: 'Tekrar Eden', tcNo: '22222222220' },
    ] }, 1, { dryRun: false })
    expect(report.created.length).toBe(1)
    expect(report.duplicateRows).toBe(1)
  })

  it('blok+oda verilince odaya atar (yatak no artar)', () => {
    expect(freeRoom).toBeTruthy()
    const report = importPersonnel({ rows: [
      { fullName: 'Odalı Sakin Bir', tcNo: '33333333330', block: freeRoom.block, roomNo: freeRoom.room_no },
    ] }, 1, { dryRun: false })
    expect(report.rooms.assigned).toBe(1)
    const pid = getDB().prepare('SELECT id FROM personnel WHERE tc_no = ?').get('33333333330').id
    const ra = getDB().prepare('SELECT * FROM room_assignments WHERE personnel_id = ? AND check_out_at IS NULL').get(pid)
    expect(ra.room_id).toBe(freeRoom.id)
    expect(ra.bed_no).toBe(1)
  })

  it('oda kapasitesi dolunca uyarı verir, kişi yine oluşturulur (atama yapılmaz)', () => {
    // freeRoom'un kalan yataklarını doldur
    const remaining = freeRoom.active_beds - 1
    const rows = []
    for (let i = 0; i < remaining + 1; i++) {
      rows.push({ fullName: `Dolduran Kişi ${i}`, tcNo: `4444444${String(4440 + i).padStart(4, '0')}`, block: freeRoom.block, roomNo: freeRoom.room_no })
    }
    const report = importPersonnel({ rows }, 1, { dryRun: false })
    expect(report.rooms.assigned).toBe(remaining)
    expect(report.rooms.warnings.length).toBe(1)
    expect(report.created.length).toBe(remaining + 1) // kişiler yine oluştu
  })

  it('bilinmeyen blok/oda → uyarı, kişi oluşturulur', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'Yanlış Oda Kişisi', tcNo: '55555555550', block: 'ZZ', roomNo: '999' },
    ] }, 1, { dryRun: false })
    expect(report.created.length).toBe(1)
    expect(report.rooms.warnings.length).toBe(1)
  })

  it('undo: oluşturulan personel + atamalar silinir, batch undone işaretlenir', () => {
    const report = importPersonnel({ rows: [
      { fullName: 'Geri Alınacak', tcNo: '66666666660', block: freeRoom?.block, roomNo: freeRoom?.room_no },
    ] }, 1, { dryRun: false })
    const pid = getDB().prepare('SELECT id FROM personnel WHERE tc_no = ?').get('66666666660').id
    const result = undoPersonnelImport(report.batchId)
    expect(result.personnelDeleted).toBe(1)
    expect(getDB().prepare('SELECT 1 FROM personnel WHERE id = ?').get(pid)).toBeUndefined()
    expect(getDB().prepare('SELECT 1 FROM room_assignments WHERE personnel_id = ?').get(pid)).toBeUndefined()
    const batch = getDB().prepare('SELECT undone_at FROM personnel_import_batches WHERE id = ?').get(report.batchId)
    expect(batch.undone_at).toBeTruthy()
    // ikinci undo hata fırlatır
    expect(() => undoPersonnelImport(report.batchId)).toThrow()
  })

  it('listPersonnelImportBatches oturumları döndürür', () => {
    const batches = listPersonnelImportBatches()
    expect(Array.isArray(batches)).toBe(true)
    expect(batches.length).toBeGreaterThan(0)
    expect(batches[0]).toHaveProperty('summary')
  })
})

describe('personnel import — routes', () => {
  it('POST /api/personnel/import token olmadan 401', async () => {
    const res = await request(app).post('/api/personnel/import').send({ rows: [] })
    expect(res.status).toBe(401)
  })

  it('POST /api/personnel/import?dryRun=1 önizleme döndürür', async () => {
    const res = await request(app).post('/api/personnel/import?dryRun=1')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows: [{ fullName: 'Route Deneme Kişisi', tcNo: '77777777770' }] })
    expect(res.status).toBe(200)
    expect(res.body.created.length).toBe(1)
    expect(getDB().prepare("SELECT 1 FROM personnel WHERE tc_no = '77777777770'").get()).toBeUndefined()
  })

  it('POST /api/personnel/import geçersiz gövde 400', async () => {
    const res = await request(app).post('/api/personnel/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows: [{ tcNo: '88888888880' }] }) // fullName yok
    expect(res.status).toBe(400)
  })

  it('apply + GET batches + POST undo akışı', async () => {
    const apply = await request(app).post('/api/personnel/import')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ rows: [{ fullName: 'Route Apply Kişisi', tcNo: '99999999990' }] })
    expect(apply.status).toBe(200)
    const batchId = apply.body.batchId
    expect(batchId).toBeTruthy()

    const list = await request(app).get('/api/personnel/import/batches')
      .set('Authorization', `Bearer ${managerToken}`)
    expect(list.status).toBe(200)
    expect(list.body.some(b => b.id === batchId)).toBe(true)

    const undo = await request(app).post(`/api/personnel/import/batches/${batchId}/undo`)
      .set('Authorization', `Bearer ${managerToken}`)
    expect(undo.status).toBe(200)
    expect(getDB().prepare("SELECT 1 FROM personnel WHERE tc_no = '99999999990'").get()).toBeUndefined()
  })
})
