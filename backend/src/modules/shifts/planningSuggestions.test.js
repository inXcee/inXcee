import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  buildPlanningSuggestions, comparePlanningScenarios, fairnessReport, adayPuani, STRATEJILER,
} from './planningSuggestions.js'

// Faz 12: boş noktaya kimi koyacağına amir hafızasıyla karar veriyordu; sonuç
// hep aynı birkaç kişiye yığılıyordu. Öneri KARAR DEĞİLDİR — puan gerekçesiyle
// döner. "Aday yok" ile "adaylar engelli" farklı şeylerdir.

const GUN = '2026-05-13'   // Çarşamba
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
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
    CREATE TABLE staff_work_constraints (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER,
      constraint_type TEXT, ref_id INTEGER, note TEXT, valid_from TEXT, valid_to TEXT,
      created_by INTEGER, created_at TEXT);
    CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY, name TEXT, min_staff INTEGER, dept_id INTEGER,
      role_id INTEGER, shift_def_id INTEGER, work_location_id INTEGER, days_of_week TEXT, is_active INTEGER DEFAULT 1);
    INSERT INTO departments(id, name) VALUES (1, 'Temizlik');
    INSERT INTO staff_roles(id, name) VALUES (1, 'Meydancı'), (2, 'Teknisyen');
    INSERT INTO work_locations(id, name) VALUES (1, 'OTC Lokal');
    INSERT INTO shift_definitions(id, name, start_hour, end_hour) VALUES (1, 'Gündüz', '08', '16'), (2, 'Gece', '22', '06');
    INSERT INTO staff(id, full_name, role_id, department_id) VALUES
      (10, 'Ali Veli', 1, 1), (11, 'Ayşe Can', 1, 1), (12, 'Veli Ak', 2, 1);
  `)
  return d
}

const kural = (over = {}) => db.prepare(`
  INSERT INTO shift_coverage_rules(id, name, min_staff, dept_id, role_id, shift_def_id, work_location_id, days_of_week)
  VALUES(?,?,?,?,?,?,?,?)
`).run(over.id ?? 1, over.name ?? 'OTC gündüz', over.min_staff ?? 1, over.dept_id ?? 1,
  over.role_id ?? null, over.shift_def_id ?? 1, over.work_location_id ?? 1, over.days ?? '1,2,3,4,5')

const planla = (staffId, gun, shiftId = 1) => db.prepare(`
  INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, work_location_id, dept_id, status)
  VALUES(?,?,?,1,1,'scheduled')
