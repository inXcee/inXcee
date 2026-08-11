import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { evaluateSuitability, saatSayisi, vardiyaSuresi, haftaBasi, gunEkle } from './suitability.js'

// Faz 10/11: "bu kişi bu vardiyaya atanabilir mi" sorusu amirin aklındaydı.
// Ölçülemeyen kontrol 'ok' SAYILMAZ — ölçemediğini uygun saymak, kontrolü hiç
// yapmamaktan kötüdür, çünkü yapılmış gibi görünür.

const GUN = '2026-05-13'      // Çarşamba
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, role_id INTEGER, department_id INTEGER,
      exit_date TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT, start_hour TEXT, end_hour TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE staff_document_requirements (id INTEGER PRIMARY KEY AUTOINCREMENT, document_kind TEXT,
      display_name TEXT, department_id INTEGER, role_id INTEGER, requires_expiry INTEGER, is_active INTEGER);
    CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, document_kind TEXT,
      expires_on TEXT, archived_at TEXT);
    INSERT INTO staff_roles(id, name) VALUES (1, 'Meydancı'), (2, 'Teknisyen');
    INSERT INTO staff(id, full_name, role_id, department_id) VALUES (10, 'Ali Veli', 1, 1);
    INSERT INTO shift_definitions(id, name, start_hour, end_hour)
      VALUES (1, 'Gündüz', '08', '16'), (2, 'Gece', '22', '06'), (3, 'Saatsiz', NULL, NULL);
  `)
  return d
}

beforeEach(() => { db = kur() })

const bak = (over = {}) => evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1, ...over }, db)
const kontrol = (r, key) => r.checks.find(c => c.key === key)
const planla = (gun, shiftId = 1) => db.prepare(
  "INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, status) VALUES(10, ?, ?, 'scheduled')"
).run(gun, shiftId)

describe('saat matematiği', () => {
  it('saat metnini sayıya çevirir', () => {
    expect(saatSayisi('08')).toBe(8)
    expect(saatSayisi('08:30')).toBe(8.5)
    expect(saatSayisi('')).toBeNull()
    expect(saatSayisi('akşam')).toBeNull()
    expect(saatSayisi('25')).toBeNull()
  })

  it('gece vardiyasının ertesi güne taşmasını hesaplar', () => {
    expect(vardiyaSuresi('08', '16')).toBe(8)
    expect(vardiyaSuresi('22', '06')).toBe(8)
    expect(vardiyaSuresi('22', null)).toBeNull()
  })

  it('haftayı Pazartesiden başlatır', () => {
    expect(haftaBasi('2026-05-13')).toBe('2026-05-11')   // Çarşamba → Pazartesi
    expect(haftaBasi('2026-05-17')).toBe('2026-05-11')   // Pazar → aynı hafta
    expect(gunEkle('2026-05-31', 1)).toBe('2026-06-01')
  })
})

describe('engeller', () => {
  it('o gün zaten çalışan kişiyi engeller', () => {
    planla(GUN)
    const r = bak()
    expect(r.eligible).toBe(false)
    expect(r.blockers).toContain('already_working')
  })

  it('onaylı izinliyi engeller, onaysızı engellemez', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    expect(bak().blockers).toContain('on_leave')

    db.exec('DELETE FROM leave_requests')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'pending')").run(GUN, GUN)
    expect(bak().blockers).not.toContain('on_leave')
  })

  it('işten çıkmış personeli engeller', () => {
    db.prepare("UPDATE staff SET exit_date='2026-05-01' WHERE id=10").run()
    expect(bak().blockers).toContain('exited')
  })

  // Çıkış tarihi vardiyadan SONRAYSA o gün hâlâ çalışandır.
  it('çıkış tarihi sonraysa engellemez', () => {
    db.prepare("UPDATE staff SET exit_date='2026-06-01' WHERE id=10").run()
    expect(bak().blockers).not.toContain('exited')
  })
})

describe('dinlenme süresi', () => {
  // Dün 22-06 gece vardiyası, bugün 08 başlangıç → 2 saat dinlenme.
  it('gece vardiyası sonrası kısa dinlenmeyi uyarır', () => {
    planla(gunEkle(GUN, -1), 2)
    const c = kontrol(bak(), 'rest_period')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/2\.0 saat/)
  })

  it('gündüz vardiyası sonrası yeterli dinlenmeyi uyarmaz', () => {
    planla(gunEkle(GUN, -1), 1)   // dün 08-16, bugün 08 → 16 saat
    expect(kontrol(bak(), 'rest_period').status).toBe('ok')
  })

  // Saati okunamayan vardiya "dinlenme yeterli" diye geçilmemeli.
  it('vardiya saatleri okunaksızsa ölçemediğini söyler', () => {
    planla(gunEkle(GUN, -1), 3)
    const c = kontrol(bak(), 'rest_period')
    expect(c.status).toBe('unknown')
    expect(bak().fully_verified).toBe(false)
  })

  it('vardiya seçilmemişse dinlenme hesaplanamaz der', () => {
    expect(kontrol(bak({ shift_def_id: null }), 'rest_period').status).toBe('unknown')
  })
})

describe('haftalık süre', () => {
  it('haftalık sınırı aşınca uyarır', () => {
    for (let i = 0; i < 5; i++) planla(gunEkle('2026-05-11', i))   // 5 × 8 = 40
    planla('2026-05-16')                                          // +8 = 48
    const c = kontrol(bak(), 'weekly_hours')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/48/)
  })

  it('sınırın altında uyarmaz', () => {
    planla('2026-05-11')
    expect(kontrol(bak(), 'weekly_hours').status).toBe('ok')
  })

  // Tek bir vardiyanın saati eksikse toplam gerçeği yansıtmaz.
  it('saatsiz vardiya varsa toplam hesaplanamaz der', () => {
    planla('2026-05-11', 3)
    expect(kontrol(bak(), 'weekly_hours').status).toBe('unknown')
  })
})

describe('rol ve belge', () => {
  it('rol şartı yoksa uyum sorunu yazmaz', () => {
    expect(kontrol(bak(), 'role_match').status).toBe('ok')
  })

  it('farklı rol isteyen vardiyada uyarır', () => {
    const c = kontrol(bak({ role_id: 2 }), 'role_match')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/Teknisyen/)
  })

  it('süresi dolmuş zorunlu belgeyi engel sayar', () => {
    db.prepare("INSERT INTO staff_document_requirements(document_kind,display_name,requires_expiry,is_active) VALUES('sgk','SGK Belgesi',1,1)").run()
    db.prepare("INSERT INTO documents(staff_id,document_kind,expires_on) VALUES(10,'sgk','2026-01-01')").run()
    const r = bak()
    expect(r.blockers).toContain('documents')
    expect(kontrol(r, 'documents').detail).toMatch(/SGK Belgesi/)
  })

  it('geçerli belgede engel yazmaz', () => {
    db.prepare("INSERT INTO staff_document_requirements(document_kind,display_name,requires_expiry,is_active) VALUES('sgk','SGK Belgesi',1,1)").run()
    db.prepare("INSERT INTO documents(staff_id,document_kind,expires_on) VALUES(10,'sgk','2027-01-01')").run()
    expect(bak().blockers).not.toContain('documents')
  })

  // "Belgesi yok" ile "belgesi geçersiz" farklı; ikincisi engel, ilki uyarı.
  it('belge kaydı hiç yoksa uyarır ama engellemez', () => {
    db.prepare("INSERT INTO staff_document_requirements(document_kind,display_name,requires_expiry,is_active) VALUES('sgk','SGK Belgesi',1,1)").run()
    const r = bak()
    expect(r.warnings).toContain('documents')
    expect(r.blockers).not.toContain('documents')
  })
})

describe('ölçülemeyen kaynak', () => {
  it('tablo yoksa unknown der, uygun saymaz', () => {
    const bos = new Database(':memory:')
    bos.exec(`CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, role_id INTEGER,
      department_id INTEGER, exit_date TEXT, is_active INTEGER);
      INSERT INTO staff VALUES (10, 'Ali Veli', 1, 1, NULL, 1);`)
    const r = evaluateSuitability({ staff_id: 10, date: GUN, shift_def_id: 1 }, bos)
    expect(r.unknown.length).toBeGreaterThan(0)
    expect(r.fully_verified).toBe(false)
    bos.close()
  })

  it('olmayan personel 404', () => {
    expect(() => evaluateSuitability({ staff_id: 999, date: GUN }, db)).toThrow(/bulunamadı/)
  })

  it('temiz durumda uygun ve tam doğrulanmış olur', () => {
    const r = bak()
    expect(r.eligible).toBe(true)
    expect(r.fully_verified).toBe(true)
  })
})
