import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildTimesheetChain, isIsoDate } from './timesheetChain.js'

// Faz 7: puantajda bir gün "çalıştı/izinli/devamsız" görünüyor ama NEDEN öyle
// göründüğü hiçbir yerde yazmıyor. İtiraz geldiğinde kimse zinciri geriye
// izleyemiyor. Eksik halka GİZLENMEZ — zinciri göstermenin amacı kopuk yeri
// göstermek.

const GUN = '2026-06-15'
let db

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT, start_hour TEXT, end_hour TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT, leave_type TEXT, absent_reason TEXT,
      puantaj_code_id INTEGER, work_location_id INTEGER);
    CREATE TABLE attendance_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      shift_schedule_id INTEGER, check_in_at TEXT, check_out_at TEXT, actual_hours REAL);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      leave_type TEXT, start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE overtime_records (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      work_date TEXT, hours REAL, reason TEXT, approved_by INTEGER);
    CREATE TABLE puantaj_codes (id INTEGER PRIMARY KEY, code TEXT, label TEXT, is_paid INTEGER,
      sgk_day_factor REAL, day_multiplier REAL, hour_multiplier REAL, overtime_effect TEXT);
    CREATE TABLE puantaj_period_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT,
      status TEXT, approved_at TEXT, dept_scope TEXT);
    INSERT INTO users(id, full_name) VALUES (1, 'Müdür');
    INSERT INTO staff(id, full_name) VALUES (10, 'Ali Veli');
    INSERT INTO shift_definitions(id, name, start_hour, end_hour) VALUES (1, 'Gündüz', '08', '16');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal');
    INSERT INTO puantaj_codes(id, code, label, is_paid, sgk_day_factor, day_multiplier)
      VALUES (5, 'N', 'Normal çalışma', 1, 1, 1);
  `)
})

beforeEach(() => {
  db.exec(`DELETE FROM shift_schedule; DELETE FROM attendance_logs; DELETE FROM leave_requests;
           DELETE FROM overtime_records; DELETE FROM puantaj_period_approvals;`)
})

const halka = (zincir, key) => zincir.links.find(l => l.key === key)
// puantaj_code_id'de `?? 5` kullanılamaz: açıkça null geçmek "kod yok" demek,
// varsayılana düşmek değil.
const planla = (over = {}) => db.prepare(`
  INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, status, puantaj_code_id, work_location_id)
  VALUES(?,?,?,?,?,?)
