import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildLeaveImpact, gunAraligi, tekrarEdenOruntu } from './leaveImpact.js'

// Faz 8: izin onayı bugüne kadar tek soruya bakıyordu — "bakiyesi var mı".
// Onaydan sonra çıkanlar (nokta kadrosuz kalıyor, girilmiş vardiya eziliyor,
// aynı gün üç kişi daha izinli) onay ÖNCESİ görünmeli.

let db
const OCAK = '2026-01-05'   // Pazartesi

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER,
      is_active INTEGER DEFAULT 1, role_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      status TEXT, shift_def_id INTEGER, work_location_id INTEGER, dept_id INTEGER);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, total_days REAL, status TEXT);
    CREATE TABLE leave_balance (staff_id INTEGER, year INTEGER, annual_total REAL, annual_used REAL);
    CREATE TABLE overtime_records (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT, hours REAL);
    CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY, name TEXT, min_staff INTEGER, dept_id INTEGER,
      shift_def_id INTEGER, work_location_id INTEGER, days_of_week TEXT, is_active INTEGER DEFAULT 1);
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik');
    INSERT INTO staff(id, full_name, department_id) VALUES (10, 'Ali Veli', 1), (11, 'Ayşe Can', 1), (12, 'Veli Ak', 1);
    INSERT INTO shift_definitions(id, name) VALUES (1, 'Gündüz');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal');
  `)
})

beforeEach(() => {
  db.exec(`DELETE FROM shift_schedule; DELETE FROM leave_requests; DELETE FROM leave_balance;
           DELETE FROM overtime_records; DELETE FROM shift_coverage_rules;`)
})

const etki = (over = {}) => buildLeaveImpact({ staff_id: 10, start: OCAK, end: OCAK, ...over }, db)

describe('gün aralığı', () => {
  it('kapalı aralık üretir', () => {
    expect(gunAraligi('2026-01-05', '2026-01-07')).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
  })

  it('ay sınırını doğru geçer', () => {
    expect(gunAraligi('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
  })

  it('ters ve aşırı uzun aralığı reddeder', () => {
    expect(() => gunAraligi('2026-01-10', '2026-01-05')).toThrow(/önce olamaz/)
    expect(() => gunAraligi('2026-01-01', '2027-01-01')).toThrow(/günden uzun/)
  })
})

describe('bakiye', () => {
  it('yıllık izinde kalan ve sonrasını hesaplar', () => {
    db.prepare('INSERT INTO leave_balance VALUES(10, 2026, 14, 4)').run()
    const b = etki({ end: '2026-01-07' }).balance
    expect(b).toMatchObject({ remaining: 10, requested: 3, after: 7, sufficient: true })
  })

  it('bakiye yetmiyorsa uyarır', () => {
    db.prepare('INSERT INTO leave_balance VALUES(10, 2026, 14, 13)').run()
    const r = etki({ end: '2026-01-07' })
    expect(r.balance.sufficient).toBe(false)
    expect(r.warnings).toContain('Yıllık izin bakiyesi yetersiz')
  })

  // Kayıt yoksa "0 kaldı" demek yanlış; hak ediş hiç hesaplanmamış olabilir.
  it('bakiye kaydı yoksa bilinmiyor der', () => {
    expect(etki().balance).toMatchObject({ known: false })
    expect(etki().balance.reason).toMatch(/bakiye kaydı yok/)
  })

  // Raporlu/ücretsizde yıllık bakiye ölçüt değil.
  it('yıllık dışı türde bakiyeyi ölçüt saymaz', () => {
    const b = etki({ leave_type: 'sick' }).balance
    expect(b.applicable).toBe(false)
    expect(b.reason).toMatch(/ölçüt değil/)
  })
})

describe('çakışan vardiya', () => {
  it('izinle ezilecek vardiyaları listeler', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status, shift_def_id, work_location_id) VALUES(10,?, 'scheduled',1,1)").run(OCAK)
    const r = etki()
    expect(r.conflicting_shifts.items).toHaveLength(1)
    expect(r.conflicting_shifts.items[0]).toMatchObject({ shift_name: 'Gündüz', location_name: 'OTC Lokal' })
    expect(r.warnings.join(' ')).toMatch(/izinle ezilecek/)
  })

  it('izinli/haftalık izin günlerini çakışma saymaz', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(10,?, 'off')").run(OCAK)
    expect(etki().conflicting_shifts.items).toHaveLength(0)
  })
})

describe('aynı gün izinliler', () => {
  it('aynı bölümdeki onaylı izinlileri gün gün verir', () => {
    db.prepare("INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, status) VALUES(11,'annual',?,?,'approved')").run(OCAK, OCAK)
    db.prepare("INSERT INTO leave_requests(staff_id, leave_type, start_date, end_date, status) VALUES(12,'annual',?,?,'pending')").run(OCAK, OCAK)
    const r = etki()
    expect(r.same_day_leaves.items).toEqual([{ date: OCAK, names: ['Ayşe Can'] }])
  })
})

describe('kapsama kaybı', () => {
  const kural = (min) => db.prepare(`
    INSERT INTO shift_coverage_rules(id, name, min_staff, shift_def_id, days_of_week)
    VALUES(1, 'OTC gündüz', ?, 1, '1,2,3,4,5')
  `).run(min)

  const planla = (staffId) => db.prepare(
    "INSERT INTO shift_schedule(staff_id, work_date, status, shift_def_id) VALUES(?,?, 'scheduled', 1)"
  ).run(staffId, OCAK)

  it('kişi çıkınca asgarinin altına düşen kuralı bildirir', () => {
    kural(2); planla(10); planla(11)
    const r = etki()
    expect(r.coverage_loss.items[0]).toMatchObject({ required: 2, before: 2, after: 1, missing: 1 })
    expect(r.warnings.join(' ')).toMatch(/kadro asgarinin altına/)
  })

  it('kişi çıkınca hâlâ yetiyorsa kayıp yazmaz', () => {
    kural(2); planla(10); planla(11); planla(12)
    expect(etki().coverage_loss.items).toHaveLength(0)
  })

  // Kişi o kuralı doldurmuyorsa izni o kuralı etkilemez.
  it('ilgisiz kuralı etkilenmiş göstermez', () => {
    kural(5); planla(11)
    expect(etki().coverage_loss.items).toHaveLength(0)
  })

  it('kural o hafta gününde geçerli değilse bakmaz', () => {
    db.prepare("INSERT INTO shift_coverage_rules(id,name,min_staff,shift_def_id,days_of_week) VALUES(1,'Hafta sonu',2,1,'6,7')").run()
    planla(10)
    expect(etki().coverage_loss.items).toHaveLength(0)
  })
})

describe('yıl sonu ve örüntü', () => {
  it('gelecek onaylı izinlerle birlikte yıl sonunu tahmin eder', () => {
    db.prepare('INSERT INTO leave_balance VALUES(10, 2026, 14, 0)').run()
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status) VALUES(10,'annual','2026-07-01','2026-07-10',10,'approved')").run()
    const r = etki({ end: '2026-01-09' })
    expect(r.year_end_forecast).toMatchObject({ remaining_now: 14, this_request: 5, other_approved_future: 10, projected: -1 })
    expect(r.warnings).toContain('Yıl sonunda bakiye açığa düşüyor')
  })

  it('bakiye bilinmiyorsa tahmin uydurmaz', () => {
    expect(etki().year_end_forecast).toMatchObject({ known: false })
  })

  it('aynı hafta gününe yığılan izni yakalar', () => {
    // Üç Pazartesi + bir Salı
    expect(tekrarEdenOruntu(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-06']))
      .toEqual([{ weekday: 1, weekday_name: 'Pazartesi', count: 3 }])
  })

  it('eşiğin altındaki tekrarı örüntü saymaz', () => {
    expect(tekrarEdenOruntu(['2026-01-05', '2026-01-12'])).toEqual([])
  })
})

describe('ölçülemeyen kaynak', () => {
  // Tablo yoksa boş liste dönmek "etki yok" gibi okunur; kaynak eksikliği yazılmalı.
  it('eksik tabloyu unavailable listesine yazar', () => {
    const bos = new Database(':memory:')
    bos.exec(`CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER, is_active INTEGER);
              INSERT INTO staff VALUES (10, 'Ali Veli', 1, 1);`)
    const r = buildLeaveImpact({ staff_id: 10, start: OCAK, end: OCAK }, bos)
    expect(r.unavailable.map(u => u.source)).toContain('shift_schedule')
    expect(r.replacements.available).toBe(false)
    bos.close()
  })

  it('geçersiz personel ve tarih reddedilir', () => {
    expect(() => buildLeaveImpact({ staff_id: 0, start: OCAK, end: OCAK }, db)).toThrow(/Geçersiz personel/)
    expect(() => buildLeaveImpact({ staff_id: 10, start: 'x', end: OCAK }, db)).toThrow(/Geçersiz tarih/)
    expect(() => buildLeaveImpact({ staff_id: 999, start: OCAK, end: OCAK }, db)).toThrow(/bulunamadı/)
  })
})
