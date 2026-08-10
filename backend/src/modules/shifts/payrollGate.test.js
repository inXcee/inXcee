import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { evaluatePayrollGate, buildOutputStamp, isIsoMonth } from './payrollGate.js'

// Faz 5: banka dosyası ve kesin bordro, dönem hazır olmasa da üretilebiliyordu.
// Canlıda önceki aylarda 1299 gün hâlâ "planlı"; o aylardan biri için dosya
// çekilirse eksik ödeme çıkar ve bu geri alınması en zor hatalardan biridir.

const AY = '2026-06'
let db

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT, status TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE overtime_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT, status TEXT);
    CREATE TABLE shift_swap_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester_id INTEGER, swap_date TEXT, status TEXT);
    CREATE TABLE puantaj_period_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT, status TEXT);
    CREATE TABLE period_locks (period TEXT PRIMARY KEY, locked_by INTEGER, locked_at TEXT, note TEXT);
  `)
})

// Varsayılan: her şey hazır. Testler tek tek bozup engeli görüyor.
beforeEach(() => {
  db.exec(`DELETE FROM shift_schedule; DELETE FROM leave_requests; DELETE FROM overtime_requests;
           DELETE FROM shift_swap_requests; DELETE FROM puantaj_period_approvals; DELETE FROM period_locks;`)
  db.prepare("INSERT INTO puantaj_period_approvals(period, status) VALUES(?, 'approved')").run(AY)
  db.prepare('INSERT INTO period_locks(period) VALUES(?)').run(AY)
})

const kontrol = (kapi, key) => kapi.checks.find(c => c.key === key)

describe('ay doğrulaması', () => {
  it('YYYY-MM bekler', () => {
    expect(isIsoMonth('2026-06')).toBe(true)
    expect(isIsoMonth('2026-6')).toBe(false)
    expect(() => evaluatePayrollGate('bozuk', db)).toThrow(/YYYY-MM/)
  })
})

describe('kapı — hazır durum', () => {
  it('tüm koşullar sağlanınca hazır', () => {
    const kapi = evaluatePayrollGate(AY, db)
    expect(kapi.ready).toBe(true)
    expect(kapi.blocking).toEqual([])
    expect(kapi.checks.every(c => c.status === 'ok')).toBe(true)
  })

  it('her kontrolde etiket ve düzeltme yolu var', () => {
    evaluatePayrollGate(AY, db).checks.forEach(c => {
      expect(c.label).toBeTruthy()
      expect(c.action?.route, `${c.key} için yönlendirme yok`).toBeTruthy()
    })
  })
})

describe('kapı — engeller', () => {
  it('kapanmamış gün varsa engeller', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(1,'2026-06-15','scheduled')").run()
    const kapi = evaluatePayrollGate(AY, db)
    expect(kapi.ready).toBe(false)
    expect(kapi.blocking).toContain('unclosed_days')
    expect(kontrol(kapi, 'unclosed_days').count).toBe(1)
  })

  // Ayın dışındaki kapanmamış gün bu dönemi engellememeli.
  it('başka ayın kapanmamış günü bu dönemi engellemez', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(1,'2026-05-15','scheduled')").run()
    expect(evaluatePayrollGate(AY, db).ready).toBe(true)
  })

  it('kapanmış gün engel değildir', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id, work_date, status) VALUES(1,'2026-06-15','worked')").run()
    expect(evaluatePayrollGate(AY, db).ready).toBe(true)
  })

  // Aya DEĞEN izin talebi de sayılmalı: 25 Mayıs–5 Haziran talebi haziranı etkiler.
  it('aya taşan bekleyen izin talebini yakalar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,'2026-05-25','2026-06-05','pending')").run()
    expect(evaluatePayrollGate(AY, db).blocking).toContain('pending_leave')
  })

  it('bekleyen mesai ve takas engeller', () => {
    db.prepare("INSERT INTO overtime_requests(staff_id,work_date,status) VALUES(1,'2026-06-10','pending')").run()
    db.prepare("INSERT INTO shift_swap_requests(requester_id,swap_date,status) VALUES(1,'2026-06-11','pending')").run()
    const kapi = evaluatePayrollGate(AY, db)
    expect(kapi.blocking).toEqual(expect.arrayContaining(['pending_overtime', 'pending_swap']))
  })

  // Burada SIFIR olmak engeldir — diğer kontrollerin tersi.
  it('departman onayı yoksa engeller', () => {
    db.prepare('DELETE FROM puantaj_period_approvals').run()
    const kapi = evaluatePayrollGate(AY, db)
    expect(kapi.blocking).toContain('department_approval')
    expect(kontrol(kapi, 'department_approval').detail).toMatch(/Hiçbir departman onayı yok/)
  })

  it('dönem kilitli değilse engeller', () => {
    db.prepare('DELETE FROM period_locks').run()
    expect(evaluatePayrollGate(AY, db).blocking).toContain('period_lock')
  })

  // Ölçemediğimiz koşulu "geçti" saymak kapıyı anlamsız kılar.
  it('tablo yoksa hazır demez, unknown bildirir', () => {
    const bos = new Database(':memory:')
    const kapi = evaluatePayrollGate(AY, bos)
    expect(kapi.ready).toBe(false)
    expect(kapi.unknown.length).toBeGreaterThan(0)
    bos.close()
  })
})

describe('çıktı damgası', () => {
  const an = new Date(2026, 5, 30, 14, 5, 9)

  it('kesin çıktı KESİN etiketi ve K ile başlayan numara taşır', () => {
    const damga = buildOutputStamp({ month: AY, userName: 'Müdür', kind: 'final', now: an })
    expect(damga.label).toBe('KESİN')
    expect(damga.verification_no).toMatch(/^K-202606-20260630140509$/)
    expect(damga.generated_by).toBe('Müdür')
    expect(damga.month).toBe(AY)
  })

  it('taslak çıktı TASLAK etiketi ve T ile başlayan numara taşır', () => {
    const damga = buildOutputStamp({ month: AY, userName: 'Müdür', kind: 'draft', now: an })
    expect(damga.label).toBe('TASLAK')
    expect(damga.verification_no).toMatch(/^T-/)
  })

  // İki dosya aynı numarayı taşırsa doğrulama numarasının anlamı kalmaz.
  it('farklı zamanlarda farklı numara üretir', () => {
    const a = buildOutputStamp({ month: AY, kind: 'final', now: new Date(2026, 5, 30, 14, 5, 9) })
    const b = buildOutputStamp({ month: AY, kind: 'final', now: new Date(2026, 5, 30, 14, 5, 10) })
    expect(a.verification_no).not.toBe(b.verification_no)
  })

  it('kullanıcı adı yoksa bilinmiyor yazar', () => {
    expect(buildOutputStamp({ month: AY, kind: 'draft', now: an }).generated_by).toBe('bilinmiyor')
  })
})
