import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildShiftReport } from './shiftReports.js'

// Faz 13: ay sonunda "ne oldu" sorusunun cevabı parça parça farklı ekranlardaydı.
// Ölçülemeyen bölüm SIFIR göstermez — neden ölçülemediğini yazar. "0 devamsız"
// ile "kayıt hiç yok" farklı şeylerdir.

const AY = '2026-04'
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER, project_id INTEGER,
      exit_date TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE work_locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, work_location_id INTEGER, dept_id INTEGER, status TEXT, absent_reason TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, total_days REAL, status TEXT);
    CREATE TABLE overtime_records (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT, hours REAL);
    CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY, name TEXT, min_staff INTEGER, dept_id INTEGER,
      shift_def_id INTEGER, work_location_id INTEGER, days_of_week TEXT, is_active INTEGER DEFAULT 1);
    CREATE TABLE puantaj_period_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT, status TEXT,
      created_at TEXT, approved_at TEXT);
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik'), (2, 'Teknik');
    INSERT INTO projects(id, name) VALUES (1, 'FPU');
    INSERT INTO staff(id, full_name, department_id, project_id) VALUES
      (10, 'Ali Veli', 1, 1), (11, 'Ayşe Can', 1, NULL), (12, 'Veli Ak', 2, 1);
  `)
  return d
}

const kayit = (staffId, gun, status = 'worked', over = {}) => db.prepare(`
  INSERT INTO shift_schedule(staff_id, work_date, status, absent_reason, dept_id, shift_def_id)
  VALUES(?,?,?,?,?,?)
`).run(staffId, `${AY}-${gun}`, status, over.reason ?? null, over.dept_id ?? null, over.shift_def_id ?? null)

const rapor = (over = {}) => buildShiftReport({ period: AY, ...over }, db)

beforeEach(() => { db = kur() })

describe('planlanan / gerçekleşen', () => {
  it('gün gün ve toplam olarak verir', () => {
    kayit(10, '01', 'worked'); kayit(11, '01', 'scheduled'); kayit(10, '02', 'worked')
    const b = rapor().sections.planned_vs_actual
    expect(b.total_planned).toBe(3)
    expect(b.total_actual).toBe(2)
    expect(b.realization).toBeCloseTo(0.667, 2)
  })

  // Plan yoksa oran 0 değil, hesaplanamaz.
  it('hiç plan yoksa oran uydurmaz', () => {
    const b = rapor().sections.planned_vs_actual
    expect(b.realization).toBeNull()
    expect(b.realization_note).toMatch(/hesaplanamaz/)
  })

  it('departman filtresi uygular', () => {
    kayit(10, '01'); kayit(12, '01')
    expect(rapor({ dept_id: 1 }).sections.planned_vs_actual.total_actual).toBe(1)
    expect(rapor().sections.planned_vs_actual.total_actual).toBe(2)
  })
})

describe('kapsama başarısı', () => {
  // Kural yoksa kapsama %100 değil, ölçüsüzdür.
  it('kural tanımlı değilse ölçülemez der', () => {
    const b = rapor().sections.coverage_success
    expect(b.measurable).toBe(false)
    expect(b.reason).toMatch(/kapsama kuralı tanımlı değil/)
  })

  it('kural-gün oranını ve sürekli açık noktaları verir', () => {
    db.prepare("INSERT INTO shift_coverage_rules(id,name,min_staff,dept_id,days_of_week) VALUES(1,'Gündüz',1,1,'1,2,3,4,5,6,7')").run()
    kayit(10, '01', 'worked', { dept_id: 1 })
    const b = rapor().sections.coverage_success
    expect(b.measurable).toBe(true)
    expect(b.rule_days).toBe(30)
    expect(b.met_days).toBe(1)
    expect(b.chronically_short[0]).toMatchObject({ rule_name: 'Gündüz', short_days: 29 })
  })
})

describe('devamsızlık ve sıralamalar', () => {
  it('devamsızlığı nedensiz ayrımıyla sayar', () => {
    kayit(10, '03', 'absent')
    kayit(10, '04', 'absent', { reason: 'Rapor' })
    const b = rapor().sections.absence
    expect(b).toMatchObject({ total_days: 2, without_reason: 1 })
    expect(b.people[0].full_name).toBe('Ali Veli')
  })

  it('izni onaylı olanlar üzerinden sıralar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status) VALUES(10,'annual','2026-04-05','2026-04-09',5,'approved')").run()
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,status) VALUES(11,'annual','2026-04-05','2026-04-09',5,'pending')").run()
    const b = rapor().sections.leave_ranking
    expect(b.people).toHaveLength(1)
    expect(b.total_days).toBe(5)
  })

  it('mesaiyi saate göre sıralar', () => {
    db.prepare("INSERT INTO overtime_records(staff_id,work_date,hours) VALUES(10,'2026-04-05',4),(11,'2026-04-06',9)").run()
    const b = rapor().sections.overtime_ranking
    expect(b.people[0].full_name).toBe('Ayşe Can')
    expect(b.total_hours).toBe(13)
  })
})

describe('proje ve onay süresi', () => {
  // Para cinsinden maliyet uydurulmaz.
  it('proje yükünü kişi-gün olarak verir ve maliyet notunu yazar', () => {
    kayit(10, '01'); kayit(11, '01')
    const b = rapor().sections.project_load
    expect(b.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project: 'FPU', person_days: 1 }),
      expect.objectContaining({ project: 'Projesiz', person_days: 1 }),
    ]))
    expect(b.cost_note).toMatch(/saatlik ücret verisi sistemde tutulmuyor/)
  })

  it('onay süresini ortalar ve ölçülemeyeni ayrı sayar', () => {
    db.prepare("INSERT INTO puantaj_period_approvals(period,status,created_at,approved_at) VALUES('2026-03','approved','2026-04-01','2026-04-05')").run()
    db.prepare("INSERT INTO puantaj_period_approvals(period,status,created_at) VALUES('2026-02','approved','2026-03-01')").run()
    const b = rapor().sections.approval_times
    expect(b.average_days).toBe(4)
    expect(b.unmeasured).toBe(1)
  })
})

describe('ayrılma öncesi eğilim', () => {
  it('çıkıştan önceki 60 günün devamsızlık ve iznini sayar', () => {
    db.prepare("UPDATE staff SET exit_date='2026-04-20' WHERE id=10").run()
    kayit(10, '10', 'absent'); kayit(10, '11', 'absent')
    db.prepare("INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,status) VALUES(10,'annual','2026-04-01','2026-04-03','approved')").run()
    const b = rapor().sections.pre_exit_trends
    expect(b.people[0]).toMatchObject({ full_name: 'Ali Veli', absences_60d: 2, leaves_60d: 1 })
  })

  it('dönemde çıkış yoksa boş döner', () => {
    expect(rapor().sections.pre_exit_trends.count).toBe(0)
  })
})

describe('ölçülemeyen bölümler', () => {
  // Ölçülemeyen bölüm gizlenirse rapor olduğundan eksiksiz görünür.
  it('okunamayan bölümleri tek listede toplar', () => {
    const bos = new Database(':memory:')
    bos.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER, project_id INTEGER, exit_date TEXT)')
    const r = buildShiftReport({ period: AY }, bos)
    expect(r.unmeasurable.length).toBeGreaterThan(0)
    expect(r.unmeasurable.every(u => u.reason)).toBe(true)
    bos.close()
  })

  it('bozuk dönemi reddeder', () => {
    expect(() => buildShiftReport({ period: '2026-13' }, db)).toThrow(/Geçersiz dönem/)
  })
})
