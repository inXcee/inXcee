import { beforeAll, describe, expect, it } from 'vitest'
import { Writable } from 'node:stream'
import request from 'supertest'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import {
  generateMissingQrCodes, listPrintableQrCodes, rotateLocationQr, updatePortalSettings,
} from './service.js'
import { shortSerial } from './labelTemplates.js'
import { writeLabelPdfTo } from './labelPdf.js'
import {
  createPrintBatch, confirmBatchPrinted, getBatch, markInstalled,
  reportLabelIssue, verifyDeployment, getDeploymentReport,
} from './deployment.js'

// Faz 8 — uçtan uca doğrulama ve performans.
//
// Önceki fazların testleri kendi katmanlarını doğruluyor. Buradaki testler
// ZİNCİRİ doğruluyor: QR üretimi → basım partisi → kapıya asma → sakinin
// okutması → arıza kaydı. Zincirin bir halkası koparsa tek tek testler yine
// geçer; sakin yine hiçbir şey yapamaz.
//
// Spec'in bu fazda kapatılması istenen kabul kriterleri burada karşılanıyor:
//   • "PDF indirme ile 'yazdırıldı' durumunun karıştırılmaması"
//   • "Yanlış oda QR'ının kurulum doğrulamasını geçememesi"
//   • "Hasarlı etikette aynı tokenla yeniden basım"
//   • "Güvenlik durumunda token döndürme ve eski QR'ın 410 olması"
//   • "Parti kapsama ve eksik oda sayılarının doğru hesaplanması"
//   • "1174+ konum için toplu PDF'in bellek taşması olmadan akış halinde üretilmesi"

let adminToken, kullaniciId

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  kullaniciId = getDB().prepare('SELECT id FROM users LIMIT 1').get().id

  // Spec ölçeği "1174+ oda ve ortak alan". Seed 1078 veriyor; farkı sentetik
  // ortak alanla kapatıyoruz ki performans testi gerçekten o ölçekte koşsun.
  const db = getDB()
  const ekle = db.prepare(`
    INSERT OR IGNORE INTO service_locations
      (location_type, source, room_id, block, floor, area_code, qr_location, display_name, is_active)
    VALUES('common_area','manual',NULL,'M1',1,?,?,?,1)
  `)
  db.transaction(() => {
    for (let i = 0; i < 120; i += 1) {
      ekle.run(`e2e${i}`, `E2E-TEST-${i}`, `Test Ortak Alan ${i}`)
    }
  })()

  generateMissingQrCodes({}, null)
  updatePortalSettings({ location_portal_enabled: true, location_portal_fault_enabled: true })
})

const aktifToken = (locationId) => getDB()
  .prepare("SELECT token FROM location_qr_codes WHERE location_id=? AND status='active'").get(locationId)?.token

const bosOda = () => getDB().prepare(`
  SELECT sl.id, sl.display_name, sl.block FROM service_locations sl
  JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
  LEFT JOIN location_qr_deployments d ON d.location_id=sl.id
  WHERE sl.location_type='room' AND d.id IS NULL
  ORDER BY sl.id LIMIT 1
`).get()

