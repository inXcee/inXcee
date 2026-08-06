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

// İzin ve mesai de iki proje ayrımına tabi: "FPU'nun bu ayki mesaisi ne" sorusu
// puantaj kadar sık soruluyor.
describe('İzin ve mesai proje filtresi', () => {
  const AY = '2026-09'

  it('hazırlık: iki projeye izin ve mesai kaydı', async () => {
    const db = getDB()
    const izin = db.prepare(
      "INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, status, total_days) VALUES(?,'annual',?,?,'approved',3)",
    )
    izin.run(fpuStaff, `${AY}-10`, `${AY}-12`)
    izin.run(kampStaff, `${AY}-10`, `${AY}-12`)
    const mesai = db.prepare('INSERT INTO overtime_records(staff_id, work_date, hours) VALUES(?,?,?)')
    mesai.run(fpuStaff, `${AY}-15`, 3)
    mesai.run(kampStaff, `${AY}-15`, 5)
    expect(db.prepare('SELECT COUNT(*) n FROM overtime_records').get().n).toBeGreaterThan(0)
  })

  it('izin listesi projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/leave?project_id=${fpuId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = res.body.map(r => r.staff_id)
    expect(idler).toContain(fpuStaff)
    expect(idler).not.toContain(kampStaff)
  })

  it('mesai listesi projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/overtime?month=${AY}&project_id=${kampId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = res.body.map(r => r.staff_id)
    expect(idler).toContain(kampStaff)
    expect(idler).not.toContain(fpuStaff)
  })

  it('kayıtlar proje adını taşır', async () => {
    const res = await request(app).get(`/api/shifts/overtime?month=${AY}`).set(auth())
    const kayit = res.body.find(r => r.staff_id === fpuStaff)
    expect(kayit.project_name).toBe('FPU')
  })

  it('kadrosu belirsiz süzmesi çalışır', async () => {
    const res = await request(app).get('/api/shifts/leave?project_id=none').set(auth())
    expect(res.body.map(r => r.staff_id)).not.toContain(fpuStaff)
  })
})

