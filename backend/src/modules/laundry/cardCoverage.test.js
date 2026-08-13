import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { cardCoverage, setCardSetting, AKSIYON } from './cardScan.js'

// Canlıda kart zorunluluğu açıldı ve SIFIR kart vardı; kimse fark etmedi. Ayar
// ekranı "kartlar dağıtıldı mı?" diye soruyordu — soru cevaplanabilir, ölçüm
// yalan söylemez. Bu testler ölçümün doğru saydığını ve ölçemediğinde
// "tam" demediğini tutar.

let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE personnel (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE rooms (id INTEGER PRIMARY KEY, block TEXT, room_no TEXT);
    CREATE TABLE room_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, personnel_id INTEGER,
      room_id INTEGER, check_out_at TEXT);
    CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, holder_type TEXT, holder_id INTEGER,
      card_type TEXT, code TEXT UNIQUE, status TEXT DEFAULT 'active');
    CREATE TABLE laundry_global_settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO personnel(id, full_name) VALUES (1,'Ali'), (2,'Ayşe'), (3,'Veli');
    INSERT INTO rooms(id, block, room_no) VALUES (5,'M1','101');
    INSERT INTO room_assignments(personnel_id, room_id) VALUES (1,5), (2,5), (3,5);
  `)
  return d
}

const kartVer = (pid, status = 'active') => db.prepare(
  "INSERT INTO cards(holder_type, holder_id, card_type, code, status) VALUES('personnel',?,'laundry',?,?)"
).run(pid, `AVS-C:${pid}${status}`, status)

beforeEach(() => { db = kur() })

describe('kart kapsamı', () => {
  it('kartsızları sayar ve kim olduklarını söyler', () => {
    kartVer(1)
    const k = cardCoverage(db)
    expect(k).toMatchObject({ available: true, residents: 3, with_card: 1, without_card: 2 })
    expect(k.missing.map(m => m.full_name).sort()).toEqual(['Ayşe', 'Veli'])
    expect(k.missing[0].room).toBe('M1-101')
  })

  it('herkeste kart varsa oran tam olur', () => {
    ;[1, 2, 3].forEach(p => kartVer(p))
    expect(cardCoverage(db)).toMatchObject({ without_card: 0, ratio: 1 })
  })

  // İptal/kayıp kart kapsam saymaz — elinde çalışmayan kart olan kişi kartsızdır.
  it('iptal edilmiş kartı kapsam saymaz', () => {
    kartVer(1, 'revoked')
    kartVer(2, 'lost')
    expect(cardCoverage(db).without_card).toBe(3)
  })

  // Odadan çıkmış kişiye kart verilmiyor; kapsam da onu saymamalı.
  it('çıkış yapmış sakini kapsam dışında tutar', () => {
    db.prepare("UPDATE room_assignments SET check_out_at='2026-01-01' WHERE personnel_id=3").run()
    kartVer(1); kartVer(2)
    expect(cardCoverage(db)).toMatchObject({ residents: 2, without_card: 0, ratio: 1 })
  })

  // Asıl yakalanmak istenen durum: açık zorunluluk + eksik kart.
  it('zorunluluk açıkken eksik kartı uyarı olarak verir', () => {
    setCardSetting(AKSIYON.DELIVERY, true, db)
    const k = cardCoverage(db)
    expect(k.warnings.join(' ')).toMatch(/3 sakinin kartı yok/)
    expect(k.delivery_required).toBe(true)
  })

  it('zorunluluk kapalıyken eksik kart uyarı üretmez', () => {
    expect(cardCoverage(db).warnings).toEqual([])
  })

  // Sakin yoksa "%100 kapsandı" demek yanlış olur.
  it('aktif sakin yoksa oran uydurmaz', () => {
    db.exec('DELETE FROM room_assignments')
    const k = cardCoverage(db)
    expect(k.ratio).toBeNull()
    expect(k.warnings.join(' ')).toMatch(/kapsam ölçülemiyor/)
  })

  // Ölçülemeyen kapsamı "tam" saymak, tam da kaçırılan hatayı tekrar eder.
  it('okunamazsa tam saymaz, elle doğrulama ister', () => {
    const bos = new Database(':memory:')
    const k = cardCoverage(bos)
    expect(k.available).toBe(false)
    expect(k.warnings.join(' ')).toMatch(/elle doğrulayın/)
    bos.close()
  })
})
