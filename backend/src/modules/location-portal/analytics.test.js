import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import app from '../../app.js'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { generateMissingQrCodes, updatePortalSettings, revokeLocationQr } from './service.js'
import { markInstalled, verifyDeployment } from './deployment.js'
import { getPortalAnalytics, explainSilence, labelProvesReachable, getCleaningReviewStats } from './analytics.js'
import { buildLabelSvg, buildLabelPng, qrRects } from './labelSvg.js'

// Faz 6 kabul kriterleri (spec): "Ayar ekranı, konum yönetimi, kapsama ve
// işlem raporları."
//
// Bu dosyanın omurgası: BİR SIFIR ÜÇ FARKLI ŞEY DEMEK OLABİLİR —
// hizmet kapalıydı / etiket kapıda değildi / gerçekten kullanılmadı.
// Üçünü tek "0" altında toplamak yanlış karara götürür.

let adminToken, kullaniciId, odaKonum, digerKonum
const IP_HASH = 'a'.repeat(64)

const olayEkle = (locationId, eventType, { mode = 'anonymous', result = 'accepted', gun = null } = {}) => {
  const db = getDB()
  const qr = db.prepare("SELECT id FROM location_qr_codes WHERE location_id=? AND status='active'").get(locationId)
  db.prepare(`
    INSERT INTO location_portal_events
      (location_id, qr_code_id, event_type, actor_mode, result, ip_hash, created_at)
    VALUES(?,?,?,?,?,?, COALESCE(?, datetime('now')))
  `).run(locationId, qr?.id || null, eventType, mode, result, IP_HASH, gun)
}

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  adminToken = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token
  generateMissingQrCodes({}, null)
  kullaniciId = getDB().prepare('SELECT id FROM users LIMIT 1').get().id

  const konumlar = getDB().prepare(`
    SELECT sl.id, sl.block, sl.display_name, sl.location_type, q.token
    FROM service_locations sl JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
    WHERE sl.location_type='room' ORDER BY sl.id LIMIT 2
  `).all()
  odaKonum = konumlar[0]
  digerKonum = konumlar[1]
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM location_portal_events').run()
  db.prepare('DELETE FROM location_qr_deployments').run()
  db.prepare('DELETE FROM cleaning_task_reviews').run()
  db.prepare("DELETE FROM audit_log WHERE action='location_portal_settings_update'").run()
  updatePortalSettings({
    location_portal_enabled: true,
    location_portal_fault_enabled: true,
    location_portal_laundry_enabled: true,
    location_portal_cleaning_enabled: true,
    location_portal_survey_enabled: true,
  })
})

// ---------------------------------------------------------------------------
describe('etiket kanıtı', () => {
  // Basılmış olmak kâğıdın kapıya gittiğini göstermez; kayıt yokluğu ise
  // hiçbir şey göstermez.
  it('yalnız asıldı ve doğrulandı ulaşılabilirlik kanıtıdır', () => {
    expect(labelProvesReachable('installed')).toBe(true)
    expect(labelProvesReachable('verified')).toBe(true)
    for (const d of ['printed', 'unknown', 'stale', 'damaged', 'removed', 'qr_missing']) {
      expect(labelProvesReachable(d)).toBe(false)
    }
  })
})

