import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'

let token, fpuId, kampId, fpuStaff, kampStaff, kadrosuzStaff, kampLokasyon, fpuLokasyon
const HAFTA = '2026-09-07'

beforeAll(async () => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  token = (await request(app).post('/api/auth/login')
    .send({ username: 'mudur', password: 'admin123' })).body.token

  const db = getDB()
  const projeler = (await request(app).get('/api/projects').set({ Authorization: `Bearer ${token}` })).body
  fpuId = projeler.find(p => p.code === 'FPU').id
  kampId = projeler.find(p => p.code === 'KAMP').id

  const ekle = (ad, pid) => Number(db.prepare(
    'INSERT INTO staff(full_name, is_active, project_id) VALUES(?,1,?)'
  ).run(ad, pid).lastInsertRowid)
  fpuStaff = ekle('PROJE FPU PERSONELI', fpuId)
  kampStaff = ekle('PROJE KAMP PERSONELI', kampId)
  kadrosuzStaff = ekle('PROJE KADROSUZ PERSONEL', null)

  const lok = (ad, pid) => Number(db.prepare(
    'INSERT INTO work_locations(name, project_id) VALUES(?,?)'
  ).run(ad, pid).lastInsertRowid)
  fpuLokasyon = lok('FPU Sahası', fpuId)
  kampLokasyon = lok('Kamp Sahası', kampId)

  // FPU kadrosundaki kişi KAMP sahasında çalışıyor → çapraz durum.
  db.prepare(`INSERT INTO shift_schedule(staff_id, work_date, status, work_location_id)
              VALUES(?,?,'worked',?)`).run(fpuStaff, HAFTA, kampLokasyon)
  // Kamp kadrosundaki kişi kendi sahasında → çapraz değil.
  db.prepare(`INSERT INTO shift_schedule(staff_id, work_date, status, work_location_id)
              VALUES(?,?,'worked',?)`).run(kampStaff, HAFTA, kampLokasyon)
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('Personel listesi proje filtresi', () => {
  it('proje bilgisi listede gelir', async () => {
    const res = await request(app).get('/api/shifts/staff').set(auth())
    const kisi = res.body.find(s => s.id === fpuStaff)
    expect(kisi.project_id).toBe(fpuId)
    expect(kisi.project_name).toBe('FPU')
  })

  it('project_id ile yalnız o kadro gelir', async () => {
    const res = await request(app).get(`/api/shifts/staff?project_id=${kampId}`).set(auth())
    const idler = res.body.map(s => s.id)
    expect(idler).toContain(kampStaff)
    expect(idler).not.toContain(fpuStaff)
    expect(idler).not.toContain(kadrosuzStaff)
  })

  it('project_id=none kadrosu olmayanları verir', async () => {
    const res = await request(app).get('/api/shifts/staff?project_id=none').set(auth())
    const idler = res.body.map(s => s.id)
    expect(idler).toContain(kadrosuzStaff)
    expect(idler).not.toContain(fpuStaff)
  })

  it('filtre verilmezse herkes gelir (geriye uyum)', async () => {
    const res = await request(app).get('/api/shifts/staff').set(auth())
    const idler = res.body.map(s => s.id)
    expect(idler).toEqual(expect.arrayContaining([fpuStaff, kampStaff, kadrosuzStaff]))
  })
})

describe('Çizelge proje filtresi', () => {
  it('çizelge satırlarında proje bilgisi bulunur', async () => {
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}`).set(auth())
    const satir = res.body.find(r => r.staff_id === fpuStaff)
    expect(satir.project_id).toBe(fpuId)
  })

  it('çizelge projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}&project_id=${kampId}`).set(auth())
    const idler = res.body.map(r => r.staff_id)
    expect(idler).toContain(kampStaff)
    expect(idler).not.toContain(fpuStaff)
  })
})

describe('Çapraz çalışma — kadrosu bir projede, fiilen başka projede', () => {
  it('FPU kadrosunda olup Kamp sahasında çalışanı bulur', async () => {
    const res = await request(app).get(`/api/shifts/project-mismatch?from=${HAFTA}&to=${HAFTA}`).set(auth())
    expect(res.status).toBe(200)
    const kayit = res.body.rows.find(r => r.staff_id === fpuStaff)
    expect(kayit).toBeTruthy()
    expect(kayit.roster_project_name).toBe('FPU')
    expect(kayit.worked_project_name).toBe('Kamp Alanı')
    expect(kayit.work_date).toBe(HAFTA)
  })

  it('kendi sahasında çalışanı listelemez', async () => {
    const res = await request(app).get(`/api/shifts/project-mismatch?from=${HAFTA}&to=${HAFTA}`).set(auth())
    expect(res.body.rows.some(r => r.staff_id === kampStaff)).toBe(false)
  })

  it('tarih aralığı zorunlu', async () => {
    expect((await request(app).get('/api/shifts/project-mismatch').set(auth())).status).toBe(400)
  })
})