// Mesai SEKMESİ /overtime/requests ucunu okuyor, /overtime'ı değil. Filtre
// yalnız birine eklenirse ekranda seçici çalışıyor görünür ama aynı satırlar
// döner — "sessizce yok sayılan filtre", en yanıltıcı hâli.
describe('Mesai TALEPLERİ proje filtresi', () => {
  const AY = '2026-09'

  it('hazırlık: iki projeye mesai talebi', async () => {
    const db = getDB()
    const t = db.prepare(
      "INSERT INTO overtime_requests(staff_id, work_date, requested_hours, reason, compensation_type, status) VALUES(?,?,?,'Yogunluk','pay','pending')",
    )
    t.run(fpuStaff, `${AY}-20`, 3)
    t.run(kampStaff, `${AY}-20`, 4)
    expect(db.prepare('SELECT COUNT(*) n FROM overtime_requests').get().n).toBeGreaterThanOrEqual(2)
  })

  it('talep listesi projeye göre süzülür', async () => {
    const res = await request(app).get(`/api/shifts/overtime/requests?month=${AY}&project_id=${fpuId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = res.body.map(r => r.staff_id)
    expect(idler).toContain(fpuStaff)
    expect(idler).not.toContain(kampStaff)
  })

  it('talep kaydı proje adını taşır', async () => {
    const res = await request(app).get(`/api/shifts/overtime/requests?month=${AY}`).set(auth())
    expect(res.body.find(r => r.staff_id === kampStaff).project_name).toBe('Kamp Alanı')
  })
})

// Puantaj ekranı devamsızlık istisnalarına da project_id gönderiyor; uç
// desteklemezse proje seçilince istisna sayısı değişmez ve o proje temiz sanılır.
describe('Devamsızlık istisnaları proje filtresi', () => {
  const GUN = '2026-09-22'

  it('hazırlık: iki projeye açık istisna', async () => {
    const db = getDB()
    const t = db.prepare(
      "INSERT INTO attendance_exceptions(staff_id, work_date, exception_type, severity, status, message) VALUES(?,?,'missing_scan','warning','open','Okutma yok')",
    )
    t.run(fpuStaff, GUN)
    t.run(kampStaff, GUN)
    expect(db.prepare('SELECT COUNT(*) n FROM attendance_exceptions').get().n).toBeGreaterThanOrEqual(2)
  })

  it('istisna listesi projeye göre süzülür', async () => {
    const res = await request(app)
      .get(`/api/shifts/attendance/exceptions?from=${GUN}&to=${GUN}&project_id=${kampId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = res.body.rows.map(r => r.staff_id)
    expect(idler).toContain(kampStaff)
    expect(idler).not.toContain(fpuStaff)
  })
})

// İmzalık föy kapanış ekini de bu uçtan alıyor ve project_id gönderiyor.
// Uç yok sayarsa FPU föyünün ekinde Kamp personelinin bordrosu çıkar.
describe('Kapanış paketi proje filtresi', () => {
  const AY = '2026-09'

  it('bordro satırları projeye göre süzülür', async () => {
    const res = await request(app)
      .get(`/api/shifts/puantaj/closing-package?month=${AY}&project_id=${fpuId}`).set(auth())
    expect(res.status).toBe(200)
    const idler = (res.body.accounting || []).map(r => r.staff_id)
    expect(idler).toContain(fpuStaff)
    expect(idler).not.toContain(kampStaff)
  })
})

// Şef / şef yardımcısı / müdür gibi unvanlar çizelgede ilk bakışta ayrılsın
// diye her rol kendi rengini taşır ve renk değiştirilebilir olmalı.
describe('Rol renkleri', () => {
  it('rol listesi renk döner', async () => {
    const res = await request(app).get('/api/shifts/roles').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    res.body.forEach(rol => expect(rol.color_class).toBeTruthy())
  })

  it('rol rengi güncellenebilir', async () => {
    const rolId = (await request(app).get('/api/shifts/roles').set(auth())).body[0].id
    const res = await request(app).put(`/api/shifts/roles/${rolId}`)
      .set(auth()).send({ color_class: 'bg-rose-500' })
    expect(res.status).toBe(200)
    expect(getDB().prepare('SELECT color_class FROM staff_roles WHERE id=?').get(rolId).color_class)
      .toBe('bg-rose-500')
  })

  it('yeni rol renkle birlikte açılabilir', async () => {
    const res = await request(app).post('/api/shifts/roles')
      .set(auth()).send({ name: 'Şef Yardımcısı', color_class: 'bg-purple-500', sort_order: 5 })
    expect([200, 201]).toContain(res.status)
    const kayit = getDB().prepare("SELECT * FROM staff_roles WHERE name='Şef Yardımcısı'").get()
    expect(kayit.color_class).toBe('bg-purple-500')
  })

  it('çizelge satırları da rol rengini taşır', async () => {
    const db = getDB()
    const rol = db.prepare("SELECT id FROM staff_roles WHERE name='Şef Yardımcısı'").get()
    db.prepare('UPDATE staff SET role_id=? WHERE id=?').run(rol.id, kampStaff)
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}`).set(auth())
    const satir = res.body.find(r => r.staff_id === kampStaff)
    expect(satir.role_color).toBe('bg-purple-500')
  })

  it('personel listesi rolün rengini taşır', async () => {
    const db = getDB()
    const rol = db.prepare("SELECT id FROM staff_roles WHERE name='Şef Yardımcısı'").get()
    db.prepare('UPDATE staff SET role_id=? WHERE id=?').run(rol.id, fpuStaff)
    const res = await request(app).get(`/api/shifts/staff/${fpuStaff}`).set(auth())
    expect(res.body.role_color).toBe('bg-purple-500')
  })
})

// Çizelgede isimlerin yeri sürüklenerek değiştirilebilmeli. Sıra ORTAK olmalı:
// çizelge imzaya/yazıcıya gidiyor, herkeste farklı sırada görünürse anlamsızlaşır.
describe('Çizelge isim sırası', () => {
  let temelSira

  it('hazırlık: mevcut sırayı al', async () => {
    const res = await request(app).get('/api/shifts/staff?is_active=1').set(auth())
    temelSira = res.body.map(r => r.id)
    expect(temelSira.length).toBeGreaterThan(2)
  })

  it('sıra kaydedilir ve sıralananlar en üste geçer', async () => {
    const res = await request(app).post('/api/shifts/staff/order')
      .set(auth()).send({ order: [kampStaff, fpuStaff] })
    expect(res.status).toBe(200)
    const idler = (await request(app).get('/api/shifts/staff?is_active=1').set(auth())).body.map(r => r.id)
    expect(idler[0]).toBe(kampStaff)
    expect(idler[1]).toBe(fpuStaff)
  })

  // Sürüklenmeyenlerin sırası bozulmamalı; yoksa bir kişiyi taşımak tüm
  // listeyi karıştırmış gibi görünür.
  it('sıralanmayanlar kendi aralarındaki sırayı korur', async () => {
    const idler = (await request(app).get('/api/shifts/staff?is_active=1').set(auth())).body.map(r => r.id)
    const kalan = idler.slice(2)
    const beklenen = temelSira.filter(id => id !== kampStaff && id !== fpuStaff)
    expect(kalan).toEqual(beklenen)
  })

  // Ekran, çizelge satırlarındaki alandan sıralıyor; SELECT'te yoksa çizelgede
  // olan herkes "sırasız" görünüp en alta düşerdi.
  it('çizelge satırı schedule_order alanını taşır', async () => {
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}`).set(auth())
    const satir = res.body.find(r => r.staff_id === kampStaff)
    expect(satir.schedule_order).toBe(1)
  })

  it('sıra çizelgeye de yansır', async () => {
    const res = await request(app).get(`/api/shifts/schedule?week=${HAFTA}`).set(auth())
    const idler = res.body.map(r => r.staff_id)
    expect(idler.indexOf(kampStaff)).toBeLessThan(idler.indexOf(fpuStaff))
  })

  it('geçersiz gövde 400 döner', async () => {
    expect((await request(app).post('/api/shifts/staff/order').set(auth()).send({})).status).toBe(400)
  })
})
