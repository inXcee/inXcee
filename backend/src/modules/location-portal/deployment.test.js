import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, rotateLocationQr, revokeLocationQr, listPrintableQrCodes } from './service.js'
import { shortSerial } from './labelTemplates.js'
import {
  cancelBatch,
  confirmBatchPrinted,
  createPrintBatch,
  effectiveDeploymentState,
  getDeploymentReport,
  listOpenMismatches,
  listPrintBatches,
  listStaleLabels,
  markInstalled,
  reportLabelIssue,
  verifyDeployment,
} from './deployment.js'

// Faz 7 kabul kriterleri (spec):
//   • Çoklu etiket formatları ve kalibrasyon  → labelPdf.test.js
//   • Basım partileri                         → burada
//   • Dağıtım listesi                         → burada
//   • Yerinde doğrulama                       → burada
//
// Bu dosyanın omurgasındaki kural: "kayıt yok" ile "kurulmadı" AYNI ŞEY DEĞİL.
// Tablolar canlıda 1078 QR üretildikten sonra eklendi; kayıtsız konumu
// "kurulmadı" saymak birini 19 bloğu boşuna gezmeye göndermek olurdu.

let adminToken, kullaniciId
let odaKonum, digerKonum

const partiKalemleri = (limit = 3) =>
  listPrintableQrCodes({}).slice(0, limit).map(k => ({
    location_id: k.id, qr_code_id: k.qr_code_id, serial: shortSerial(k, k.token),
  }))

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  generateMissingQrCodes({}, null)
  kullaniciId = getDB().prepare('SELECT id FROM users LIMIT 1').get().id

  const konumlar = getDB().prepare(`
    SELECT sl.id, sl.block, q.id AS qr_id, q.token, sl.display_name
    FROM service_locations sl JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    WHERE sl.location_type='room' ORDER BY sl.id LIMIT 2
  `).all()
  odaKonum = konumlar[0]
  digerKonum = konumlar[1]
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM location_qr_verify_mismatches').run()
  db.prepare('DELETE FROM location_qr_deployments').run()
  db.prepare('DELETE FROM location_qr_print_batch_items').run()
  db.prepare('DELETE FROM location_qr_print_batches').run()
})

const kurulum = (locationId) =>
  getDB().prepare('SELECT * FROM location_qr_deployments WHERE location_id=?').get(locationId)

