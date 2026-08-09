import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getWeekVersion, publishWeek, withdrawWeek, diffSincePublish, isIsoDate } from './scheduleVersions.js'

// Faz 2: bugün çizelgedeki her hücre değişikliği anında bağlayıcı sayılıyor,
// "yayınlandı" diye bir an yok. Bu yüzden yayından sonraki değişiklik de kimseye
// bildirilmiyor. Yayın anında fotoğraf alınır; fark ondan hesaplanır.

const HAFTA = '2026-08-10'
let db

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE shift_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER, work_date TEXT,
      shift_def_id INTEGER, status TEXT, leave_type TEXT, work_location_id INTEGER);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO users(id, full_name) VALUES (1, 'Müdür');
    INSERT INTO staff(id, full_name) VALUES (10, 'Ali Veli'), (11, 'Ayşe Demir'), (12, 'Can Öz'), (13, 'Deniz Ak');
    INSERT INTO shift_definitions(id, name) VALUES (1, 'Gündüz'), (2, 'Gece');
  `)
  const mig = join(dirname(fileURLToPath(import.meta.url)), '../../shared/db/migrations/093_schedule_versions.sql')
  db.exec(readFileSync(mig, 'utf-8'))
})

beforeEach(() => {
  db.exec('DELETE FROM schedule_version_entries; DELETE FROM schedule_versions; DELETE FROM shift_schedule;')
})

const satirEkle = (staffId, date, shiftDefId = 1, status = 'scheduled') =>
  db.prepare('INSERT INTO shift_schedule(staff_id, work_date, shift_def_id, status) VALUES(?,?,?,?)')
    .run(staffId, date, shiftDefId, status)

describe('hafta doğrulaması', () => {
  it('ISO tarih bekler', () => {
    expect(isIsoDate('2026-08-10')).toBe(true)
    expect(isIsoDate('10.08.2026')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('geçersiz hafta 400 ile reddedilir', () => {
    expect(() => publishWeek('bozuk', 1, {}, db)).toThrow(/Geçersiz hafta/)
    expect(() => getWeekVersion('bozuk', db)).toThrow(/Geçersiz hafta/)
  })
})

describe('yayınlama', () => {
  it('hiç yayınlanmamış hafta taslaktır ve fark null döner', () => {
    // "Fark yok" ile "hiç yayınlanmadı" aynı şey değil.
    const durum = getWeekVersion(HAFTA, db)
    expect(durum).toMatchObject({ status: 'draft', version: 0, published_at: null })
    expect(durum.changes).toBeNull()
  })

  it('yayınlar ve sürümü 1 yapar', () => {
    satirEkle(10, '2026-08-10')
    satirEkle(11, '2026-08-12')
    const sonuc = publishWeek(HAFTA, 1, { note: 'İlk yayın' }, db)
    expect(sonuc).toMatchObject({ version: 1, status: 'published', entries: 2 })

    const durum = getWeekVersion(HAFTA, db)
    expect(durum.status).toBe('published')
    expect(durum.note).toBe('İlk yayın')
    expect(durum.published_by_name).toBe('Müdür')
  })

  // Boş hafta yayınlamak personele "bu hafta çalışmıyorsunuz" demektir.
  it('boş hafta yayınlanamaz', () => {
    expect(() => publishWeek(HAFTA, 1, {}, db)).toThrow(/boş hafta yayınlanamaz/i)
  })

  it('her yayın sürümü artırır', () => {
    satirEkle(10, '2026-08-10')
    expect(publishWeek(HAFTA, 1, {}, db).version).toBe(1)
    expect(publishWeek(HAFTA, 1, {}, db).version).toBe(2)
  })

  // Haftanın 7 günü kapsanmalı; 8. gün başka haftanın işi.
  it('yalnız o haftanın günlerini fotoğraflar', () => {
    satirEkle(10, '2026-08-09')   // önceki gün
    satirEkle(11, '2026-08-10')   // hafta başı
    satirEkle(12, '2026-08-16')   // hafta sonu (7. gün)
    satirEkle(13, '2026-08-17')   // sonraki hafta
    expect(publishWeek(HAFTA, 1, {}, db).entries).toBe(2)
  })
})

describe('yayından beri değişiklikler', () => {
  it('yayın yokken null', () => {
    satirEkle(10, '2026-08-10')
    expect(diffSincePublish(HAFTA, db)).toBeNull()
  })

  it('değişiklik yoksa sıfır sayar', () => {
    satirEkle(10, '2026-08-10')
    publishWeek(HAFTA, 1, {}, db)
    expect(diffSincePublish(HAFTA, db)).toMatchObject({ total: 0, added: [], changed: [], removed: [] })
  })

  it('eklenen satırı yakalar', () => {
    satirEkle(10, '2026-08-10')
    publishWeek(HAFTA, 1, {}, db)
    satirEkle(11, '2026-08-11')
    const fark = diffSincePublish(HAFTA, db)
    expect(fark.total).toBe(1)
    expect(fark.added[0]).toMatchObject({ staff_id: 11, work_date: '2026-08-11' })
  })

  it('silinen satırı yakalar', () => {
    satirEkle(10, '2026-08-10')
    satirEkle(11, '2026-08-11')
    publishWeek(HAFTA, 1, {}, db)
    db.prepare('DELETE FROM shift_schedule WHERE staff_id = 11').run()
    const fark = diffSincePublish(HAFTA, db)
    expect(fark.total).toBe(1)
    expect(fark.removed[0]).toMatchObject({ staff_id: 11 })
  })

  // Vardiya değişimi "eklenen + silinen" değil, DEĞİŞEN sayılmalı; yoksa tek
  // düzeltme iki satır gibi görünür.
  it('vardiya değişimini değişen sayar, önce/sonra taşır', () => {
    satirEkle(10, '2026-08-10', 1)
    publishWeek(HAFTA, 1, {}, db)
    db.prepare('UPDATE shift_schedule SET shift_def_id = 2 WHERE staff_id = 10').run()
    const fark = diffSincePublish(HAFTA, db)
    expect(fark.total).toBe(1)
    expect(fark.added).toEqual([])
    expect(fark.changed[0].before.shift_def_id).toBe(1)
    expect(fark.changed[0].after.shift_def_id).toBe(2)
  })

  it('izne çevirmeyi de değişiklik sayar', () => {
    satirEkle(10, '2026-08-10', 1, 'scheduled')
    publishWeek(HAFTA, 1, {}, db)
    db.prepare("UPDATE shift_schedule SET status='on_leave', leave_type='annual' WHERE staff_id=10").run()
    expect(diffSincePublish(HAFTA, db).changed).toHaveLength(1)
  })

  // Sayı tek başına yetmiyor: "3 değişiklik" görüp kimin etkilendiğini
  // bilmeyen planlayıcı yine çizelgeyi taramak zorunda kalıyordu.
  it('farkta personel adı ve vardiya adı gelir', () => {
    satirEkle(10, '2026-08-10', 1)
    publishWeek(HAFTA, 1, {}, db)
    satirEkle(11, '2026-08-11', 2)
    db.prepare('UPDATE shift_schedule SET shift_def_id = 2 WHERE staff_id = 10').run()

    const fark = diffSincePublish(HAFTA, db)
    expect(fark.added[0]).toMatchObject({ full_name: 'Ayşe Demir', shift_name: 'Gece' })
    expect(fark.changed[0].before).toMatchObject({ full_name: 'Ali Veli', shift_name: 'Gündüz' })
    expect(fark.changed[0].after).toMatchObject({ full_name: 'Ali Veli', shift_name: 'Gece' })
  })

  it('silinen satırda da isim gelir', () => {
    satirEkle(12, '2026-08-10', 1)
    publishWeek(HAFTA, 1, {}, db)
    db.prepare('DELETE FROM shift_schedule WHERE staff_id = 12').run()
    expect(diffSincePublish(HAFTA, db).removed[0]).toMatchObject({ full_name: 'Can Öz' })
  })

  // Silinmiş personel kaydı isim çözümünü patlatmamalı; sayı yine doğru olmalı.
  it('adı bulunamayan personel numarayla gösterilir', () => {
    satirEkle(999, '2026-08-10', 1)
    publishWeek(HAFTA, 1, {}, db)
    satirEkle(998, '2026-08-11', 1)
    expect(diffSincePublish(HAFTA, db).added[0].full_name).toBe('#998')
  })

  it('yeniden yayınlayınca fark sıfırlanır', () => {
    satirEkle(10, '2026-08-10')
    publishWeek(HAFTA, 1, {}, db)
    satirEkle(11, '2026-08-11')
    expect(diffSincePublish(HAFTA, db).total).toBe(1)
    publishWeek(HAFTA, 1, {}, db)
    expect(diffSincePublish(HAFTA, db).total).toBe(0)
  })
})

describe('yayından geri çekme', () => {
  it('geri çekince hafta taslağa döner', () => {
    satirEkle(10, '2026-08-10')
    publishWeek(HAFTA, 1, {}, db)
    expect(withdrawWeek(HAFTA, 1, db)).toMatchObject({ status: 'withdrawn', version: 1 })

    const durum = getWeekVersion(HAFTA, db)
    expect(durum.status).toBe('draft')
    expect(durum.published_at).toBeNull()
    // Geri çekilen sürüm artık karşılaştırma tabanı değil.
    expect(durum.changes).toBeNull()
  })

  it('yayında olmayan hafta geri çekilemez', () => {
    expect(() => withdrawWeek(HAFTA, 1, db)).toThrow(/yayında değil/i)
  })

  it('geri çekilen haftada yeniden yayın sürümü artırır', () => {
    satirEkle(10, '2026-08-10')
    publishWeek(HAFTA, 1, {}, db)
    withdrawWeek(HAFTA, 1, db)
    expect(publishWeek(HAFTA, 1, {}, db).version).toBe(2)
  })
})