`).run(10, GUN, over.shift_def_id ?? 1, over.status ?? 'worked',
  'puantaj_code_id' in over ? over.puantaj_code_id : 5, over.work_location_id ?? 1)

describe('girdi doğrulaması', () => {
  it('tarih ve personel doğrulanır', () => {
    expect(isIsoDate('2026-06-15')).toBe(true)
    expect(() => buildTimesheetChain({ staff_id: 10, date: 'bozuk' }, db)).toThrow(/Geçersiz tarih/)
    expect(() => buildTimesheetChain({ staff_id: 0, date: GUN }, db)).toThrow(/Geçersiz personel/)
  })

  it('olmayan personel 404', () => {
    expect(() => buildTimesheetChain({ staff_id: 999, date: GUN }, db)).toThrow(/bulunamadı/i)
  })
})

describe('zincirin halkaları', () => {
  it('altı halkayı da sırayla döner', () => {
    planla()
    const zincir = buildTimesheetChain({ staff_id: 10, date: GUN }, db)
    expect(zincir.links.map(l => l.key)).toEqual(['schedule', 'evidence', 'leave', 'overtime', 'code', 'approval'])
    expect(zincir.staff.full_name).toBe('Ali Veli')
  })

  it('planlanan vardiyayı adı, saati ve noktasıyla verir', () => {
    planla()
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'schedule')
    expect(h.status).toBe('ok')
    expect(h.detail).toContain('Gündüz')
    expect(h.detail).toContain('OTC Lokal')
  })

  // Kayıt yoksa "gün hiç planlanmamış" da bir cevaptır.
  it('çizelge kaydı yoksa eksik der', () => {
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'schedule')
    expect(h.status).toBe('missing')
    expect(h.detail).toMatch(/hiç çizelge kaydı girilmemiş/)
  })

  it('puantaj kodunu çarpanlarıyla açıklar', () => {
    planla()
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'code')
    expect(h.status).toBe('ok')
    expect(h.detail).toContain('Normal çalışma')
    expect(h.detail).toMatch(/ücretli/)
    expect(h.detail).toMatch(/SGK gün 1/)
  })

  // Kod atanmamışsa bordroya nasıl yansıyacağı belirsizdir — gizlenmemeli.
  it('puantaj kodu atanmamışsa eksik der', () => {
    planla({ puantaj_code_id: null })
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'code')
    expect(h.status).toBe('missing')
    expect(h.detail).toMatch(/kodu atanmamış/)
  })

  it('onaylı izni gösterir, onaysızı eksik sayar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    expect(halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'leave').status).toBe('ok')

    db.exec('DELETE FROM leave_requests')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'pending')").run(GUN, GUN)
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'leave')
    expect(h.status).toBe('missing')
    expect(h.detail).toMatch(/durum: pending/)
  })

  it('mesaiyi onaylayanıyla gösterir', () => {
    db.prepare("INSERT INTO overtime_records(staff_id,work_date,hours,reason,approved_by) VALUES(10,?,3,'Yoğunluk',1)").run(GUN)
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'overtime')
    expect(h.detail).toContain('3 saat')
    expect(h.detail).toContain('onaylayan: Müdür')
  })

  // Onaylayanı olmayan mesai kaydı sessiz geçmemeli.
  it('onaylayanı olmayan mesaiyi belirtir', () => {
    db.prepare("INSERT INTO overtime_records(staff_id,work_date,hours) VALUES(10,?,2)").run(GUN)
    expect(halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'overtime').detail).toMatch(/onaylayan kaydı yok/)
  })

  it('dönem onayını aya göre bulur', () => {
    db.prepare("INSERT INTO puantaj_period_approvals(period,status,approved_at) VALUES('2026-06','approved','2026-07-01')").run()
    expect(halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'approval').status).toBe('ok')
  })
})

describe('kanıt halkası — kaynak yokluğu', () => {
  // "Kanıt yok" ile "kaynak hiç yok" farklı şeyler; ikisi ayrı raporlanmalı.
  it('attendance_logs boşken unavailable der, missing değil', () => {
    planla()
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'evidence')
    expect(h.status).toBe('unavailable')
    expect(h.detail).toMatch(/hiç akmıyor/)
  })

  it('kaynak varken o güne kayıt yoksa missing der', () => {
    planla()
    const ss = db.prepare('SELECT id FROM shift_schedule LIMIT 1').get()
    // Başka bir güne ait kayıt: kaynak dolu ama bu güne kanıt yok
    db.prepare('INSERT INTO attendance_logs(staff_id, shift_schedule_id, check_in_at) VALUES(10, 9999, ?)').run('2026-06-01 08:00')
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'evidence')
    expect(h.status).toBe('missing')
    expect(ss.id).toBeTruthy()
  })

  it('kanıt varsa giriş/çıkış saatlerini verir', () => {
    planla()
    const ss = db.prepare('SELECT id FROM shift_schedule LIMIT 1').get()
    db.prepare('INSERT INTO attendance_logs(staff_id, shift_schedule_id, check_in_at, check_out_at, actual_hours) VALUES(10,?,?,?,?)')
      .run(ss.id, `${GUN} 08:02`, `${GUN} 16:10`, 8.1)
    const h = halka(buildTimesheetChain({ staff_id: 10, date: GUN }, db), 'evidence')
    expect(h.status).toBe('ok')
    expect(h.detail).toContain('08:02')
    expect(h.detail).toContain('8.1 saat')
  })
})

describe('açıklanabilirlik', () => {
  it('tüm halkalar sağlamsa açıklanabilir', () => {
    planla()
    const ss = db.prepare('SELECT id FROM shift_schedule LIMIT 1').get()
    db.prepare('INSERT INTO attendance_logs(staff_id, shift_schedule_id, check_in_at) VALUES(10,?,?)').run(ss.id, `${GUN} 08:00`)
    db.prepare("INSERT INTO puantaj_period_approvals(period,status) VALUES('2026-06','approved')").run()

    const zincir = buildTimesheetChain({ staff_id: 10, date: GUN }, db)
    expect(zincir.gaps).toEqual([])
    expect(zincir.explainable).toBe(true)
  })

  it('kopuk halka varsa açıklanabilir değildir ve hangisi olduğu yazar', () => {
    planla({ puantaj_code_id: null })
    const zincir = buildTimesheetChain({ staff_id: 10, date: GUN }, db)
    expect(zincir.explainable).toBe(false)
    expect(zincir.gaps).toContain('code')
    expect(zincir.gaps).toContain('evidence')
  })

  // Tablo yoksa halka 'unavailable' olur; sessizce "ok" sayılmaz.
  it('tablolar yoksa halkalar unavailable olur', () => {
    const bos = new Database(':memory:')
    bos.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER)')
    bos.prepare('INSERT INTO staff(id, full_name, is_active) VALUES (10, ?, 1)').run('Ali Veli')
    const zincir = buildTimesheetChain({ staff_id: 10, date: GUN }, bos)
    expect(zincir.explainable).toBe(false)
    expect(zincir.links.some(l => l.status === 'unavailable')).toBe(true)
    bos.close()
  })
})
