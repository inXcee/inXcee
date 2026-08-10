import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildActionCenter, actionSummary, zamanDilimi, onemDerecesi } from './actionCenter.js'

// Faz 3: aynı sorunlar farklı ekranlara dağılmış; kimse hepsini birden görmüyor.
// Toplayıcının iki kritik davranışı var:
//  1) geçmiş/gelecek ayrımı — gelecek tarihli plan eksiği "kritik" değil
//  2) ölçülemeyen kaynak sessizce 0 katkı vermez

const BUGUN = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const gunEkle = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let db

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, is_active INTEGER DEFAULT 1, exit_date TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT);
    CREATE TABLE leave_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, leave_type TEXT,
      start_date TEXT, end_date TEXT, status TEXT);
    CREATE TABLE overtime_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      requested_hours REAL, status TEXT);
    CREATE TABLE shift_swap_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester_id INTEGER,
      swap_date TEXT, status TEXT);
    CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, expires_on TEXT, archived_at TEXT);
    INSERT INTO staff(id, full_name, is_active) VALUES (1,'Ali Veli',1), (2,'Ayşe Demir',1), (3,'Ayrılan Kişi',0);
  `)
})

beforeEach(() => {
  db.exec(`DELETE FROM shift_schedule; DELETE FROM leave_requests; DELETE FROM overtime_requests;
           DELETE FROM shift_swap_requests; DELETE FROM documents;`)
})

const bul = (rapor, kind) => rapor.items.filter(i => i.kind === kind)

describe('zaman dilimi ve önem', () => {
  it('geçmiş gecikmiş, bugün bugün, ileri gelecek', () => {
    expect(zamanDilimi(gunEkle(-1), BUGUN)).toBe('overdue')
    expect(zamanDilimi(BUGUN, BUGUN)).toBe('today')
    expect(zamanDilimi(gunEkle(1), BUGUN)).toBe('future')
    expect(zamanDilimi('bozuk', BUGUN)).toBe('unknown')
  })

  // "1000 kritik eksik" gibi sayılar tam da bu ayrım yapılmadığı için çıkıyor.
  it('gelecek tarihli sorun kritik sayılmaz', () => {
    expect(onemDerecesi('overdue')).toBe('critical')
    expect(onemDerecesi('future')).toBe('info')
    expect(onemDerecesi('today', 'critical')).toBe('critical')
    expect(onemDerecesi('today', 'warning')).toBe('warning')
  })
})

describe('onay bekleyen talepler', () => {
  it('izin, mesai ve takas taleplerini toplar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status,leave_type) VALUES(1,?,?,'pending','annual')").run(BUGUN, BUGUN)
    db.prepare("INSERT INTO overtime_requests(staff_id,work_date,requested_hours,status) VALUES(1,?,3,'pending')").run(BUGUN)
    db.prepare("INSERT INTO shift_swap_requests(requester_id,swap_date,status) VALUES(2,?,'pending')").run(BUGUN)

    const rapor = buildActionCenter({ from: BUGUN, to: BUGUN }, db)
    expect(bul(rapor, 'pending_leave')).toHaveLength(1)
    expect(bul(rapor, 'pending_overtime')).toHaveLength(1)
    expect(bul(rapor, 'pending_swap')).toHaveLength(1)
    expect(bul(rapor, 'pending_leave')[0].staff_name).toBe('Ali Veli')
  })

  it('onaylanmış talepleri listelemez', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,?,?,'approved')").run(BUGUN, BUGUN)
    expect(bul(buildActionCenter({ from: BUGUN, to: BUGUN }, db), 'pending_leave')).toHaveLength(0)
  })

  it('geçmiş tarihli bekleyen talep kritik olur', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,?,?,'pending')").run(gunEkle(-3), gunEkle(-2))
    expect(bul(buildActionCenter({}, db), 'pending_leave')[0].severity).toBe('critical')
  })
})

describe('izin / vardiya çakışması', () => {
  // Personel izinli olduğunu bilip gelmiyor, çizelgede ise çalışıyor görünüyor.
  it('onaylı izin gününe yazılmış vardiyayı yakalar', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,?,?,'approved')").run(BUGUN, BUGUN)
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,?,1,'scheduled')").run(BUGUN)

    const cakisma = bul(buildActionCenter({ from: BUGUN, to: BUGUN }, db), 'leave_conflict')
    expect(cakisma).toHaveLength(1)
    expect(cakisma[0].severity).toBe('critical')
  })

  // Hücre zaten "izinli" işaretliyse çakışma yok.
  it('izinli olarak işaretlenmiş hücreyi çakışma saymaz', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,?,?,'approved')").run(BUGUN, BUGUN)
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,status) VALUES(1,?,'on_leave')").run(BUGUN)
    expect(bul(buildActionCenter({ from: BUGUN, to: BUGUN }, db), 'leave_conflict')).toHaveLength(0)
  })
})

describe('diğer kaynaklar', () => {
  it('vardiya tanımı olmayan kaydı bildirir', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,?,NULL,'scheduled')").run(BUGUN)
    expect(bul(buildActionCenter({ from: BUGUN, to: BUGUN }, db), 'missing_shift_def')).toHaveLength(1)
  })

  // Gelecek tarihli olsa da kritiktir: sahada olmayacak birine güveniliyor.
  it('ayrılan personele yazılmış gelecek vardiya kritiktir', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(3,?,1,'scheduled')").run(gunEkle(5))
    const kayit = bul(buildActionCenter({ from: BUGUN, to: gunEkle(7) }, db), 'exited_future_shift')
    expect(kayit).toHaveLength(1)
    expect(kayit[0].severity).toBe('critical')
  })

  it('süresi dolmuş belgeyi kişi başına tek satır yapar', () => {
    db.prepare('INSERT INTO documents(staff_id,expires_on) VALUES(1,?), (1,?)').run(gunEkle(-10), gunEkle(-5))
    const kayit = bul(buildActionCenter({}, db), 'expired_document')
    expect(kayit).toHaveLength(1)
    expect(kayit[0].date).toBe(gunEkle(-10))   // en eski süre bitişi
  })

  it('süresi dolmamış belge listelenmez', () => {
    db.prepare('INSERT INTO documents(staff_id,expires_on) VALUES(1,?)').run(gunEkle(30))
    expect(bul(buildActionCenter({}, db), 'expired_document')).toHaveLength(0)
  })
})

describe('kapanmamış puantaj', () => {
  // Puantaj ekranı yalnız SEÇİLİ aya bakıyor; önceki aylardan devreden
  // kapanmamış günler hiçbir yerde görünmüyordu (canlıda 1299 gün).
  it('geçmişte kalmış planlı günleri AY BAZINDA toplar', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,'2026-06-10',1,'scheduled')").run()
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(2,'2026-06-11',1,'scheduled')").run()
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,'2026-05-02',1,'scheduled')").run()

    const kayitlar = bul(buildActionCenter({}, db), 'unclosed_timesheet')
    expect(kayitlar).toHaveLength(2)                       // iki ay, 3 satır değil
    const haziran = kayitlar.find(k => k.detail.includes('2026-06'))
    expect(haziran.detail).toMatch(/2 gün/)
    expect(haziran.staff_name).toBe('2 personel')
    expect(haziran.severity).toBe('critical')
  })

  // 1299 kaydı tek tek listelemek aksiyon listesini boğar ve asıl acilleri gizler.
  it('satır satır listelemez, ay başına tek satır verir', () => {
    for (let i = 1; i <= 40; i += 1) {
      db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(?, '2026-06-15',1,'scheduled')").run(i)
    }
    expect(bul(buildActionCenter({}, db), 'unclosed_timesheet')).toHaveLength(1)
  })

  // Gelecek tarihli plan kapanmamış sayılmaz — "1000 kritik eksik" tam da bu
  // ayrım yapılmadığı için çıkıyor.
  it('gelecek tarihli planlı günü saymaz', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,?,1,'scheduled')").run(gunEkle(5))
    expect(bul(buildActionCenter({}, db), 'unclosed_timesheet')).toHaveLength(0)
  })

  it('kesinleşmiş günleri saymaz', () => {
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(1,'2026-06-10',1,'worked')").run()
    expect(bul(buildActionCenter({}, db), 'unclosed_timesheet')).toHaveLength(0)
  })
})

describe('sıralama, özet ve ölçülemeyen kaynak', () => {
  it('kritikler üstte sıralanır', () => {
    db.prepare("INSERT INTO leave_requests(staff_id,start_date,end_date,status) VALUES(1,?,?,'pending')").run(gunEkle(5), gunEkle(6))
    db.prepare("INSERT INTO shift_schedule(staff_id,work_date,shift_def_id,status) VALUES(3,?,1,'scheduled')").run(gunEkle(2))
    const rapor = buildActionCenter({ from: BUGUN, to: gunEkle(7) }, db)
    expect(rapor.items[0].severity).toBe('critical')
  })

  it('özet önem ve zaman dilimine göre sayar', () => {
    const ozet = actionSummary([
      { severity: 'critical', timeframe: 'overdue' },
      { severity: 'warning', timeframe: 'today' },
      { severity: 'info', timeframe: 'future' },
    ])
    expect(ozet).toMatchObject({ total: 3, critical: 1, warning: 1, info: 1, overdue: 1, today: 1, future: 1 })
  })

  it('her kayıtta düzeltme yolu var', () => {
    db.prepare("INSERT INTO overtime_requests(staff_id,work_date,status) VALUES(1,?,'pending')").run(BUGUN)
    buildActionCenter({ from: BUGUN, to: BUGUN }, db).items.forEach(i => {
      expect(i.action?.route, `${i.kind} için yönlendirme yok`).toBeTruthy()
      expect(i.key).toBeTruthy()
    })
  })

  // Boş liste "sorun yok" sanılmasın: tablo yoksa açıkça bildirilir.
  it('tablo yoksa sessiz kalmaz, unavailable listeler', () => {
    const bos = new Database(':memory:')
    const rapor = buildActionCenter({}, bos)
    expect(rapor.items).toEqual([])
    expect(rapor.unavailable.length).toBeGreaterThan(0)
    expect(rapor.unavailable[0]).toHaveProperty('source')
    bos.close()
  })

  it('ters tarih aralığı 400 verir', () => {
    expect(() => buildActionCenter({ from: gunEkle(5), to: BUGUN }, db)).toThrow(/Başlangıç bitişten sonra/)
  })
})
