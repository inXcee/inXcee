import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  buildOvertimeOverview, upsertOvertimeBudget, cozulmusButce, dagilimAdaleti, ayAralik,
} from './overtimeBudget.js'

// Faz 9: mesai zinciri (ihtiyaç → ön onay → fiilî çalışma → puantaj) canlıda iki
// ucundan kopuktu ve kopukluk hiçbir yerde görünmüyordu. Bütçe tarafında da onay
// bir tavana karşı verilmiyordu.
//
// Tanımsız tavan "0 tavan" DEĞİLDİR — tavan koymadan aşım ilan etmek yanlış olur.

const AY = '2026-04'
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER, project_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE overtime_records (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      hours REAL, approved_by INTEGER, overtime_request_id INTEGER);
    CREATE TABLE overtime_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      status TEXT, requested_hours REAL, actual_hours REAL);
    CREATE TABLE overtime_budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, scope_id INTEGER,
      period TEXT, monthly_hours REAL, per_person_monthly_hours REAL, yearly_person_hours REAL,
      note TEXT, created_at TEXT, updated_at TEXT);
    CREATE UNIQUE INDEX ux_overtime_budget_scope
      ON overtime_budgets(scope, COALESCE(scope_id, -1), COALESCE(period, ''));
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik');
    INSERT INTO staff(id, full_name, department_id) VALUES (10, 'Ali', 1), (11, 'Ayşe', 1), (12, 'Veli', 2);
  `)
  return d
}

const kayit = (staffId, gun, saat, over = {}) => db.prepare(
  'INSERT INTO overtime_records(staff_id, work_date, hours, approved_by, overtime_request_id) VALUES(?,?,?,?,?)'
).run(staffId, `${AY}-${gun}`, saat, 'approved_by' in over ? over.approved_by : 1, over.request_id ?? null)

const istek = (staffId, gun, saat, status = 'approved') => db.prepare(
  'INSERT INTO overtime_requests(staff_id, work_date, status, requested_hours) VALUES(?,?,?,?)'
).run(staffId, `${AY}-${gun}`, status, saat).lastInsertRowid

const bak = (opts = {}) => buildOvertimeOverview({ period: AY, today: '2026-05-01', ...opts }, db)

beforeEach(() => { db = kur() })

describe('dönem', () => {
  it('ay aralığını artık yıl dahil doğru verir', () => {
    expect(ayAralik('2026-04')).toEqual({ start: '2026-04-01', end: '2026-04-30', days: 30 })
    expect(ayAralik('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29', days: 29 })
  })

  it('bozuk dönemi reddeder', () => {
    expect(() => ayAralik('2026-13')).toThrow(/Geçersiz dönem/)
    expect(() => ayAralik('2026')).toThrow(/Geçersiz dönem/)
  })
})

describe('zincir kopuklukları', () => {
  it('ön onayı olmayan kaydı yetkisiz mesai olarak işaretler', () => {
    kayit(10, '05', 4)
    const r = bak()
    expect(r.chain.record_no_request).toHaveLength(1)
    expect(r.warnings.join(' ')).toMatch(/ön onayı yok/)
  })

  it('onaylı ön onayın fiilî kaydı yoksa bildirir', () => {
    istek(10, '06', 3)
    const r = bak()
    expect(r.chain.approved_no_record[0]).toMatchObject({ work_date: '2026-04-06', requested_hours: 3 })
  })

  // Reddedilmiş ön onayın kaydı olmaması normal; kopukluk sayılmaz.
  it('reddedilmiş ön onayı kopukluk saymaz', () => {
    istek(10, '06', 3, 'rejected')
    expect(bak().chain.approved_no_record).toHaveLength(0)
  })

  it('onaylı saat ile fiilî saat farkını yakalar', () => {
    const id = istek(10, '07', 4)
    kayit(10, '07', 8, { request_id: id })
    expect(bak().chain.hours_mismatch[0]).toMatchObject({ approved_hours: 4, actual_hours: 8, diff: 4 })
  })

  it('saatler eşitse fark yazmaz', () => {
    const id = istek(10, '07', 4)
    kayit(10, '07', 4, { request_id: id })
    expect(bak().chain.hours_mismatch).toHaveLength(0)
  })

  it('onaylayanı olmayan kaydı ayrı sayar', () => {
    kayit(10, '08', 2, { approved_by: null })
    expect(bak().chain.record_no_approver).toHaveLength(1)
  })
})

describe('bütçe', () => {
  // Tavan tanımsızken "aşıldı" demek, tavan koymuş gibi davranmaktır.
  it('tavan tanımsızsa aşım ilan etmez', () => {
    kayit(10, '05', 40)
    const b = bak().budget
    expect(b.known).toBe(false)
    expect(b.used_hours).toBe(40)
    expect(b.exceeded).toBeUndefined()
  })

  it('tavan varsa kalan ve aşımı hesaplar', () => {
    upsertOvertimeBudget({ scope: 'global', monthly_hours: 30 }, db)
    kayit(10, '05', 40)
    expect(bak().budget).toMatchObject({ known: true, limit_hours: 30, used_hours: 40, remaining_hours: -10, exceeded: true })
  })

  it('departman tavanı global tavanı ezer', () => {
    upsertOvertimeBudget({ scope: 'global', monthly_hours: 30 }, db)
    upsertOvertimeBudget({ scope: 'department', scope_id: 1, monthly_hours: 100 }, db)
    expect(bak({ dept_id: 1 }).budget.limit_hours).toBe(100)
  })

  it('aya özel tavan varsayılanı ezer', () => {
    const satirlar = [
      { scope: 'global', scope_id: null, period: null, monthly_hours: 30 },
      { scope: 'global', scope_id: null, period: AY, monthly_hours: 50 },
    ]
    expect(cozulmusButce(satirlar, { period: AY }).monthly_hours).toBe(50)
  })

  it('upsert aynı kapsamı çoğaltmaz, günceller', () => {
    upsertOvertimeBudget({ scope: 'global', monthly_hours: 30 }, db)
    upsertOvertimeBudget({ scope: 'global', monthly_hours: 45 }, db)
    const satirlar = db.prepare("SELECT * FROM overtime_budgets WHERE scope='global'").all()
    expect(satirlar).toHaveLength(1)
    expect(satirlar[0].monthly_hours).toBe(45)
  })

  it('geçersiz kapsam ve negatif saat reddedilir', () => {
    expect(() => upsertOvertimeBudget({ scope: 'takim' }, db)).toThrow(/Geçersiz kapsam/)
    expect(() => upsertOvertimeBudget({ scope: 'department' }, db)).toThrow(/scope_id zorunlu/)
    expect(() => upsertOvertimeBudget({ scope: 'global', monthly_hours: -5 }, db)).toThrow(/sıfırdan küçük/)
  })
})

describe('kişi ve yıllık tavan', () => {
  it('kişi tavanını aşanları listeler', () => {
    upsertOvertimeBudget({ scope: 'global', per_person_monthly_hours: 10 }, db)
    kayit(10, '05', 14); kayit(11, '05', 6)
    const p = bak().person_limit
    expect(p.over).toHaveLength(1)
    expect(p.over[0]).toMatchObject({ full_name: 'Ali', over_by: 4 })
  })

  it('kişi tavanı tanımsızsa bilinmiyor der', () => {
    kayit(10, '05', 99)
    expect(bak().person_limit).toMatchObject({ known: false, over: [] })
  })

  // İş Kanunu m.41 — yılda 270 saat. Aylık pencereye bakarak yakalanamaz.
  it('yıllık sınırı yıl geneline bakarak ölçer', () => {
    upsertOvertimeBudget({ scope: 'global', yearly_person_hours: 270 }, db)
    db.prepare('INSERT INTO overtime_records(staff_id, work_date, hours) VALUES(10, ?, 200)').run('2026-01-15')
    kayit(10, '05', 80)
    const y = bak().yearly_limit
    expect(y.known).toBe(true)
    expect(y.over[0]).toMatchObject({ full_name: 'Ali', hours: 280, over_by: 10 })
  })
})

describe('tahmin ve adalet', () => {
  it('ay bittiyse tahmin değil gerçekleşen döner', () => {
    kayit(10, '05', 10)
    expect(bak({ today: '2026-05-02' }).month_end_forecast).toMatchObject({ complete: true, hours: 10 })
  })

  it('ay içindeyse geçen güne göre uzatır', () => {
    kayit(10, '05', 10)
    expect(bak({ today: '2026-04-10' }).month_end_forecast).toMatchObject({ elapsed_days: 10, total_days: 30, projected: 30 })
  })

  // Başlamamış ay için tahmin uydurulmaz.
  it('dönem başlamadıysa tahmin yapmaz', () => {
    expect(bak({ today: '2026-03-20' }).month_end_forecast).toMatchObject({ known: false })
  })

  it('dağılım adaletini ortancaya oranla verir', () => {
    expect(dagilimAdaleti([2, 4, 20])).toMatchObject({ median: 4, max: 20, max_to_median: 5, people_with_overtime: 3 })
  })

  it('hiç mesai yoksa adalet ölçüsü uydurmaz', () => {
    expect(dagilimAdaleti([])).toMatchObject({ known: false })
    expect(dagilimAdaleti([0, 0])).toMatchObject({ known: false })
  })
})

describe('kapsam ve ölçülemeyen kaynak', () => {
  it('departman filtresi başka departmanı katmaz', () => {
    kayit(10, '05', 5)   // dept 1
    kayit(12, '05', 7)   // dept 2
    expect(bak({ dept_id: 1 }).totals.hours).toBe(5)
    expect(bak().totals.hours).toBe(12)
  })

  it('eksik tabloyu unavailable listesine yazar', () => {
    const bos = new Database(':memory:')
    bos.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, department_id INTEGER, project_id INTEGER)')
    const r = buildOvertimeOverview({ period: AY, today: '2026-05-01' }, bos)
    expect(r.unavailable.map(u => u.source)).toContain('overtime_records')
    expect(r.budget.known).toBe(false)
    bos.close()
  })
})
