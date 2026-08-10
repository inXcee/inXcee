import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDayOperations, findReplacements, addHandoverNote, isoGun, isIsoDate } from './dailyOperations.js'

// Faz 6: gün detayı paneli "kim hangi vardiyada" sorusunu zaten cevaplıyor.
// Burada cevaplanmayan üçü test ediliyor: hangi nokta EKSİK kadroyla çalışıyor,
// biri gelmezse YERİNE kimi çağırırım, gün içinde ne oldu (devir teslim).

const GUN = '2026-08-12'   // Çarşamba → ISO 3
let db

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1,
      department_id INTEGER, role_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT, dept_id INTEGER, work_location_id INTEGER);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, dept_id INTEGER,
      role_id INTEGER, work_location_id INTEGER, shift_def_id INTEGER, start_time TEXT, end_time TEXT,
      min_staff INTEGER, days_of_week TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE attendance_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      shift_schedule_id INTEGER, check_in_at TEXT, check_out_at TEXT, actual_hours REAL);
    INSERT INTO users(id, full_name) VALUES (1, 'Müdür');
    INSERT INTO departments(id, name) VALUES (1, 'Mutfak'), (2, 'Temizlik');
    INSERT INTO staff_roles(id, name) VALUES (1, 'Aşçı');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal');
    INSERT INTO shift_definitions(id, name) VALUES (1, 'Gündüz'), (2, 'Gece');
    INSERT INTO staff(id, full_name, department_id, role_id) VALUES
      (10,'Ali Veli',1,1), (11,'Ayşe Demir',1,1), (12,'Can Öz',2,1), (13,'Pasif Kişi',1,1);
    UPDATE staff SET is_active = 0 WHERE id = 13;
  `)
  const mig = join(dirname(fileURLToPath(import.meta.url)), '../../shared/db/migrations/094_shift_handover_notes.sql')
  db.exec(readFileSync(mig, 'utf-8'))
})

beforeEach(() => {
  db.exec(`DELETE FROM shift_schedule; DELETE FROM leave_requests; DELETE FROM shift_coverage_rules;
           DELETE FROM shift_handover_notes; DELETE FROM attendance_logs;`)
})

const planla = (staffId, date, status = 'scheduled', extra = {}) =>
  db.prepare('INSERT INTO shift_schedule(staff_id, work_date, status, shift_def_id, dept_id, work_location_id) VALUES(?,?,?,?,?,?)')
    .run(staffId, date, status, extra.shift_def_id ?? 1, extra.dept_id ?? null, extra.work_location_id ?? null)

describe('gün ve tarih', () => {
  it('ISO gün numarası (1=Pazartesi, 7=Pazar)', () => {
    expect(isoGun('2026-08-10')).toBe(1)   // Pazartesi
    expect(isoGun('2026-08-12')).toBe(3)   // Çarşamba
    expect(isoGun('2026-08-16')).toBe(7)   // Pazar
  })

  it('geçersiz tarih reddedilir', () => {
    expect(isIsoDate('12.08.2026')).toBe(false)
    expect(() => getDayOperations('bozuk', db)).toThrow(/Geçersiz tarih/)
    expect(() => findReplacements({ date: 'bozuk' }, db)).toThrow(/Geçersiz tarih/)
  })
})

describe('gün özeti', () => {
  it('durumları sayar', () => {
    planla(10, GUN, 'scheduled')
    planla(11, GUN, 'worked')
    planla(12, GUN, 'on_leave')
    const ozet = getDayOperations(GUN, db).summary
    expect(ozet).toMatchObject({ planned: 1, worked: 1, on_leave: 1, total: 3 })
  })

  it('başka günün kaydını saymaz', () => {
    planla(10, '2026-08-11', 'worked')
    expect(getDayOperations(GUN, db).summary.total).toBe(0)
  })
})

describe('kapsama açıkları', () => {
  const kural = (over = {}) => db.prepare(`
    INSERT INTO shift_coverage_rules(name, dept_id, work_location_id, shift_def_id, start_time, end_time, min_staff, days_of_week, is_active)
    VALUES(?,?,?,?,?,?,?,?,1)
  `).run(over.name ?? 'OTC Sabah', over.dept_id ?? null, over.work_location_id ?? 1,
    over.shift_def_id ?? 1, '06:00', '15:00', over.min_staff ?? 2, over.days ?? '1,2,3,4,5,6,7')

  it('eksik kadroyu bildirir', () => {
    kural({ min_staff: 3 })
    planla(10, GUN, 'scheduled', { work_location_id: 1, shift_def_id: 1 })
    const acik = getDayOperations(GUN, db).coverage_gaps
    expect(acik).toHaveLength(1)
    expect(acik[0]).toMatchObject({ required: 3, assigned: 1, missing: 2, location: 'OTC Lokal' })
  })

  it('kadro tamsa açık üretmez', () => {
    kural({ min_staff: 1 })
    planla(10, GUN, 'scheduled', { work_location_id: 1, shift_def_id: 1 })
    expect(getDayOperations(GUN, db).coverage_gaps).toEqual([])
  })

  // Kural yalnız belirli günlerde geçerliyse diğer günlerde açık üretmemeli.
  it('o gün geçerli olmayan kuralı uygulamaz', () => {
    kural({ min_staff: 5, days: '1,2' })     // yalnız Pzt-Sal, GUN ise Çarşamba
    expect(getDayOperations(GUN, db).coverage_gaps).toEqual([])
  })

  it('en çok eksik olan üstte sıralanır', () => {
    kural({ name: 'Az eksik', min_staff: 2, work_location_id: 1 })
    kural({ name: 'Cok eksik', min_staff: 6, work_location_id: 1 })
    planla(10, GUN, 'scheduled', { work_location_id: 1, shift_def_id: 1 })
    expect(getDayOperations(GUN, db).coverage_gaps[0].rule_name).toBe('Cok eksik')
  })

  // İzinli kişi sahada değildir; kadroya sayılırsa açık gizlenir.
  it('izinli kaydı kadroya saymaz', () => {
    kural({ min_staff: 2, work_location_id: 1 })
    planla(10, GUN, 'scheduled', { work_location_id: 1, shift_def_id: 1 })
    planla(11, GUN, 'on_leave', { work_location_id: 1, shift_def_id: 1 })
    expect(getDayOperations(GUN, db).coverage_gaps[0].assigned).toBe(1)
  })
})

describe('devam kaydı (turnike/kart)', () => {
  // Canlıda attendance_logs BOŞ. "0 devamsız" demek yanlış güven verir.
  it('kaynak boşken sıfır demez, sebebini söyler', () => {
    const devam = getDayOperations(GUN, db).attendance
    expect(devam.available).toBe(false)
    expect(devam.reason).toMatch(/boş|akmıyor/i)
  })

  it('kayıt varsa o günün sayısını verir', () => {
    planla(10, GUN, 'worked')
    const ss = db.prepare('SELECT id FROM shift_schedule WHERE work_date = ? LIMIT 1').get(GUN)
    db.prepare('INSERT INTO attendance_logs(staff_id, shift_schedule_id, check_in_at) VALUES(?,?,?)').run(10, ss.id, `${GUN} 08:00`)
    const devam = getDayOperations(GUN, db).attendance
    expect(devam.available).toBe(true)
    expect(devam.count).toBe(1)
  })
})

describe('yerine çağrılabilecekler', () => {
  it('o gün boşta olan aktif personeli önerir', () => {
    planla(10, GUN, 'scheduled')
    const adaylar = findReplacements({ date: GUN }, db).map(a => a.full_name)
    expect(adaylar).toContain('Ayşe Demir')
    expect(adaylar).toContain('Can Öz')
    expect(adaylar).not.toContain('Ali Veli')     // o gün çalışıyor
    expect(adaylar).not.toContain('Pasif Kişi')   // aktif değil
  })

  // İzinli kişiyi aday göstermek amiri yanlış yönlendirir.
  it('onaylı izinli kişiyi önermez', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(11,?,?,'approved')").run(GUN, GUN)
    expect(findReplacements({ date: GUN }, db).map(a => a.full_name)).not.toContain('Ayşe Demir')
  })

  it('onaylanmamış izin talebi engel değildir', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(11,?,?,'pending')").run(GUN, GUN)
    expect(findReplacements({ date: GUN }, db).map(a => a.full_name)).toContain('Ayşe Demir')
  })

  it('departmana göre daraltılabilir', () => {
    const adaylar = findReplacements({ date: GUN, department_id: 2 }, db).map(a => a.full_name)
    expect(adaylar).toEqual(['Can Öz'])
  })

  // Yükü dengelemek için son 7 günde az çalışan önce önerilir.
  it('son 7 günde az çalışan önce gelir', () => {
    for (let i = 1; i <= 5; i += 1) planla(11, `2026-08-0${i + 5}`, 'worked')
    const adaylar = findReplacements({ date: GUN, department_id: 1 }, db)
    expect(adaylar[0].full_name).toBe('Ali Veli')     // hiç çalışmamış
    expect(adaylar.at(-1).full_name).toBe('Ayşe Demir')
  })

  it('limit uygulanır', () => {
    expect(findReplacements({ date: GUN, limit: 1 }, db)).toHaveLength(1)
  })
})

describe('devir teslim notu', () => {
  it('not ekler ve o günün notlarını döner', () => {
    addHandoverNote({ date: GUN, note: 'Gece vardiyasında 2 kişi eksik kaldı', userId: 1 }, db)
    const notlar = getDayOperations(GUN, db).handover
    expect(notlar).toHaveLength(1)
    expect(notlar[0]).toMatchObject({ note: 'Gece vardiyasında 2 kişi eksik kaldı', author_name: 'Müdür' })
  })

  it('vardiya bazlı not vardiya adını taşır', () => {
    addHandoverNote({ date: GUN, note: 'Devir', shift_def_id: 2, userId: 1 }, db)
    expect(getDayOperations(GUN, db).handover[0].shift_name).toBe('Gece')
  })

  it('boş not reddedilir', () => {
    expect(() => addHandoverNote({ date: GUN, note: '   ', userId: 1 }, db)).toThrow(/boş olamaz/i)
  })

  it('çok uzun not reddedilir', () => {
    expect(() => addHandoverNote({ date: GUN, note: 'x'.repeat(4001), userId: 1 }, db)).toThrow(/çok uzun/i)
  })

  it('başka günün notu karışmaz', () => {
    addHandoverNote({ date: '2026-08-11', note: 'Dünkü not', userId: 1 }, db)
    expect(getDayOperations(GUN, db).handover).toEqual([])
  })
})

describe('ölçülemeyen kaynak', () => {
  // Boş liste "sorun yok" sanılmasın.
  it('tablo yoksa sessiz kalmaz', () => {
    const bos = new Database(':memory:')
    const rapor = getDayOperations(GUN, bos)
    expect(rapor.unavailable.length).toBeGreaterThan(0)
    expect(rapor.summary.total).toBe(0)
    bos.close()
  })
})