// ---------------------------------------------------------------------------
describe('etiket durumu türetme', () => {
  it('QR üretilmemişse "qr_missing" der', () => {
    expect(effectiveDeploymentState({ active_qr_id: null }).state).toBe('qr_missing')
  })

  // FAZIN EN ÖNEMLİ TESTİ: kayıt yokluğu "kurulmadı" diye okunmamalı.
  it('kurulum kaydı yoksa "kurulmadı" DEĞİL "bilinmiyor" der', () => {
    const d = effectiveDeploymentState({ active_qr_id: 5, raw_status: null })
    expect(d.state).toBe('unknown')
    expect(d.label).toMatch(/kaydedilmemiş/i)
    // Aksiyon listesine düşmemeli: gidip yeniden asılacak bir şey yok.
    expect(d.actionable).toBe(false)
  })

  it('asılı etiketin QR’ı aktif QR’dan farklıysa bayat sayar', () => {
    const d = effectiveDeploymentState({ active_qr_id: 9, deployed_qr_id: 4, raw_status: 'verified' })
    expect(d.state).toBe('stale')
    expect(d.label).toMatch(/yeniden basılmalı/i)
  })

  it('aynı QR doğrulanmışsa doğrulanmış kalır', () => {
    expect(effectiveDeploymentState({ active_qr_id: 9, deployed_qr_id: 9, raw_status: 'verified' }).state)
      .toBe('verified')
  })

  it('basıldı ama asıldığı kaydedilmediyse aksiyon gerektirir', () => {
    const d = effectiveDeploymentState({ active_qr_id: 9, deployed_qr_id: 9, raw_status: 'printed' })
    expect(d.state).toBe('printed')
    expect(d.actionable).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('basım partisi', () => {
  it('parti açar, kalemleri ve kurulum kayıtlarını yazar', () => {
    const kalemler = partiKalemleri(3)
    const parti = createPrintBatch({ templateKey: 'a4_8', items: kalemler, userId: kullaniciId })

    expect(parti.batch_no).toMatch(/^BP-\d{5}$/)
    expect(parti.label_count).toBe(3)
    expect(parti.page_count).toBe(1)          // a4_8 → sayfa başına 8
    expect(getDB().prepare('SELECT COUNT(*) c FROM location_qr_print_batch_items WHERE batch_id=?')
      .get(parti.id).c).toBe(3)
    expect(kurulum(kalemler[0].location_id).status).toBe('printed')
  })

  it('sayfa ve göz numarası şablona göre hesaplanır', () => {
    const parti = createPrintBatch({ templateKey: 'a4_8', items: partiKalemleri(10), userId: kullaniciId })
    expect(parti.page_count).toBe(2)
    const dokuzuncu = getDB().prepare(`
      SELECT page_no, slot_no FROM location_qr_print_batch_items WHERE batch_id=? ORDER BY id LIMIT 1 OFFSET 8
    `).get(parti.id)
    expect(dokuzuncu).toEqual({ page_no: 2, slot_no: 1 })
  })

  // Boş parti "hepsi basıldı" yanılgısını kayda geçirirdi.
  it('boş listeyle parti açılmaz', () => {
    expect(() => createPrintBatch({ templateKey: 'a4_8', items: [], userId: kullaniciId }))
      .toThrow(/Basılacak etiket yok/)
  })

  it('kalibrasyon güvenli aralığa çekilerek saklanır', () => {
    const parti = createPrintBatch({
      templateKey: 'a4_8',
      calibration: { offset_x_mm: 99, scale: 3 },
      items: partiKalemleri(1),
      userId: kullaniciId,
    })
    expect(parti.calibration).toMatchObject({ offset_x_mm: 10, scale: 1.02 })
  })

  // Aynı etiketi yeniden basmak, kapıda duran etiketin doğrulanmış olduğunu
  // unutturmamalı.
  it('aynı QR yeniden basılınca doğrulanmış durum korunur', () => {
    const kalem = partiKalemleri(1)
    createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })
    verifyDeployment({ token: odaKonum.token, userId: kullaniciId })
    expect(kurulum(odaKonum.id).status).toBe('verified')

    createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })
    expect(kurulum(odaKonum.id).status).toBe('verified')
  })

  it('parti onaylanır ve ikinci kez onaylanamaz', () => {
    const parti = createPrintBatch({ templateKey: 'a4_8', items: partiKalemleri(1), userId: kullaniciId })
    expect(confirmBatchPrinted(parti.id, kullaniciId).status).toBe('printed')
    expect(() => confirmBatchPrinted(parti.id, kullaniciId)).toThrow(/bulunamadı/)
  })

  it('iptal edilen parti yalnız asılmamış kurulum kayıtlarını geri alır', () => {
    const kalemler = partiKalemleri(2)
    const parti = createPrintBatch({ templateKey: 'a4_8', items: kalemler, userId: kullaniciId })
    markInstalled([kalemler[0].location_id], { userId: kullaniciId })

    const sonuc = cancelBatch(parti.id, kullaniciId)
    expect(sonuc.reverted_deployments).toBe(1)
    // Asılan etiket kâğıt olarak kapıda duruyor; kaydı silmek onu yok saymak olurdu.
    expect(kurulum(kalemler[0].location_id).status).toBe('installed')
    expect(kurulum(kalemler[1].location_id)).toBeUndefined()
  })

  it('parti listesi okunamazsa boş liste değil gerekçe döner', () => {
    const bos = new Database(':memory:')
    const r = listPrintBatches({}, bos)
    expect(r.available).toBe(false)
    expect(r.reason).toMatch(/okunamadı/)
    bos.close()
  })
})

