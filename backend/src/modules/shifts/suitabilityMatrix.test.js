import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildSuitabilityMatrix, addStaffConstraint, listStaffConstraints, deleteStaffConstraint } from './suitabilityMatrix.js'
import { evaluateSuitability } from './suitability.js'

// Faz 11: planlayıcının sorusu "bu adayı seçebilir miyim" değil, "bu vardiyaya
// KİMLERİ koyabilirim". Engelli kişi listeden ÇIKARILMAZ — neden çıkarıldığı
// görünmezse amir aramaya devam eder.

const GUN = '2026-05-13'   // Çarşamba
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, role_id INTEGER, department_id INTEGER,
      project_id INTEGER, exit_date TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT, start_hour TEXT, end_hour TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE staff_document_requirements (id INTEGER PRIMARY KEY AUTOINCREMENT, document_kind TEXT,
      display_name TEXT, department_id INTEGER, role_id INTEGER, requires_expiry INTEGER, is_active INTEGER);
    CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, document_kind TEXT,
      expires_on TEXT, archived_at TEXT);
    CREATE TABLE staff_work_constraints (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      constraint_type TEXT, ref_id INTEGER, note TEXT, valid_from TEXT, valid_to TEXT,
      created_by INTEGER, created_at TEXT);
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik'), (2, 'Teknik');
    INSERT INTO staff_roles(id, name) VALUES (1, 'Meydancı');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal'), (2, 'Yemekhane');
    INSERT INTO shift_definitions(id, name, start_hour, end_hour) VALUES (1, 'Gündüz', '08', '16'), (2, 'Gece', '22', '06');
    INSERT INTO staff(id, full_name, role_id, department_id) VALUES
      (10, 'Ali Veli', 1, 1), (11, 'Ayşe Can', 1, 1), (12, 'Veli Ak', 1, 2);
  `)
  return d
}

beforeEach(() => { db = kur() })

const matris = (over = {}) => buildSuitabilityMatrix({ date: GUN, shift_def_id: 1, ...over }, db)
const kisi = (m, id) => m.items.find(i => i.staff_id === id)
const kontrol = (r, key) => r.checks.find(c => c.key === key)

describe('matris', () => {
  it('tüm aktif kadroyu değerlendirir', () => {
    const m = matris()
    expect(m.summary).toMatchObject({ total: 3, eligible: 3, blocked: 0 })
  })

  it('pasif personeli listeye almaz', () => {
    db.prepare('UPDATE staff SET is_active = 0 WHERE id = 12').run()
    expect(matris().summary.total).toBe(2)
  })

  it('departmana göre filtreler', () => {
    expect(matris({ dept_id: 2 }).summary.total).toBe(1)
  })

  // Engelli kişi listeden çıkarılmaz; neden engelli olduğu görünür.
  it('engelli kişiyi listede tutar ve gerekçesini verir', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    const m = matris()
    expect(m.summary).toMatchObject({ blocked: 1, eligible: 2 })
    expect(kisi(m, 10).blockers).toContain('on_leave')
  })

  it('istenirse yalnız uygunları döner ama özet tamı sayar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    const m = matris({ only_eligible: true })
    expect(m.items).toHaveLength(2)
    expect(m.summary.total).toBe(3)
  })

  it('uygunu üste, engelliyi alta sıralar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    expect(matris().items[matris().items.length - 1].staff_id).toBe(10)
  })

  it('bozuk tarihi reddeder', () => {
    expect(() => buildSuitabilityMatrix({ date: '13.05.2026' }, db)).toThrow(/Geçersiz tarih/)
  })

  // Ölçülemeyen kontrolü olan kişi "uygun" listesine güvenle konamaz.
  it('tam doğrulanmayanları ayrı sayar', () => {
    db.prepare("INSERT INTO shift_definitions(id,name,start_hour,end_hour) VALUES(3,'Saatsiz',NULL,NULL)").run()
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(10,'2026-05-11',3,'scheduled')").run()
    expect(matris().summary.not_fully_verified).toBeGreaterThan(0)
  })
})

describe('çalışma kısıtları', () => {
  const kisit = (over) => addStaffConstraint({ staff_id: 10, ...over }, db, 1)

  it('sağlık kısıtını uyarı olarak gösterir', () => {
    kisit({ constraint_type: 'health', note: 'Gece çalışamaz raporu' })
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, db)
    expect(kontrol(r, 'health').status).toBe('warn')
    expect(kontrol(r, 'health').detail).toMatch(/Gece çalışamaz/)
  })

  it('vardiya engelini engel sayar', () => {
    kisit({ constraint_type: 'shift_block', ref_id: 2, note: 'Gece vardiyası yasak' })
    const gece = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 2 }, db)
    expect(gece.blockers).toContain('shift_constraint')
    const gunduz = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, db)
    expect(gunduz.blockers).not.toContain('shift_constraint')
  })

  it('tercih edilen vardiyayı engel saymaz', () => {
    kisit({ constraint_type: 'shift_prefer', ref_id: 2 })
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 2 }, db)
    expect(kontrol(r, 'shift_constraint').detail).toMatch(/Tercih/)
    expect(r.eligible).toBe(true)
  })

  it('yasaklı lokasyonda engeller', () => {
    kisit({ constraint_type: 'location_block', ref_id: 2, note: 'Yemekhanede çalışamaz' })
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1, work_location_id: 2 }, db)
    expect(r.blockers).toContain('location_constraint')
  })

  it('yalnız-izinli lokasyon dışında engeller', () => {
    kisit({ constraint_type: 'location_allow', ref_id: 1 })
    expect(evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1, work_location_id: 1 }, db).blockers)
      .not.toContain('location_constraint')
    expect(evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1, work_location_id: 2 }, db).blockers)
      .toContain('location_constraint')
  })

  // Kısıt varken lokasyon belirtilmemişse "kısıt yok" denmemeli.
  it('lokasyon belirtilmemişse kısıtı ölçemediğini söyler', () => {
    kisit({ constraint_type: 'location_block', ref_id: 2 })
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, db)
    expect(kontrol(r, 'location_constraint').status).toBe('unknown')
    expect(r.fully_verified).toBe(false)
  })

  // Süresi geçmiş rapor kendiliğinden düşmeli; elle silinmeyi beklememeli.
  it('geçerlilik tarihi geçmiş kısıtı uygulamaz', () => {
    kisit({ constraint_type: 'shift_block', ref_id: 1, valid_from: '2026-01-01', valid_to: '2026-02-01' })
    expect(evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, db).blockers)
      .not.toContain('shift_constraint')
  })

  it('geçerlilik aralığı içindeki kısıtı uygular', () => {
    kisit({ constraint_type: 'shift_block', ref_id: 1, valid_from: '2026-05-01', valid_to: '2026-06-01' })
    expect(evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, db).blockers)
      .toContain('shift_constraint')
  })

  it('kısıtı listeler, siler', () => {
    const k = kisit({ constraint_type: 'location_block', ref_id: 1 })
    expect(listStaffConstraints(10, db)).toHaveLength(1)
    expect(listStaffConstraints(10, db)[0].location_name).toBe('OTC Lokal')
    deleteStaffConstraint(k.id, db)
    expect(listStaffConstraints(10, db)).toHaveLength(0)
    expect(() => deleteStaffConstraint(k.id, db)).toThrow(/bulunamadı/)
  })

  it('geçersiz kısıt girdisini reddeder', () => {
    expect(() => kisit({ constraint_type: 'baska' })).toThrow(/Geçersiz kısıt türü/)
    expect(() => kisit({ constraint_type: 'location_block' })).toThrow(/lokasyon\/vardiya seçilmelidir/)
    expect(() => kisit({ constraint_type: 'health', valid_from: '01.05.2026' })).toThrow(/Geçersiz tarih/)
    expect(() => kisit({ constraint_type: 'health', valid_from: '2026-06-01', valid_to: '2026-05-01' })).toThrow(/önce olamaz/)
    expect(() => addStaffConstraint({ staff_id: 0, constraint_type: 'health' }, db)).toThrow(/Geçersiz personel/)
  })

  // Kısıt tablosu yoksa "kısıt yok" değil "okunamadı" denmeli.
  it('kısıt tablosu yoksa ölçemediğini söyler', () => {
    const bos = new Database(':memory:')
    bos.exec(`CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, role_id INTEGER,
      department_id INTEGER, exit_date TEXT, is_active INTEGER);
      INSERT INTO staff VALUES (10, 'Ali Veli', 1, 1, NULL, 1);`)
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, bos)
    expect(r.unknown).toContain('constraints')
    bos.close()
  })
})
