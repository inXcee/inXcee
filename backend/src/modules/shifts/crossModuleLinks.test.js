import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildCrossModuleLinks } from './crossModuleLinks.js'

// Faz 14: vardiya, servis ve yemekhane aynı insanları konuşuyor ama birbirine
// bakmıyordu. Kaynak yoksa SIFIR gösterilmez — "0 eksik" ile "servis o gün hiç
// kullanılmamış" bambaşka şeylerdir ve ikincisi bir eylem gerektirir.

const GUN = '2026-05-13'
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT, pickup_point_id INTEGER, exit_date TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE shift_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT);
    CREATE TABLE attendance_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_schedule_id INTEGER);
    CREATE TABLE transport_trips (id INTEGER PRIMARY KEY, work_date TEXT, direction TEXT, status TEXT);
    CREATE TABLE transport_trip_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id INTEGER,
      staff_id INTEGER, stop_id INTEGER, status TEXT, boarded_at TEXT);
    CREATE TABLE meal_selections (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, meal_date TEXT,
      meal_type TEXT, attending INTEGER);
    INSERT INTO shift_definitions(id, name) VALUES (1, 'Gündüz');
    INSERT INTO staff(id, full_name) VALUES (10, 'Ali Veli'), (11, 'Ayşe Can'), (12, 'Veli Ak');
  `)
  return d
}

const planla = (staffId, status = 'scheduled', gun = GUN) => db.prepare(
  "INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, status) VALUES(?,?,1,?)"
).run(staffId, gun, status)

const sefer = (id = 1) => db.prepare("INSERT INTO transport_trips(id, work_date, direction, status) VALUES(?,?, 'to_site', 'published')").run(id, GUN)
const servis = (staffId, over = {}) => db.prepare(
  'INSERT INTO transport_trip_assignments(trip_id, staff_id, boarded_at) VALUES(?,?,?)'
).run(over.trip_id ?? 1, staffId, over.boarded_at ?? null)

const bag = () => buildCrossModuleLinks({ date: GUN }, db)

beforeEach(() => { db = kur() })

describe('vardiya ↔ servis', () => {
  // Servis o gün hiç planlanmamışsa "herkes eksik" demek yanlış olur.
  it('servis seferi yoksa ölçülemez der, herkesi eksik saymaz', () => {
    planla(10); planla(11)
    const t = bag().links.transport
    expect(t.measurable).toBe(false)
    expect(t.reason).toMatch(/servis seferi\/ataması girilmemiş/)
  })

  it('çizelgede olup servise yazılmayanı listeler', () => {
    planla(10); planla(11)
    sefer(); servis(10)
    const t = bag().links.transport
    expect(t.measurable).toBe(true)
    expect(t.working_without_transport.items).toEqual([
      expect.objectContaining({ staff_id: 11, full_name: 'Ayşe Can' }),
    ])
  })

  // Servise yazılı ama o gün çalışmıyor → boş koltuk.
  it('servise yazılı olup çalışmayanı listeler', () => {
    planla(10)
    sefer(); servis(10); servis(12)
    expect(bag().links.transport.transport_without_shift.items).toEqual([
      expect.objectContaining({ staff_id: 12 }),
    ])
  })

  it('iptal seferi saymaz', () => {
    planla(10)
    db.prepare("INSERT INTO transport_trips(id, work_date, direction, status) VALUES(9, ?, 'to_site', 'cancelled')").run(GUN)
    servis(10, { trip_id: 9 })
    expect(bag().links.transport.measurable).toBe(false)
  })
})

describe('vardiya ↔ yemek', () => {
  it('yemek seçimi yoksa ölçülemez der', () => {
    planla(10)
    const m = bag().links.meals
    expect(m.measurable).toBe(false)
    expect(m.reason).toMatch(/yemek seçimi girilmemiş/)
    expect(m.working).toBe(1)
  })

  it('öğün bazında katılım ve farkı verir', () => {
    planla(10); planla(11)
    db.prepare("INSERT INTO meal_selections(staff_id, meal_date, meal_type, attending) VALUES(10,?, 'lunch',1)").run(GUN)
    const m = bag().links.meals
    expect(m.by_type).toEqual([{ type: 'lunch', selected: 1, attending: 1, gap: 1 }])
    expect(m.working_without_selection.items).toEqual([expect.objectContaining({ staff_id: 11 })])
  })
})

describe('devam kanıtı', () => {
  // Canlıda bu kaynak boş; "0 devamsız" en tehlikeli sessiz sıfır.
  it('turnike kaydı hiç yoksa ölçülemez der', () => {
    planla(10)
    const a = bag().links.attendance
    expect(a.measurable).toBe(false)
    expect(a.reason).toMatch(/hiç akmıyor/)
    expect(a.source_rows).toBe(0)
  })

  it('kaynak doluysa o günün kanıt sayısını verir', () => {
    planla(10)
    const ss = db.prepare('SELECT id FROM shift_schedule LIMIT 1').get()
    db.prepare('INSERT INTO attendance_logs(shift_schedule_id) VALUES(?)').run(ss.id)
    const a = bag().links.attendance
    expect(a).toMatchObject({ measurable: true, source_rows: 1, with_evidence: 1 })
  })
})

describe('birleşik risk', () => {
  it('servise binmeyip devamsız olanı kesişimde verir', () => {
    planla(10, 'absent'); planla(11)
    sefer(); servis(10); servis(11, { boarded_at: '2026-05-13 07:00' })
    const r = bag().links.combined_risk
    expect(r.measurable).toBe(true)
    expect(r.both.items).toEqual([expect.objectContaining({ staff_id: 10 })])
  })

  // Servis ölçülemiyorsa kesişim de ölçülemez; 0 demek yanlış olurdu.
  it('servis ölçülemiyorsa birleşik risk de ölçülemez', () => {
    planla(10, 'absent')
    const r = bag().links.combined_risk
    expect(r.measurable).toBe(false)
    expect(r.reason).toMatch(/Servis tarafı ölçülemediği için/)
  })
})

describe('işten çıkış → gelecek vardiya', () => {
  it('ayrılmış kişinin gelecek vardiyasını yakalar', () => {
    db.prepare("UPDATE staff SET exit_date='2026-05-01' WHERE id=10").run()
    planla(10, 'scheduled', '2026-05-20')
    planla(10, 'scheduled', '2026-05-21')
    const e = bag().links.exited_future
    expect(e.count).toBe(1)
    expect(e.people.items[0]).toMatchObject({ staff_id: 10, first_shift: '2026-05-20', days: 2 })
  })

  it('çıkıştan önceki vardiyayı sorun saymaz', () => {
    db.prepare("UPDATE staff SET exit_date='2026-05-20' WHERE id=10").run()
    planla(10, 'scheduled', '2026-05-10')
    expect(bag().links.exited_future.count).toBe(0)
  })
})

describe('taban okunamazsa', () => {
  // Taban yoksa tek tek "0" demek yanıltıcı olur; hepsi ölçülemez.
  it('çizelge okunamıyorsa tüm bağlar ölçülemez döner', () => {
    const bos = new Database(':memory:')
    const r = buildCrossModuleLinks({ date: GUN }, bos)
    expect(r.unmeasurable).toEqual(['transport', 'meals', 'attendance', 'combined_risk', 'exited_future'])
    Object.values(r.links).forEach(l => expect(l.reason).toMatch(/Çizelge okunamadı/))
    bos.close()
  })

  it('bozuk tarihi reddeder', () => {
    expect(() => buildCrossModuleLinks({ date: '13.05.2026' }, db)).toThrow(/Geçersiz tarih/)
  })
})
