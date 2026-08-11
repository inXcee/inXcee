import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  createOpenShift, listOpenShifts, applyToOpenShift, withdrawApplication,
  listApplicants, selectApplicant, coverageComparison, markApplicationSeen,
} from './openShifts.js'

// Faz 10: boş kalan vardiya için amir tek tek telefon ediyordu; kimin istekli
// olduğu hiçbir yerde durmuyordu.
//
// Seçim çizelgeye YAZILIR — "seçtim" ile "çizelgede var" ayrı kalırsa kimse
// fark etmez. Seçilmeyen başvuru silinmez; gönüllülük kayıtta kalır.

const GUN = '2026-05-13'   // Çarşamba
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, role_id INTEGER, department_id INTEGER,
      exit_date TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT, start_hour TEXT, end_hour TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, work_location_id INTEGER, dept_id INTEGER, status TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE staff_document_requirements (id INTEGER PRIMARY KEY AUTOINCREMENT, document_kind TEXT,
      display_name TEXT, department_id INTEGER, role_id INTEGER, requires_expiry INTEGER, is_active INTEGER);
    CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, document_kind TEXT,
      expires_on TEXT, archived_at TEXT);
    CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY, name TEXT, min_staff INTEGER, dept_id INTEGER,
      shift_def_id INTEGER, work_location_id INTEGER, days_of_week TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE open_shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, work_date TEXT, shift_def_id INTEGER,
      work_location_id INTEGER, dept_id INTEGER, role_id INTEGER, slots INTEGER DEFAULT 1, note TEXT,
      status TEXT DEFAULT 'open', created_by INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE open_shift_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, open_shift_id INTEGER,
      staff_id INTEGER, note TEXT, status TEXT DEFAULT 'applied', decided_by INTEGER, decided_at TEXT,
      seen_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX ux_osa ON open_shift_applications(open_shift_id, staff_id);
    INSERT INTO users(id, full_name) VALUES (1, 'Müdür');
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik');
    INSERT INTO staff_roles(id, name) VALUES (1, 'Meydancı');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal');
    INSERT INTO shift_definitions(id, name, start_hour, end_hour) VALUES (1, 'Gündüz', '08', '16');
    INSERT INTO staff(id, full_name, role_id, department_id) VALUES
      (10, 'Ali Veli', 1, 1), (11, 'Ayşe Can', 1, 1), (12, 'Veli Ak', 1, 1);
  `)
  return d
}

const ac = (over = {}) => createOpenShift({ work_date: GUN, shift_def_id: 1, work_location_id: 1, dept_id: 1, ...over }, db, 1)

beforeEach(() => { db = kur() })

describe('açık vardiya ilanı', () => {
  it('ilan açar ve listeler', () => {
    const o = ac({ note: 'Acil' })
    expect(o).toMatchObject({ work_date: GUN, status: 'open', slots: 1, shift_name: 'Gündüz', location_name: 'OTC Lokal' })
    expect(listOpenShifts({}, db).items).toHaveLength(1)
  })

  it('geçersiz tarih ve kişi sayısını reddeder', () => {
    expect(() => ac({ work_date: '13.05.2026' })).toThrow(/Geçersiz tarih/)
    expect(() => ac({ slots: 0 })).toThrow(/en az 1/)
  })

  it('tarih aralığına göre filtreler', () => {
    ac(); ac({ work_date: '2026-06-01' })
    expect(listOpenShifts({ from: '2026-05-01', to: '2026-05-31' }, db).items).toHaveLength(1)
  })
})

describe('başvuru', () => {
  it('başvuru alır ve aday sayısını arttırır', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10, note: 'Müsaitim' }, db)
    expect(listOpenShifts({}, db).items[0].applicant_count).toBe(1)
  })

  it('aynı kişi iki kez başvuramaz', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(() => applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)).toThrow(/zaten başvurulmuş/)
  })

  // Geri çekip yeniden başvurmak geçmişi çoğaltmamalı.
  it('geri çekilen başvuru yeniden açılabilir, satır çoğalmaz', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    withdrawApplication({ open_shift_id: o.id, staff_id: 10 }, db)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(db.prepare('SELECT COUNT(*) c FROM open_shift_applications').get().c).toBe(1)
    expect(listApplicants(o.id, db).items).toHaveLength(1)
  })

  it('dolmuş vardiyaya başvurulamaz', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)
    expect(() => applyToOpenShift({ open_shift_id: o.id, staff_id: 11 }, db)).toThrow(/artık açık değil/)
  })

  it('olmayan ilana başvuru 404', () => {
    expect(() => applyToOpenShift({ open_shift_id: 999, staff_id: 10 }, db)).toThrow(/bulunamadı/)
  })

  it('görüldü damgası tek sefer düşer', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(markApplicationSeen({ open_shift_id: o.id, staff_id: 10 }, db).marked).toBe(true)
    expect(markApplicationSeen({ open_shift_id: o.id, staff_id: 10 }, db).marked).toBe(false)
  })
})

describe('aday listesi', () => {
  it('her adayın uygunluk özetini yanında verir', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    const { items } = listApplicants(o.id, db)
    expect(items[0].suitability).toMatchObject({ eligible: true, fully_verified: true })
    expect(items[0].full_name).toBe('Ali Veli')
  })

  it('o gün çalışan adayı uygun göstermez', () => {
    const o = ac()
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, status) VALUES(10, ?, 1, 'scheduled')").run(GUN)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(listApplicants(o.id, db).items[0].suitability.eligible).toBe(false)
  })

  it('geri çekilmiş başvuru listede görünmez', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    withdrawApplication({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(listApplicants(o.id, db).items).toHaveLength(0)
  })
})

describe('seçim', () => {
  it('seçilen adayı çizelgeye yazar', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)
    const satir = db.prepare('SELECT * FROM shift_schedule WHERE staff_id = 10 AND work_date = ?').get(GUN)
    expect(satir).toMatchObject({ shift_def_id: 1, work_location_id: 1, dept_id: 1, status: 'scheduled' })
  })

  it('kontenjan dolunca ilan kapanır, diğer adaylar not_selected olur', () => {
    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 11 }, db)
    selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)
    const durumlar = db.prepare('SELECT staff_id, status FROM open_shift_applications ORDER BY staff_id').all()
    expect(durumlar).toEqual([{ staff_id: 10, status: 'selected' }, { staff_id: 11, status: 'not_selected' }])
    expect(db.prepare('SELECT status FROM open_shifts WHERE id = ?').get(o.id).status).toBe('filled')
  })

  it('iki kontenjanda ilk seçimden sonra ilan açık kalır', () => {
    const o = ac({ slots: 2 })
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 11 }, db)
    selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)
    expect(db.prepare('SELECT status FROM open_shifts WHERE id = ?').get(o.id).status).toBe('open')
  })

  // Engelli adayı sessizce atamak, kontrolü hiç yapmamakla aynı sonucu verir.
  it('engelli adayı atamayı reddeder, force ile geçilebilir', () => {
    const o = ac()
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    expect(() => selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)).toThrow(/Atama engelli/)
    expect(selectApplicant({ open_shift_id: o.id, staff_id: 10, force: true }, db, 1).selected).toBe(true)
  })

  it('başvurusu olmayan kişi seçilemez', () => {
    const o = ac()
    expect(() => selectApplicant({ open_shift_id: o.id, staff_id: 11 }, db, 1)).toThrow(/başvurusu yok/)
  })

  // Reddedilen atamada çizelgeye yazılmamalı — kısmi yazma en kötüsü.
  it('reddedilen atamada çizelge kirlenmez', () => {
    const o = ac()
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual',?,?,'approved')").run(GUN, GUN)
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    try { selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1) } catch { /* beklenen */ }
    expect(db.prepare('SELECT COUNT(*) c FROM shift_schedule').get().c).toBe(0)
  })
})

describe('kapsama karşılaştırması', () => {
  const kural = () => db.prepare(
    "INSERT INTO shift_coverage_rules(id,name,min_staff,shift_def_id,days_of_week) VALUES(1,'OTC gündüz',2,1,'1,2,3,4,5')"
  ).run()

  it('atama sonrası eksiği ve değişimi verir', () => {
    kural()
    const once = coverageComparison({ date: GUN }, db)
    expect(once.rules[0]).toMatchObject({ required: 2, assigned: 0, missing: 2 })

    const o = ac()
    applyToOpenShift({ open_shift_id: o.id, staff_id: 10 }, db)
    selectApplicant({ open_shift_id: o.id, staff_id: 10 }, db, 1)

    const sonra = coverageComparison({ date: GUN, before: once.rules }, db)
    expect(sonra.rules[0]).toMatchObject({ assigned: 1, missing: 1, previous: 0, delta: 1 })
    expect(sonra.improved).toBe(1)
  })

  it('o hafta gününde geçerli olmayan kuralı saymaz', () => {
    db.prepare("INSERT INTO shift_coverage_rules(id,name,min_staff,shift_def_id,days_of_week) VALUES(1,'Hafta sonu',2,1,'6,7')").run()
    expect(coverageComparison({ date: GUN }, db).rules).toHaveLength(0)
  })

  // Kural tablosu okunamıyorsa "kapsama tam" denmez.
  it('kural tablosu yoksa ölçemediğini söyler', () => {
    const bos = new Database(':memory:')
    const r = coverageComparison({ date: GUN }, bos)
    expect(r.available).toBe(false)
    expect(r.reason).toMatch(/okunamadı/)
    bos.close()
  })
})