// Kullanıcı kadroyu personel kartından da yönetebilmeli; kadro değişikliği için
// ayrı bir ekrana gitmek zorunda kalmasın.
describe('Personel kartından kadro değiştirme', () => {
  it('project_id personel güncellemesiyle yazılır', async () => {
    const res = await request(app).put(`/api/shifts/staff/${kadrosuzStaff}`)
      .set(auth()).send({ project_id: kampId })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT project_id FROM staff WHERE id=?')
      .get(kadrosuzStaff).project_id).toBe(kampId)
  })

  it('boş değer kadrodan çıkarır', async () => {
    await request(app).put(`/api/shifts/staff/${kadrosuzStaff}`)
      .set(auth()).send({ project_id: '' })
    expect(getDB().prepare('SELECT project_id FROM staff WHERE id=?')
      .get(kadrosuzStaff).project_id).toBeNull()
  })

  it('personel listesi kadroyu ve proje adını döner', async () => {
    const res = await request(app).get(`/api/shifts/staff?project_id=${fpuId}`).set(auth())
    const kayit = res.body.find(r => r.id === fpuStaff)
    expect(kayit.project_id).toBe(fpuId)
    expect(kayit.project_name).toBe('FPU')
  })
})

// Rozet project_name'e bakıyor; join olmazsa kadrolu biri "KADROSUZ" görünür —
// eksik bilgiden daha kötüsü, YANLIŞ bilgi.
describe('Personel dosyası kadroyu döner', () => {
  it('tek personel ucu proje adını içerir', async () => {
    const res = await request(app).get(`/api/shifts/staff/${fpuStaff}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.project_name).toBe('FPU')
  })

  it('360 dosyası proje adını içerir', async () => {
    const res = await request(app).get(`/api/personnel/${kampStaff}/360`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.person.project_name).toBe('Kamp Alanı')
  })

  // Dosya BAŞLIĞINDAKİ rozet bu ucu okuyor — tarayıcıda yakalandı.
  it('dosya ucu proje adını içerir', async () => {
    const res = await request(app).get(`/api/personnel/${fpuStaff}/dossier`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.person.project_name).toBe('FPU')
  })

  it('kadrosu olmayanda proje adı boş kalır', async () => {
    const res = await request(app).get(`/api/shifts/staff/${kadrosuzStaff}`).set(auth())
    expect(res.body.project_name ?? null).toBeNull()
  })
})

// Puantaj proje filtresi. Onay AKIŞINA dokunulmuyor: puantaj_period_approvals
// dept_scope ile saklanıyor, oraya proje karıştırmak mevcut onay kayıtlarını
// bozar. Filtre yalnız VERİ görünümlerine uygulanır.
describe('Puantaj proje filtresi', () => {
  const AY = '2026-09'

  it('puantaj satırları projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj?month=${AY}&project_id=${fpuId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = (res.body.rows || res.body).map(r => r.id)
    expect(idler).toContain(fpuStaff)
    expect(idler).not.toContain(kampStaff)
  })

  it('puantaj satırı proje adını taşır', async () => {
    const res = await request(app).get(`/api/shifts/puantaj?month=${AY}`).set(auth())
    const kayit = (res.body.rows || res.body).find(r => r.id === kampStaff)
    expect(kayit.project_name).toBe('Kamp Alanı')
    expect(kayit.project_id).toBe(kampId)
  })

  it('kadrosu belirsiz olanlar ayrıca süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj?month=${AY}&project_id=none`).set(auth())
    const idler = (res.body.rows || res.body).map(r => r.id)
    expect(idler).toContain(kadrosuzStaff)
    expect(idler).not.toContain(fpuStaff)
  })

  it('takvim (gün) verisi de projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj/days?month=${AY}&project_id=${kampId}`).set(auth())
    expect(res.status).toBe(200)
    const anahtarlar = Object.keys(res.body.days).map(Number)
    expect(anahtarlar).toContain(kampStaff)
    expect(anahtarlar).not.toContain(fpuStaff)
  })

  it('CSV dışa aktarımı projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj/export/csv?month=${AY}&project_id=${fpuId}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.text).toContain('PROJE FPU PERSONELI')
    expect(res.text).not.toContain('PROJE KAMP PERSONELI')
  })

  it('geçersiz proje id süzmeyi sessizce atlamaz', async () => {
    const res = await request(app).get(`/api/shifts/puantaj?month=${AY}&project_id=999999`).set(auth())
    expect(res.status).toBe(200)
    expect((res.body.rows || res.body).length).toBe(0)
  })
})