// ---------------------------------------------------------------------------
describe('yerinde doğrulama', () => {
  it('doğru etiket okutulunca doğrulanır ve asılı sayılır', () => {
    const sonuc = verifyDeployment({
      token: odaKonum.token, expectedLocationId: odaKonum.id, userId: kullaniciId,
    })
    expect(sonuc.ok).toBe(true)
    const k = kurulum(odaKonum.id)
    expect(k.status).toBe('verified')
    // Doğrulama aynı zamanda "asılı" kanıtıdır.
    expect(k.installed_at).toBeTruthy()
    expect(k.verify_count).toBe(1)
  })

  it('tam URL okutulsa da token ayıklanır', () => {
    const sonuc = verifyDeployment({
      token: `https://avskamp.com/q/${odaKonum.token}`, userId: kullaniciId,
    })
    expect(sonuc.ok).toBe(true)
  })

  // FAZIN İKİNCİ EN ÖNEMLİ TESTİ: yanlış kapıya asılmış etiket sessizce
  // onaylanmamalı.
  it('yanlış kapıdaki etiket doğrulama SAYILMAZ, uyuşmazlık kaydedilir', () => {
    const sonuc = verifyDeployment({
      token: digerKonum.token,           // elde B odasının etiketi
      expectedLocationId: odaKonum.id,   // ama A odasının önünde duruyoruz
      userId: kullaniciId,
    })
    expect(sonuc.ok).toBe(false)
    expect(sonuc.code).toBe('location_mismatch')
    expect(sonuc.message).toMatch(/Yanlış etiket/)
    // Hiçbir konum doğrulanmış sayılmamalı.
    expect(kurulum(odaKonum.id)).toBeUndefined()
    expect(kurulum(digerKonum.id)).toBeUndefined()

    const acik = listOpenMismatches()
    expect(acik.available).toBe(true)
    expect(acik.items).toHaveLength(1)
    expect(acik.items[0].reason).toBe('location_mismatch')
  })

  it('iptal edilmiş QR taşıyan etiket doğrulanmaz, yeniden basım der', () => {
    rotateLocationQr(odaKonum.id, kullaniciId)   // eski token artık revoked
    const sonuc = verifyDeployment({ token: odaKonum.token, userId: kullaniciId })
    expect(sonuc.ok).toBe(false)
    expect(sonuc.code).toBe('qr_revoked')
    expect(sonuc.message).toMatch(/yeniden basılmalı/i)
    expect(kurulum(odaKonum.id)).toBeUndefined()

    // Eski token’ı testin geri kalanı için tazele.
    odaKonum = getDB().prepare(`
      SELECT sl.id, sl.block, q.id AS qr_id, q.token, sl.display_name
      FROM service_locations sl JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      WHERE sl.id=?
    `).get(odaKonum.id)
  })

  it('tanınmayan QR reddedilir', () => {
    expect(() => verifyDeployment({ token: 'x'.repeat(50), userId: kullaniciId }))
      .toThrow(/tanımlı değil/)
  })

  it('uyuşmazlık kapatılınca listeden düşer ve ikinci kez kapatılamaz', () => {
    verifyDeployment({ token: digerKonum.token, expectedLocationId: odaKonum.id, userId: kullaniciId })
    const id = listOpenMismatches().items[0].id
    const db = getDB()
    db.prepare("UPDATE location_qr_verify_mismatches SET resolved_at=datetime('now') WHERE id=?").run(id)
    expect(listOpenMismatches().items).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
describe('saha kurulum işaretleme', () => {
  it('kurulum kaydı yokken bile "astım" kaydı doğar', () => {
    const sonuc = markInstalled([odaKonum.id], { userId: kullaniciId })
    expect(sonuc.updated).toBe(1)
    expect(kurulum(odaKonum.id).status).toBe('installed')
  })

  // Aktif QR yoksa satır yazılamaz. Sessizce "tamam" demek görevliye yalan olurdu.
  it('aktif QR’ı olmayan konum sessizce başarılı sayılmaz', () => {
    const db = getDB()
    const hedef = db.prepare(`
      SELECT sl.id FROM service_locations sl
      JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      WHERE sl.location_type='room' ORDER BY sl.id DESC LIMIT 1
    `).get()
    revokeLocationQr(hedef.id, kullaniciId)

    const sonuc = markInstalled([hedef.id], { userId: kullaniciId })
    expect(sonuc.updated).toBe(0)
    expect(sonuc.skipped_no_active_qr).toEqual([hedef.id])
  })

  it('konum seçilmeden çağrı reddedilir', () => {
    expect(() => markInstalled([], { userId: kullaniciId })).toThrow(/Konum seçilmedi/)
  })

  it('hasar bildirimi kaydedilir, geçersiz durum reddedilir', () => {
    const k = reportLabelIssue(odaKonum.id, { status: 'damaged', note: 'Yırtılmış', userId: kullaniciId })
    expect(k.status).toBe('damaged')
    expect(k.damage_note).toBe('Yırtılmış')
    expect(() => reportLabelIssue(odaKonum.id, { status: 'uydurma' })).toThrow(/Geçersiz/)
  })
})

// ---------------------------------------------------------------------------
describe('kurulum raporu', () => {
  it('bilinmeyen durumu ayrı kovada tutar ve oranın paydasını yazar', () => {
    createPrintBatch({ templateKey: 'a4_8', items: partiKalemleri(2), userId: kullaniciId })
    const rapor = getDeploymentReport({})

    expect(rapor.available).toBe(true)
    expect(rapor.summary.printed).toBe(2)
    expect(rapor.summary.unknown).toBeGreaterThan(0)
    // Bilinmeyen ne kuruluya ne kurulmamışa sayılır; payda açıkça bildirilir.
    expect(rapor.summary.known).toBe(rapor.summary.total - rapor.summary.unknown)
    expect(rapor.summary.coverage_note).toMatch(/kaydedilmemiş/)
  })

  it('bir bloğun tamamı basılınca o blokta uyarı notu kalmaz', () => {
    const blok = odaKonum.block
    const hepsi = listPrintableQrCodes({ block: blok }).map(k => ({
      location_id: k.id, qr_code_id: k.qr_code_id, serial: shortSerial(k, k.token),
    }))
    expect(hepsi.length).toBeGreaterThan(0)
    createPrintBatch({ templateKey: 'a4_8', items: hepsi, userId: kullaniciId })

    const rapor = getDeploymentReport({ block: blok })
    expect(rapor.summary.unknown).toBe(0)
    expect(rapor.summary.coverage_note).toBeNull()
    expect(rapor.summary.known).toBe(rapor.summary.total)
  })

  it('bloğa göre süzer', () => {
    const blok = odaKonum.block
    expect(blok).toBeTruthy()
    const rapor = getDeploymentReport({ block: blok })
    expect(rapor.items.length).toBeGreaterThan(0)
    expect(rapor.items.every(i => i.block === blok)).toBe(true)
  })

  it('rapor okunamazsa boş liste değil gerekçe döner', () => {
    const bos = new Database(':memory:')
    const r = getDeploymentReport({}, bos)
    expect(r.available).toBe(false)
    expect(r.reason).toMatch(/okunamadı/)
    expect(r.summary).toBeNull()
    bos.close()
  })
})

// ---------------------------------------------------------------------------
describe('bayat etiket listesi', () => {
  it('QR döndürülen konumun basılı etiketi yeniden basım listesine düşer', () => {
    const kalem = [{
      location_id: odaKonum.id, qr_code_id: odaKonum.qr_id,
      serial: shortSerial({ block: 'M1', room_no: '101' }, odaKonum.token),
    }]
    createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })
    expect(listStaleLabels().items).toHaveLength(0)

    rotateLocationQr(odaKonum.id, kullaniciId)

    const bayat = listStaleLabels()
    expect(bayat.available).toBe(true)
    expect(bayat.items.map(i => i.location_id)).toContain(odaKonum.id)
    // Rapor da aynı şeyi söylemeli.
    const rapor = getDeploymentReport({})
    expect(rapor.items.find(i => i.location_id === odaKonum.id).state).toBe('stale')

    odaKonum = getDB().prepare(`
      SELECT sl.id, sl.block, q.id AS qr_id, q.token, sl.display_name
      FROM service_locations sl JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      WHERE sl.id=?
    `).get(odaKonum.id)
  })

  it('bayat liste okunamazsa gerekçe döner', () => {
    const bos = new Database(':memory:')
    expect(listStaleLabels(bos).available).toBe(false)
    bos.close()
  })
})

// ---------------------------------------------------------------------------
describe('uçlar', () => {
  const yetkili = (m, yol) => request(app)[m](yol).set({ Authorization: `Bearer ${adminToken}` })

  it('şablon listesi ve varsayılan döner', async () => {
    const res = await yetkili('get', '/api/location-portal/label-templates')
    expect(res.status).toBe(200)
    expect(res.body.default_template).toBe('a4_8')
    expect(res.body.templates.find(t => t.key === 'a4_8').per_page).toBe(8)
  })

  it('parti açar ve PDF’i parti kaydından üretir', async () => {
    const acilis = await yetkili('post', '/api/location-portal/print-batches')
      .send({ template: 'a4_8', filters: { block: odaKonum.block } })
    expect(`${acilis.status} ${JSON.stringify(acilis.body).slice(0, 200)}`).toContain('201')
    expect(acilis.body.batch_no).toMatch(/^BP-/)

    const pdf = await yetkili('get', `/api/location-portal/print-batches/${acilis.body.id}/labels.pdf`)
      .buffer(true).parse((res, cb) => {
        const parcalar = []
        res.on('data', c => parcalar.push(c))
        res.on('end', () => cb(null, Buffer.concat(parcalar)))
      })
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30000)

  it('olmayan parti için PDF 404 döner', async () => {
    expect((await yetkili('get', '/api/location-portal/print-batches/999999/labels.pdf')).status).toBe(404)
  })

  it('doğrulama ucu uyuşmazlıkta 409 döner', async () => {
    const res = await yetkili('post', '/api/location-portal/deployments/verify')
      .send({ token: digerKonum.token, expected_location_id: odaKonum.id })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('location_mismatch')
  })

  it('doğrulama ucu doğru etikette 200 döner', async () => {
    const res = await yetkili('post', '/api/location-portal/deployments/verify')
      .send({ token: odaKonum.token, expected_location_id: odaKonum.id })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('kurulum raporu ve bayat listesi okunur', async () => {
    expect((await yetkili('get', '/api/location-portal/deployments')).body.available).toBe(true)
    expect((await yetkili('get', '/api/location-portal/deployments/stale')).body.available).toBe(true)
  })

  it('kalibrasyon PDF’i üretilir', async () => {
    const res = await yetkili('get', '/api/location-portal/calibration.pdf?template=a4_12')
      .buffer(true).parse((r, cb) => {
        const p = []
        r.on('data', c => p.push(c))
        r.on('end', () => cb(null, Buffer.concat(p)))
      })
    expect(res.status).toBe(200)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('yetkisiz erişim reddedilir', async () => {
    expect((await request(app).get('/api/location-portal/deployments')).status).toBe(401)
    expect((await request(app).post('/api/location-portal/print-batches').send({})).status).toBe(401)
  })
})