// ---------------------------------------------------------------------------
describe('uçtan uca: basımdan sakinin arızasına', () => {
  it('QR → parti → asma → okutma → arıza zinciri tamamlanır', async () => {
    const oda = bosOda()
    const kalem = [{
      location_id: oda.id,
      qr_code_id: getDB().prepare("SELECT id FROM location_qr_codes WHERE location_id=? AND status='active'").get(oda.id).id,
      serial: shortSerial(oda, aktifToken(oda.id)),
    }]

    // 1) Basım partisi açılır — henüz kâğıt çıkmadı.
    const parti = createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })
    expect(getBatch(parti.id).status).toBe('generated')

    // 2) PDF indirilir. SPEC KRİTERİ: indirme "yazdırıldı" DEĞİLDİR.
    const pdf = await request(app)
      .get(`/api/location-portal/print-batches/${parti.id}/labels.pdf`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .buffer(true).parse((res, cb) => {
        const p = []
        res.on('data', c => p.push(c))
        res.on('end', () => cb(null, Buffer.concat(p)))
      })
    expect(pdf.status).toBe(200)
    expect(getBatch(parti.id).status).toBe('generated')   // hâlâ onaylanmadı

    // 3) Kâğıt çıktı, yönetici onaylar.
    expect(confirmBatchPrinted(parti.id, kullaniciId).status).toBe('printed')

    // 4) Görevli kapıya asar ve yerinde doğrular.
    markInstalled([oda.id], { userId: kullaniciId })
    const dogrulama = verifyDeployment({
      token: aktifToken(oda.id), expectedLocationId: oda.id, userId: kullaniciId,
    })
    expect(dogrulama.ok).toBe(true)

    // 5) Sakin QR'ı okutur — portal açılır.
    const portal = await request(app).get(`/api/room-portal/${aktifToken(oda.id)}`)
    expect(portal.status).toBe(200)
    expect(portal.body.location.display_name).toBe(oda.display_name)

    // 6) Arıza bildirir ve makbuz alır.
    const ariza = await request(app)
      .post(`/api/room-portal/${aktifToken(oda.id)}/faults`)
      .field('client_request_id', `e2e-fault-${oda.id}`)
      .field('category', 'elektrik')
      .field('description', 'Odadaki priz çalışmıyor, uçtan uca test')
    expect(`${ariza.status} ${JSON.stringify(ariza.body).slice(0, 200)}`).toContain('201')
    expect(ariza.body.receipt).toBeTruthy()

    // 7) Zincirin sonu: teknik ekibe gerçekten iş düştü mü?
    const kayit = getDB().prepare(`
      SELECT COUNT(*) c FROM location_portal_events
      WHERE location_id=? AND event_type='fault'
    `).get(oda.id)
    expect(kayit.c).toBe(1)
  }, 60000)

  // SPEC KRİTERİ: "Güvenlik durumunda token döndürme ve eski QR'ın 410 olması."
  it('token döndürülünce eski QR 410 döner, yenisi çalışır', async () => {
    const oda = bosOda()
    const eski = aktifToken(oda.id)
    expect((await request(app).get(`/api/room-portal/${eski}`)).status).toBe(200)

    rotateLocationQr(oda.id, kullaniciId, 'guvenlik')

    const eskiCevap = await request(app).get(`/api/room-portal/${eski}`)
    expect(eskiCevap.status).toBe(410)
    expect(eskiCevap.body.code).toBe('revoked_qr')

    const yeni = aktifToken(oda.id)
    expect(yeni).not.toBe(eski)
    expect((await request(app).get(`/api/room-portal/${yeni}`)).status).toBe(200)
  })

  // SPEC KRİTERİ: "Hasarlı etikette aynı tokenla yeniden basım."
  // Hasar güvenlik olayı değildir; token DEĞİŞMEZ, yoksa kapıdaki diğer
  // etiketlerle birlikte tüm blokun yeniden basılması gerekirdi.
  it('hasarlı etiket aynı tokenla yeniden basılır', () => {
    const oda = bosOda()
    const qrId = getDB().prepare("SELECT id FROM location_qr_codes WHERE location_id=? AND status='active'").get(oda.id).id
    const token = aktifToken(oda.id)
    const kalem = [{ location_id: oda.id, qr_code_id: qrId, serial: shortSerial(oda, token) }]

    createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })
    markInstalled([oda.id], { userId: kullaniciId })
    reportLabelIssue(oda.id, { status: 'damaged', note: 'Yırtılmış', userId: kullaniciId })

    createPrintBatch({ templateKey: 'a4_8', items: kalem, userId: kullaniciId })

    expect(aktifToken(oda.id)).toBe(token)              // token AYNI
    const d = getDB().prepare('SELECT * FROM location_qr_deployments WHERE location_id=?').get(oda.id)
    expect(d.status).toBe('printed')                     // hasar kapandı
    expect(d.damage_note).toBeNull()
  })

  // SPEC KRİTERİ: "Yanlış oda QR'ının kurulum doğrulamasını geçememesi."
  it('yanlış oda QR’ı kurulum doğrulamasını geçemez', () => {
    const a = bosOda()
    markInstalled([a.id], { userId: kullaniciId })
    const b = bosOda()

    const sonuc = verifyDeployment({
      token: aktifToken(b.id), expectedLocationId: a.id, userId: kullaniciId,
    })
    expect(sonuc.ok).toBe(false)
    expect(sonuc.code).toBe('location_mismatch')
    expect(getDB().prepare('SELECT status FROM location_qr_deployments WHERE location_id=?').get(a.id).status)
      .toBe('installed')                                 // doğrulanmış sayılmadı
  })

  // SPEC KRİTERİ: "Parti kapsama ve eksik oda sayılarının doğru hesaplanması."
  it('parti kapsaması ve QR’sız konum sayısı tutarlıdır', () => {
    const blok = 'S1'
    const basilabilir = listPrintableQrCodes({ block: blok })
    const rapor = getDeploymentReport({ block: blok })

    // Parti yalnız aktif QR'ı olan konumları kapsar; kalanı raporda qr_missing.
    expect(basilabilir.length + rapor.summary.qr_missing).toBe(rapor.summary.total)
    expect(basilabilir.every(k => k.token)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SPEC KRİTERİ: "1174+ oda ve ortak alan için toplu PDF'in bellek taşması
// olmadan AKIŞ HALİNDE üretilmesi."
//
// Ölçüm iki şeyi ayırır: akışa bağlıyken pdfkit'in kendi okuma tamponu boş
// kalır (tüketici veriyi anında alır), bağlı değilken tüm PDF orada birikir.
// "Akış halinde" iddiasının kanıtı budur.
describe('performans: kampüs ölçeğinde toplu PDF', () => {
  it('1174+ etiket akışa bağlıyken bellekte birikmeden üretilir', async () => {
    const kayitlar = listPrintableQrCodes({})
    expect(kayitlar.length).toBeGreaterThanOrEqual(1174)

    let bayt = 0
    let enBuyukTampon = 0
    let doc = null
    const yutucu = new Writable({
      highWaterMark: 64 * 1024,
      write(chunk, _enc, cb) {
        bayt += chunk.length
        // pdfkit'in okunmayı bekleyen tamponu — akış çalışıyorsa küçük kalır.
        if (doc) enBuyukTampon = Math.max(enBuyukTampon, doc.readableLength || 0)
        cb()
      },
    })

    const baslangic = process.memoryUsage().heapUsed
    const t0 = Date.now()
    await writeLabelPdfTo(yutucu, kayitlar, {
      template: 'a4_8', baseUrl: 'https://avskamp.com', batchNo: 'BP-PERF',
      onDocument: d => { doc = d },
    })
    const sure = Date.now() - t0
    const heapArtis = process.memoryUsage().heapUsed - baslangic

    // Gerçek sayılar test çıktısına yazılır: iddia değil ölçüm.
    process.stdout.write(
      `\n  [perf] ${kayitlar.length} etiket · ${(bayt / 1048576).toFixed(1)} MB · ${sure} ms` +
      ` · heap +${(heapArtis / 1048576).toFixed(1)} MB · en büyük tampon ${(enBuyukTampon / 1024).toFixed(0)} KB\n`,
    )

    expect(bayt).toBeGreaterThan(1_000_000)

    // ASIL GARANTİ: akışa bağlı belgede pdfkit'in okuma tamponu PDF'in
    // tamamını tutmamalı. Senkron sürümde bu değer 3,6 MB (PDF'in tamamı),
    // akışlı sürümde ~1 KB ölçüldü.
    expect(enBuyukTampon).toBeLessThan(bayt / 100)

    // heapUsed BİLEREK doğrulanmıyor: süreç geneli ve GC'ye bağlı bir ölçü.
    // Tek başına koşarken +9,7 MB, tam suite içinde +53,6 MB çıkıyor — çünkü
    // aynı süreçteki diğer testlerin çöpü de sayılıyor. Kod değişmeden
    // sıralamaya göre kırılan bir eşik, testi gürültüye çevirir; sayı yalnız
    // bilgi olarak yazdırılıyor.
    expect(heapArtis).toBeTypeOf('number')
  }, 300000)

  it('kampüs geneli kurulum raporu tek sorguda çıkar', () => {
    const t0 = Date.now()
    const rapor = getDeploymentReport({})
    const sure = Date.now() - t0
    process.stdout.write(`\n  [perf] kurulum raporu ${rapor.items.length} konum · ${sure} ms\n`)
    expect(rapor.available).toBe(true)
    expect(rapor.items.length).toBeGreaterThanOrEqual(1174)
    expect(sure).toBeLessThan(5000)
  })
})