describe('sessizliğin yorumu', () => {
  // FAZIN EN ÖNEMLİ TESTİ: okutulmayan konumun etiketi zaten kapıda değilse,
  // o sessizlik "kullanılmıyor" kanıtı sayılamaz.
  it('etiketi kapıda olmayan konumun sessizliğini kullanılmama saymaz', () => {
    const s = explainSilence([
      { scans: 0, deployment_state: 'unknown' },
      { scans: 0, deployment_state: 'printed' },
      { scans: 0, deployment_state: 'verified' },   // gerçekten kullanılmayan
      { scans: 5, deployment_state: 'verified' },
    ])
    expect(s.zero_scan_locations).toBe(3)
    expect(s.explained_by_label).toBe(2)
    expect(s.genuinely_unused).toBe(1)
    expect(s.note).toMatch(/gerçekten kullanılmayan 1 konum/)
  })

  it('hiçbir etiket kanıtlı değilse "kullanılmıyor" denemeyeceğini söyler', () => {
    const s = explainSilence([
      { scans: 0, deployment_state: 'unknown' },
      { scans: 0, deployment_state: 'printed' },
    ])
    expect(s.measurable).toBe(false)
    expect(s.note).toMatch(/kanıtı değildir/)
  })

  it('sessiz konum yoksa not üretmez', () => {
    expect(explainSilence([{ scans: 3, deployment_state: 'verified' }]).note).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('portal analitiği', () => {
  it('olay tiplerini ve kimlik dağılımını sayar', () => {
    olayEkle(odaKonum.id, 'scan')
    olayEkle(odaKonum.id, 'scan')
    olayEkle(odaKonum.id, 'fault', { mode: 'resident_pin' })
    olayEkle(digerKonum.id, 'survey')

    const a = getPortalAnalytics({})
    expect(a.available).toBe(true)
    expect(a.totals.scans).toBe(2)
    expect(a.totals.fault).toBe(1)
    expect(a.totals.survey).toBe(1)
    expect(a.identity.resident_pin).toBe(1)
    expect(a.identity.anonymous).toBe(3)
  })

  // Kapalı hizmetin sıfırı "kullanılmıyor" değil "kullanılamıyor" demek.
  it('kapalı hizmetin sıfırını kullanılmama saymaz', () => {
    updatePortalSettings({ location_portal_laundry_enabled: false })
    const a = getPortalAnalytics({})
    const camasir = a.services.find(s => s.key === 'laundry')
    expect(camasir.enabled).toBe(false)
    expect(camasir.events).toBe(0)
    expect(camasir.note).toMatch(/kullanılmadığı anlamına gelmez/)
  })

  it('açık hizmetin sıfırına gerekçe notu eklemez', () => {
    const a = getPortalAnalytics({})
    expect(a.services.find(s => s.key === 'fault')).toMatchObject({ enabled: true, events: 0, note: null })
  })

  // Hizmet sonradan kapatıldıysa sayı geçmişten gelir; bunu da söylemeli.
  it('kapalı hizmette geçmiş kayıt varsa bunu ayrı belirtir', () => {
    olayEkle(odaKonum.id, 'laundry_request')
    updatePortalSettings({ location_portal_laundry_enabled: false })
    const camasir = getPortalAnalytics({}).services.find(s => s.key === 'laundry')
    expect(camasir.events).toBe(1)
    expect(camasir.note).toMatch(/hizmet açıkken oluşan kayıtlardan/)
  })

  it('portal ana anahtarı kapalıysa sayıların geçmişe ait olduğunu yazar', () => {
    olayEkle(odaKonum.id, 'scan')
    updatePortalSettings({ location_portal_enabled: false })
    const a = getPortalAnalytics({})
    expect(a.portal_enabled).toBe(false)
    expect(a.portal_note).toMatch(/geçmişe aittir/)
  })

  // Hiç olay yokken "günlük ortalama" gibi türetilmiş her sayı anlamsızdır.
  it('hiç olay yoksa pencereyi ölçülemez işaretler', () => {
    const a = getPortalAnalytics({})
    expect(a.window.measurable).toBe(false)
    expect(a.window.note).toMatch(/Hiç portal olayı kaydedilmemiş/)
  })

  it('seçilen aralıkta olay yoksa ilk olay tarihini söyler', () => {
    olayEkle(odaKonum.id, 'scan', { gun: '2020-01-01 10:00:00' })
    const a = getPortalAnalytics({ from: '2026-08-01', to: '2026-08-13' })
    expect(a.window.measurable).toBe(false)
    expect(a.window.note).toMatch(/2020-01-01/)
    expect(a.window.first_event_at).toContain('2020-01-01')
  })

  it('tarih aralığı olayları süzer', () => {
    olayEkle(odaKonum.id, 'scan', { gun: '2026-08-01 09:00:00' })
    olayEkle(odaKonum.id, 'scan', { gun: '2026-08-10 09:00:00' })
    expect(getPortalAnalytics({ from: '2026-08-05' }).totals.scans).toBe(1)
    expect(getPortalAnalytics({}).totals.scans).toBe(2)
  })

  it('ayarların en son ne zaman değiştiğini bildirir ve geçmiş tutulmadığını söyler', () => {
    getDB().prepare(`
      INSERT INTO audit_log(user_id, action, module, detail, created_at)
      VALUES(?, 'location_portal_settings_update', 'location_portal', '{}', '2026-08-12 10:00:00')
    `).run(kullaniciId)
    const a = getPortalAnalytics({})
    expect(a.settings_last_changed_at).toBe('2026-08-12 10:00:00')
    expect(a.settings_history_tracked).toBe(false)
  })

  it('blok kırılımında kayıtsız etiket sayısını yazar', () => {
    const a = getPortalAnalytics({ block: odaKonum.block })
    const b = a.by_block.find(x => x.block === odaKonum.block)
    expect(b.locations).toBeGreaterThan(0)
    expect(b.coverage_note).toMatch(/etiket durumu kayıtsız/)
  })

  it('etiket asılınca sessizlik gerçekten kullanılmayana döner', () => {
    markInstalled([odaKonum.id], { userId: kullaniciId })
    const a = getPortalAnalytics({ block: odaKonum.block })
    expect(a.silence.measurable).toBe(true)
    expect(a.silence.genuinely_unused).toBeGreaterThanOrEqual(1)
  })

  it('en çok okutulan konumları sıralar', () => {
    olayEkle(digerKonum.id, 'scan')
    olayEkle(odaKonum.id, 'scan')
    olayEkle(odaKonum.id, 'scan')
    const a = getPortalAnalytics({})
    expect(a.busiest[0]).toMatchObject({ location_id: odaKonum.id, scans: 2 })
  })

  it('etiket durumu özeti çıkarır', () => {
    verifyDeployment({ token: odaKonum.token, userId: kullaniciId })
    const a = getPortalAnalytics({})
    expect(a.labels.verified).toBe(1)
    expect(a.labels.unknown).toBeGreaterThan(0)
  })

  // Boş analitik "hiç kullanılmamış" diye okunur.
  it('okunamazsa boş rapor değil gerekçe döner', () => {
    const bos = new Database(':memory:')
    const a = getPortalAnalytics({}, bos)
    expect(a.available).toBe(false)
    expect(a.reason).toMatch(/okunamadı/)
    bos.close()
  })
})

// ---------------------------------------------------------------------------
describe('tekli etiket SVG/PNG', () => {
  const konum = (over = {}) => ({
    display_name: 'M1 Oda 101', block: 'M1', room_no: '101',
    location_type: 'room', token: 't'.repeat(43), ...over,
  })

  it('gerçek boyutu milimetre olarak yazar', async () => {
    const svg = await buildLabelSvg(konum(), { baseUrl: 'https://avskamp.com' })
    expect(svg).toContain('width="100mm"')
    expect(svg).toContain('height="70mm"')
    expect(svg).toContain('viewBox="0 0 100 70"')
  })

  it('konum adını ve seriyi basar', async () => {
    const svg = await buildLabelSvg(konum(), { baseUrl: 'https://avskamp.com' })
    expect(svg).toContain('M1 Oda 101')
    expect(svg).toMatch(/RQ-M1-101-[A-Z0-9]{4}/)
  })

  // Oda adı kullanıcı verisi; kaçırılmazsa tek bir "&" SVG'yi bozar.
  it('XML özel karakterlerini kaçırır', async () => {
    const svg = await buildLabelSvg(konum({ display_name: 'A & B <test>' }), { baseUrl: 'https://x.com' })
    expect(svg).toContain('A &amp; B &lt;test&gt;')
    expect(svg).not.toContain('<test>')
  })

  it('ortak alanda çamaşır satırı yoktur ve renk farklıdır', async () => {
    const oda = await buildLabelSvg(konum(), { baseUrl: 'https://x.com' })
    const ortak = await buildLabelSvg(konum({ location_type: 'common_area', area_code: 'corridor' }), { baseUrl: 'https://x.com' })
    expect(oda).toContain('Çamaşır aldır')
    expect(ortak).not.toContain('Çamaşır aldır')
    expect(ortak).toContain('#b45309')
  })

  // Token'sız etiket, üstünde çalışmayan QR olan kâğıttır.
  it('aktif QR yoksa etiket üretmez', async () => {
    await expect(buildLabelSvg(konum({ token: null }), { baseUrl: 'https://x.com' }))
      .rejects.toThrow(/aktif QR kodu yok/)
  })

  it('QR modülleri sessiz alan bırakır ve çizilir', async () => {
    const QRCode = (await import('qrcode')).default
    const qr = QRCode.create('https://avskamp.com/r/abc', { errorCorrectionLevel: 'H' })
    const rects = qrRects(qr, 0, 0, 45)
    expect(rects.length).toBeGreaterThan(50)
    // 4 modüllük sessiz alan: hiçbir dikdörtgen sol/üst kenara yapışmaz.
    expect(Math.min(...rects.map(r => r.x))).toBeGreaterThan(0)
    expect(Math.max(...rects.map(r => r.x + r.w))).toBeLessThanOrEqual(45)
  })

  it('PNG üretir', async () => {
    const png = await buildLabelPng(konum(), { baseUrl: 'https://avskamp.com' })
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.length).toBeGreaterThan(1000)
  }, 20000)
})

// ---------------------------------------------------------------------------
describe('uçlar', () => {
  const yetkili = (m, yol) => request(app)[m](yol).set({ Authorization: `Bearer ${adminToken}` })
  const ikili = (yol) => yetkili('get', yol).buffer(true).parse((res, cb) => {
    const p = []
    res.on('data', c => p.push(c))
    res.on('end', () => cb(null, Buffer.concat(p)))
  })

  it('analitik ucu gerekçeleriyle döner', async () => {
    const res = await yetkili('get', '/api/location-portal/analytics')
    expect(res.status).toBe(200)
    expect(res.body.available).toBe(true)
    expect(res.body.services).toHaveLength(4)
    expect(res.body.silence).toBeTruthy()
  })

  it('tekli etiket PDF, SVG ve PNG verir', async () => {
    const pdf = await ikili(`/api/location-portal/locations/${odaKonum.id}/label.pdf`)
    expect(pdf.status).toBe(200)
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-')

    // supertest image/svg+xml'i metne cevirmez; ikili okuyup diziye ceviriyoruz.
    const svg = await ikili(`/api/location-portal/locations/${odaKonum.id}/label.svg`)
    expect(svg.status).toBe(200)
    expect(svg.headers['content-type']).toMatch(/image\/svg\+xml/)
    expect(svg.body.toString('utf8')).toContain('width="100mm"')

    const png = await ikili(`/api/location-portal/locations/${odaKonum.id}/label.png`)
    expect(png.status).toBe(200)
    expect(png.headers['content-type']).toBe('image/png')
    expect(png.body.subarray(1, 4).toString()).toBe('PNG')
  }, 30000)

  // Sessizce boş etiket vermek, üstünde çalışmayan QR olan kâğıt üretmektir.
  it('aktif QR olmayan konumda 409 ve gerekçe döner', async () => {
    const db = getDB()
    const hedef = db.prepare(`
      SELECT sl.id FROM service_locations sl
      JOIN location_qr_codes q ON q.location_id=sl.id AND q.status='active'
      WHERE sl.location_type='room' ORDER BY sl.id DESC LIMIT 1
    `).get()
    revokeLocationQr(hedef.id, kullaniciId)

    const res = await yetkili('get', `/api/location-portal/locations/${hedef.id}/label.svg`)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('no_active_qr')
  })

  it('olmayan konumda 404 döner', async () => {
    expect((await yetkili('get', '/api/location-portal/locations/999999/label.svg')).status).toBe(404)
  })

  it('yetkisiz erişim reddedilir', async () => {
    expect((await request(app).get('/api/location-portal/analytics')).status).toBe(401)
    expect((await request(app).get(`/api/location-portal/locations/${odaKonum.id}/label.svg`)).status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Sakin memnuniyeti toplanıyordu ama hiçbir yönetim ekranı okumuyordu:
// şikayet takip görevi açtığı için aksiyon yolu vardı, puanlar görünmüyordu.
describe('temizlik değerlendirmeleri', () => {
  const degerlendirmeEkle = ({ outcome = 'approved', rating = 5, blok = null } = {}) => {
    const db = getDB()
    const konum = db.prepare(`
      SELECT sl.id, sl.qr_location, sl.block, sl.floor FROM service_locations sl
      WHERE sl.location_type='room' ${blok ? 'AND sl.block=?' : ''} ORDER BY sl.id LIMIT 1
    `).get(...(blok ? [blok] : []))
    const gorevId = db.prepare(`
      INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location)
      VALUES('Oda', ?, ?, 'room', datetime('now'), ?)
    `).run(konum.block, konum.floor, konum.qr_location).lastInsertRowid
    db.prepare(`
      INSERT INTO cleaning_task_reviews(task_id, location_id, identity_mode, outcome, rating, comment)
      VALUES(?,?,'anonymous',?,?,?)
    `).run(gorevId, konum.id, outcome, rating, outcome === 'issue' ? 'Banyo temiz değil' : null)
    return { konum, gorevId }
  }

  // ASIL KURAL: sıfır değerlendirmeden "0,0 puan" üretmek, temizliğin kötü
  // olduğunu söylemek olurdu. Bilinen tek şey kimsenin oy vermediğidir.
  it('değerlendirme yokken ortalama üretmez', () => {
    const s = getCleaningReviewStats({})
    expect(s.total).toBe(0)
    expect(s.rating_measurable).toBe(false)
    expect(s.average_rating).toBeNull()
    expect(s.rating_note).toMatch(/ortalama hesaplanamaz/)
  })

  it('puanları ve şikayetleri sayar', () => {
    degerlendirmeEkle({ outcome: 'approved', rating: 5 })
    const s = getCleaningReviewStats({})
    expect(s.total).toBe(1)
    expect(s.rated_count).toBe(1)
    expect(s.rating_measurable).toBe(true)
    expect(s.average_rating).toBe(5)
    expect(s.issues).toBe(0)
  })

  it('puansız değerlendirme ortalamaya katılmaz', () => {
    degerlendirmeEkle({ outcome: 'approved', rating: null })
    const s = getCleaningReviewStats({})
    expect(s.total).toBe(1)
    expect(s.rated_count).toBe(0)
    expect(s.rating_measurable).toBe(false)
    expect(s.average_rating).toBeNull()
  })

  it('blok kırılımı verir', () => {
    const { konum } = degerlendirmeEkle({ outcome: 'issue', rating: 2 })
    const s = getCleaningReviewStats({})
    const b = s.by_block.find(x => x.block === konum.block)
    expect(b).toMatchObject({ total: 1, issues: 1, average_rating: 2 })
  })

  it('analitik yanıtına bağlanır', () => {
    degerlendirmeEkle({ outcome: 'approved', rating: 4 })
    const a = getPortalAnalytics({})
    expect(a.cleaning_reviews).toMatchObject({ total: 1, average_rating: 4, rating_measurable: true })
  })
})