// Çapraz çalışma görünümü (kadrosu bir projede, fiilen başkasında) ancak
// çalışma noktaları projelere bağlıysa dolu gelir. Site'dan türetilemiyor
// (canlıda FPU diye bir site yok), o yüzden ekrandan bağlanabilmeli.
describe('Çalışma noktası — proje eşlemesi', () => {
  it('nokta listesi proje bilgisini döner', async () => {
    const res = await request(app).get('/api/shifts/work-locations').set(auth())
    expect(res.status).toBe(200)
    const kayit = res.body.find(r => r.id === kampLokasyon)
    expect(kayit.project_id).toBe(kampId)
    expect(kayit.project_name).toBe('Kamp Alanı')
  })

  it('noktanın projesi güncellenebilir', async () => {
    const res = await request(app).put(`/api/shifts/work-locations/${fpuLokasyon}`)
      .set(auth()).send({ project_id: fpuId })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT project_id FROM work_locations WHERE id=?')
      .get(fpuLokasyon).project_id).toBe(fpuId)
  })

  it('boş değer noktayı projesiz bırakır', async () => {
    await request(app).put(`/api/shifts/work-locations/${fpuLokasyon}`)
      .set(auth()).send({ project_id: '' })
    expect(getDB().prepare('SELECT project_id FROM work_locations WHERE id=?')
      .get(fpuLokasyon).project_id).toBeNull()
    // testin geri kalanı icin geri yaz
    await request(app).put(`/api/shifts/work-locations/${fpuLokasyon}`)
      .set(auth()).send({ project_id: fpuId })
  })
})

// SQLite'ta CASE/COALESCE ifadelerinin affinity'si YOKTUR: sütun tamsayı,
// HTTP'den gelen dept_id ise metin ('4'). Düz sütun karşılaştırmasında SQLite
// metni sayıya çevirir, ifadede çevirmez -> filtre sessizce HİÇ eşleşmez.
describe('Departman filtresi metin parametreyle çalışır', () => {
  const AY = '2026-09'
  let deptId

  it('hazırlık: personele departman ata', async () => {
    const db = getDB()
    deptId = db.prepare('SELECT id FROM departments ORDER BY id LIMIT 1').get().id
    db.prepare('UPDATE staff SET department_id=? WHERE id IN (?,?)').run(deptId, fpuStaff, kampStaff)
    expect(deptId).toBeTruthy()
  })

  it('puantaj departmana göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj?month=${AY}&dept_id=${deptId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = (res.body.rows || res.body).map(r => r.id)
    expect(idler).toContain(fpuStaff)
  })

  it('puantaj takvimi departmana göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/puantaj/days?month=${AY}&dept_id=${deptId}`).set(auth())
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.days).length).toBeGreaterThan(0)
  })

  it('vardiya çizelgesi departmana göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}&dept_id=${deptId}`).set(auth())
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('departman ve proje filtresi birlikte çalışır', async () => {
    const res = await request(app)
      .get(`/api/shifts/puantaj?month=${AY}&dept_id=${deptId}&project_id=${fpuId}`).set(auth())
    const idler = (res.body.rows || res.body).map(r => r.id)
    expect(idler).toContain(fpuStaff)
    expect(idler).not.toContain(kampStaff)
  })
})

// Çapraz çalışma listesi boş dönebilir çünkü (a) gerçekten çapraz çalışan yok,
// ya da (b) çalışma noktaları henüz projeye bağlanmadı. İkisi ekranda AYNI
// görünürse kullanıcı "çapraz çalışan yok" sanır — yanlış cevap. Uç, kurulum
// durumunu da dönmeli.
describe('Çapraz çalışma — kurulum durumu', () => {
  it('eşlenmemiş çalışma noktalarını bildirir', async () => {
    const db = getDB()
    db.prepare("INSERT INTO work_locations(name, project_id, is_active) VALUES('EŞLENMEMİŞ NOKTA', NULL, 1)").run()
    const res = await request(app).get(`/api/shifts/project-mismatch?from=${HAFTA}&to=${HAFTA}`).set(auth())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.rows)).toBe(true)
    expect(res.body.setup.unmapped_locations).toBeGreaterThan(0)
    expect(res.body.setup.unmapped_names).toContain('EŞLENMEMİŞ NOKTA')
  })

  it('çapraz çalışan satırları rows içinde kalır', async () => {
    const res = await request(app).get(`/api/shifts/project-mismatch?from=${HAFTA}&to=${HAFTA}`).set(auth())
    const kayit = res.body.rows.find(r => r.staff_id === fpuStaff)
    expect(kayit.roster_project_name).toBe('FPU')
    expect(kayit.worked_project_name).toBe('Kamp Alanı')
  })

  it('tüm noktalar eşlendiğinde uyarı sıfırlanır', async () => {
    const db = getDB()
    const kamp = db.prepare("SELECT id FROM projects WHERE code='KAMP'").get().id
    db.prepare('UPDATE work_locations SET project_id=? WHERE project_id IS NULL').run(kamp)
    const res = await request(app).get(`/api/shifts/project-mismatch?from=${HAFTA}&to=${HAFTA}`).set(auth())
    expect(res.body.setup.unmapped_locations).toBe(0)
  })
})