`).run(staffId, gun, shiftId)

beforeEach(() => { db = kur() })

const oner = (over = {}) => buildPlanningSuggestions({ date: GUN, ...over }, db)

describe('puanlama', () => {
  it('rol uyumu kapsama stratejisinde belirgin fark yaratır', () => {
    const uyan = adayPuani('coverage', { roleMatch: true })
    const uymayan = adayPuani('coverage', { roleMatch: false })
    expect(uyan.score).toBeGreaterThan(uymayan.score)
    expect(uyan.reasons.map(r => r.aciklama)).toContain('rol uyuyor')
  })

  // Adalet stratejisinde çok çalışan geri düşmeli.
  it('adalet stratejisinde son 14 gün ve gece ağır basar', () => {
    const yorgun = adayPuani('fairness', { son14Gun: 10, geceSayisi: 5 })
    const dinlenmis = adayPuani('fairness', { son14Gun: 1 })
    expect(dinlenmis.score).toBeGreaterThan(yorgun.score)
    expect(yorgun.reasons.map(r => r.aciklama)).toContain('son 14 günde 5 gece')
  })

  it('maliyet stratejisinde haftalık süresi yüksek olan geri düşer', () => {
    expect(adayPuani('cost', { haftalikSaat: 44 }).score)
      .toBeLessThan(adayPuani('cost', { haftalikSaat: 8 }).score)
  })

  it('puan 0-100 aralığında kalır', () => {
    expect(adayPuani('fairness', { son14Gun: 100, geceSayisi: 100 }).score).toBe(0)
    expect(adayPuani('coverage', { roleMatch: true }).score).toBeLessThanOrEqual(100)
  })
})

describe('öneri üretimi', () => {
  it('açığı ve adayları gerekçesiyle döner', () => {
    kural({ min_staff: 2 })
    planla(10, GUN)
    const r = oner()
    expect(r.gaps).toHaveLength(1)
    expect(r.gaps[0]).toMatchObject({ required: 2, assigned: 1, missing: 1 })
    expect(r.gaps[0].candidates.length).toBeGreaterThan(0)
    expect(r.gaps[0].candidates[0]).toHaveProperty('reasons')
  })

  it('kapsama tamsa açık üretmez', () => {
    kural({ min_staff: 1 })
    planla(10, GUN)
    expect(oner().gaps).toHaveLength(0)
  })

  // O gün zaten çalışan kişi aday olamaz; engelli sayılıp raporlanır.
  it('engelli adayı öneriye koymaz ama sayar', () => {
    kural({ min_staff: 3 })
    planla(10, GUN)
    const g = oner().gaps[0]
    expect(g.candidates.map(c => c.staff_id)).not.toContain(10)
    expect(g.blocked_count).toBe(1)
  })

  it('aday yoksa ayrıca sayar', () => {
    // min_staff 4: üçü de atanınca açık HÂLÂ var, ama aday havuzu tamamen engelli.
    kural({ min_staff: 4 })
    ;[10, 11, 12].forEach(id => planla(id, GUN))
    const r = oner()
    // Üçü de o gün çalışıyor → hepsi engelli, aday sıfır
    expect(r.summary.no_candidate).toBe(1)
    expect(r.gaps[0].blocked_count).toBe(3)
  })

  it('adalet stratejisi az çalışanı öne alır', () => {
    kural({ min_staff: 1 })
    for (let i = 1; i <= 8; i++) planla(10, `2026-05-${String(i).padStart(2, '0')}`)
    const kapsama = oner({ strategy: 'fairness' }).gaps[0]
    expect(kapsama.candidates[0].staff_id).not.toBe(10)
  })

  it('rol şartlı kuralda rolü uyanı öne alır', () => {
    kural({ min_staff: 1, role_id: 2 })
    const g = oner({ strategy: 'coverage' }).gaps[0]
    expect(g.candidates[0].staff_id).toBe(12)
  })

  it('geçersiz tarih ve strateji reddedilir', () => {
    expect(() => oner({ date: '13.05.2026' })).toThrow(/Geçersiz tarih/)
    expect(() => oner({ strategy: 'rastgele' })).toThrow(/Geçersiz strateji/)
  })

  // Kural tablosu okunamıyorsa "açık yok" denmemeli.
  it('kural tablosu yoksa okunamadığını yazar', () => {
    const bos = new Database(':memory:')
    const r = buildPlanningSuggestions({ date: GUN }, bos)
    expect(r.unavailable.map(u => u.source)).toContain('shift_coverage_rules')
    bos.close()
  })
})

describe('senaryo karşılaştırması', () => {
  it('üç stratejiyi yan yana verir', () => {
    kural({ min_staff: 2 })
    const r = comparePlanningScenarios({ date: GUN }, db)
    expect(r.scenarios.map(s => s.strategy)).toEqual(STRATEJILER)
    expect(r.recommendation.most_filled).toBeTruthy()
  })

  it('kalan açığı ve yığılmayı hesaplar', () => {
    kural({ id: 1, min_staff: 5 })
    const r = comparePlanningScenarios({ date: GUN }, db)
    const s = r.scenarios[0]
    expect(s.fills).toBe(3)          // havuzda 3 kişi var
    expect(s.remaining).toBe(2)
    expect(s.stacked).toBe(0)
  })

  // Öneri karar değildir; hangi ölçüte göre önerildiği yazılmalı.
  it('önerinin ölçütünü açıkça yazar', () => {
    kural({ min_staff: 1 })
    expect(comparePlanningScenarios({ date: GUN }, db).recommendation.note).toMatch(/karar değildir/)
  })
})

describe('adalet raporu', () => {
  it('kişi başına vardiya, gece ve hafta sonu sayar', () => {
    planla(10, '2026-05-11'); planla(10, '2026-05-16', 2); planla(11, '2026-05-12')
    const r = fairnessReport({ start: '2026-05-11', end: '2026-05-17' }, db)
    const ali = r.people.find(p => p.staff_id === 10)
    expect(ali).toMatchObject({ shifts: 2, nights: 1, weekends: 1 })
  })

  it('dağılımın ortanca ve tepe oranını verir', () => {
    for (let i = 11; i <= 15; i++) planla(10, `2026-05-${i}`)
    planla(11, '2026-05-11')
    const d = fairnessReport({ start: '2026-05-11', end: '2026-05-17' }, db).distribution
    expect(d.shifts).toMatchObject({ max: 5, min: 1, median: 3 })
  })

  // Boş dönem "adalet sağlanmış" demek değildir.
  it('kayıt yoksa ölçülemez der', () => {
    const r = fairnessReport({ start: '2026-05-11', end: '2026-05-17' }, db)
    expect(r.measurable).toBe(false)
    expect(r.reason).toMatch(/çizelge kaydı yok/)
  })

  it('çizelge okunamıyorsa ölçemediğini söyler', () => {
    const bos = new Database(':memory:')
    const r = fairnessReport({ start: '2026-05-11', end: '2026-05-17' }, bos)
    expect(r.available).toBe(false)
    bos.close()
  })

  it('bozuk aralığı reddeder', () => {
    expect(() => fairnessReport({ start: 'x', end: GUN }, db)).toThrow(/Geçersiz tarih/)
  })
})
