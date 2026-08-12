import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  resolveScan, recordScan, findLaundryCard, getCardSettings, setCardSetting,
  roomOccupants, listScanIssues, scanStats, SONUC, AKSIYON,
} from './cardScan.js'

// Çamaşır kart sistemi: torbayı kimin bıraktığı elle yazılan bir isimdi, kimin
// aldığı ekrana atılan bir imzaydı — ikisi de kimliği doğrulamıyordu.
//
// Üç kural bu dosyanın omurgası:
//   1. Eşleşmeyen kart işlemi durdurmaz ama KAYDA GEÇER (yakalanmak istenen bu)
//   2. Zorunluluk kilit değil kapıdır: kartsız kalana gerekçeli geçiş
//   3. Ayar okunamazsa "zorunlu" sayılmaz — yoksa tek okuma hatası teslimatı durdurur

const BUGUN = '2026-06-15'
let db

const kur = () => {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE staff (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE personnel (id INTEGER PRIMARY KEY, full_name TEXT);
    CREATE TABLE rooms (id INTEGER PRIMARY KEY, block TEXT, room_no TEXT);
    CREATE TABLE room_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, personnel_id INTEGER,
      room_id INTEGER, check_out_at TEXT);
    CREATE TABLE laundry_items (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER);
    CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT, holder_type TEXT, holder_id INTEGER,
      card_type TEXT, code TEXT UNIQUE, nfc_uid TEXT UNIQUE, status TEXT DEFAULT 'active',
      issued_at TEXT, issued_by INTEGER, revoked_at TEXT, valid_until TEXT, photo_url TEXT);
    CREATE TABLE laundry_global_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE laundry_card_scans (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER,
      action TEXT, result TEXT, card_id INTEGER, scanned_code TEXT, personnel_id INTEGER,
      room_id INTEGER, override_reason TEXT, operator_user_id INTEGER, operator_worker_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(id, full_name) VALUES (1, 'Müdür');
    INSERT INTO personnel(id, full_name) VALUES (10, 'Ali Veli'), (11, 'Ayşe Can'), (12, 'Veli Ak');
    INSERT INTO rooms(id, block, room_no) VALUES (5, 'M1', '101'), (6, 'M1', '102');
    INSERT INTO room_assignments(personnel_id, room_id) VALUES (10, 5), (11, 5), (12, 6);
    INSERT INTO cards(holder_type, holder_id, card_type, code, nfc_uid) VALUES
      ('personnel', 10, 'laundry', 'AVS-C:ALI', '04AABBCC'),
      ('personnel', 12, 'laundry', 'AVS-C:VELI', NULL),
      ('personnel', 10, 'access',  'AVS-A:ALI', NULL);
    INSERT INTO laundry_items(id, room_id) VALUES (77, 5);
  `)
  return d
}

beforeEach(() => { db = kur() })

const zorunluYap = (action = AKSIYON.DELIVERY) => setCardSetting(action, true, db)
const coz = (over = {}) => resolveScan({ action: AKSIYON.DELIVERY, room_id: 5, today: BUGUN, ...over }, db)

describe('ayarlar', () => {
  it('varsayılan kapalıdır', () => {
    expect(getCardSettings(db)).toMatchObject({ available: true, intake_required: false, delivery_required: false })
  })

  it('iki işlem ayrı ayrı açılır', () => {
    setCardSetting(AKSIYON.INTAKE, true, db)
    const a = getCardSettings(db)
    expect(a.intake_required).toBe(true)
    expect(a.delivery_required).toBe(false)
  })

  it('geçersiz işlem türü reddedilir', () => {
    expect(() => setCardSetting('baska', true, db)).toThrow(/Geçersiz işlem/)
    expect(() => coz({ action: 'baska' })).toThrow(/Geçersiz işlem/)
  })

  // Okunamayan ayarı "zorunlu" saymak tek bir hatada bütün teslimatı durdurur.
  it('ayar tablosu okunamazsa zorunlu saymaz ve bunu bildirir', () => {
    const bos = new Database(':memory:')
    const a = getCardSettings(bos)
    expect(a).toMatchObject({ available: false, intake_required: false, delivery_required: false })
    expect(a.reason).toMatch(/okunamadı/)
    bos.close()
  })
})

describe('kart bulma', () => {
  it('QR kodundan bulur', () => {
    expect(findLaundryCard('AVS-C:ALI', db)).toMatchObject({ personnel_id: 10, full_name: 'Ali Veli' })
  })

  it('NFC UID ile bulur', () => {
    expect(findLaundryCard('04aabbcc', db)?.personnel_id).toBe(10)
  })

  // Giriş kartı çamaşır kapısını açmamalı.
  it('başka tipteki kartı çamaşır kartı saymaz', () => {
    expect(findLaundryCard('AVS-A:ALI', db)).toBeNull()
  })

  it('boş ve tanınmayan değerde null döner', () => {
    expect(findLaundryCard('', db)).toBeNull()
    expect(findLaundryCard('  ', db)).toBeNull()
    expect(findLaundryCard('ZZZ', db)).toBeNull()
  })
})

describe('kart okutma kapalıyken', () => {
  it('kartsız işleme izin verir, kayıt üretmez', () => {
    const r = coz({ scanned_code: null })
    expect(r).toMatchObject({ allowed: true, required: false, scan: null })
  })

  // Kapalıyken bile okutulan kart doğrulanır: bilgi kaybolmasın.
  it('kart okutulursa yine de doğrular ve kaydeder', () => {
    const r = coz({ scanned_code: 'AVS-C:ALI' })
    expect(r).toMatchObject({ allowed: true, code: 'ok' })
    expect(r.scan.result).toBe(SONUC.OK)
  })

  it('kapalıyken tanınmayan kart işlemi durdurmaz', () => {
    expect(coz({ scanned_code: 'ZZZ' })).toMatchObject({ allowed: true, code: 'unknown_card' })
  })
})

describe('kart okutma zorunluyken', () => {
  beforeEach(() => zorunluYap())

  it('kartsız ve gerekçesiz işlemi durdurur', () => {
    const r = coz({ scanned_code: null })
    expect(r).toMatchObject({ allowed: false, required: true, code: 'card_required' })
    expect(r.message).toMatch(/gerekçe/)
  })

  // Kilit değil kapı: kartını kaybeden sakin yüzünden çamaşırhane durmamalı.
  it('gerekçeyle geçişe izin verir ve gerekçeyi kaydeder', () => {
    const r = coz({ scanned_code: null, override_reason: 'Kart kayıp, kimlikle doğrulandı' })
    expect(r.allowed).toBe(true)
    expect(r.scan).toMatchObject({ result: SONUC.OVERRIDE, override_reason: 'Kart kayıp, kimlikle doğrulandı' })
  })

  // Gerekçe alanına nokta koyup geçmek, gerekçe istememekle aynı şey olurdu.
  it('anlamsız kısa gerekçeyi kabul etmez', () => {
    expect(coz({ scanned_code: null, override_reason: '.' }).allowed).toBe(false)
    expect(coz({ scanned_code: null, override_reason: '  ' }).allowed).toBe(false)
  })

  it('tanınmayan kartta işlemi durdurur ama denemeyi kaydeder', () => {
    const r = coz({ scanned_code: 'ZZZ' })
    expect(r.allowed).toBe(false)
    expect(r.scan).toMatchObject({ result: SONUC.UNKNOWN, scanned_code: 'ZZZ' })
  })

  it('iptal ve kayıp kartı ayrı ayrı söyler', () => {
    db.prepare("UPDATE cards SET status='lost' WHERE code='AVS-C:ALI'").run()
    expect(coz({ scanned_code: 'AVS-C:ALI' }).message).toMatch(/kayıp/)

    db.prepare("UPDATE cards SET status='revoked' WHERE code='AVS-C:ALI'").run()
    const r = coz({ scanned_code: 'AVS-C:ALI' })
    expect(r.message).toMatch(/iptal/)
    expect(r).toMatchObject({ allowed: false, code: 'inactive_card' })
  })

  it('süresi dolmuş kartı reddeder, süresi geçmemişi kabul eder', () => {
    db.prepare("UPDATE cards SET valid_until='2026-01-01' WHERE code='AVS-C:ALI'").run()
    expect(coz({ scanned_code: 'AVS-C:ALI' }).allowed).toBe(false)

    db.prepare("UPDATE cards SET valid_until='2027-01-01' WHERE code='AVS-C:ALI'").run()
    expect(coz({ scanned_code: 'AVS-C:ALI' }).allowed).toBe(true)
  })
})

describe('kart sahibi eşleşmesi', () => {
  // Asıl yakalanmak istenen durum: başkasının torbasını alan kişi.
  it('başka odanın sakini okutursa uyarır ama işlemi durdurmaz', () => {
    zorunluYap()
    const r = coz({ scanned_code: 'AVS-C:VELI', room_id: 5 })   // Veli 6 numaralı odada
    expect(r.allowed).toBe(true)
    expect(r.code).toBe('mismatch')
    expect(r.scan.result).toBe(SONUC.MISMATCH)
    expect(r.message).toMatch(/Veli Ak/)
  })

  it('odanın sakini okutursa temiz geçer', () => {
    expect(coz({ scanned_code: 'AVS-C:ALI', room_id: 5 }).code).toBe('ok')
  })

  // Çıkış yapmış sakin artık o odanın sakini değildir.
  it('odadan çıkmış sakini eşleşme saymaz', () => {
    db.prepare("UPDATE room_assignments SET check_out_at='2026-06-01' WHERE personnel_id=10").run()
    expect(coz({ scanned_code: 'AVS-C:ALI', room_id: 5 }).code).toBe('mismatch')
  })

  // Oda kaydı hiç yoksa eşleşme ölçülemez; kişiyi suçlamak yanlış olur.
  it('odada kayıtlı sakin yoksa eşleşmeme uyarısı vermez', () => {
    db.exec('DELETE FROM room_assignments')
    expect(coz({ scanned_code: 'AVS-C:ALI', room_id: 5 }).code).toBe('ok')
    expect(roomOccupants(5, db)).toEqual([])
  })

  it('okunamayan atama tablosu çökmeye yol açmaz', () => {
    const bos = new Database(':memory:')
    expect(roomOccupants(5, bos)).toEqual([])
    bos.close()
  })
})

describe('kayıt ve raporlama', () => {
  it('okutmayı kaydeder ve amir listesinde gösterir', () => {
    const r = coz({ scanned_code: 'AVS-C:VELI', room_id: 5 })
    recordScan(r.scan, { item_id: 77, operator_user_id: 1 }, db)

    const liste = listScanIssues({}, db)
    expect(liste.available).toBe(true)
    expect(liste.items).toHaveLength(1)
    expect(liste.items[0]).toMatchObject({ result: SONUC.MISMATCH, card_holder_name: 'Veli Ak', block: 'M1', room_no: '101' })
  })

  // Sorunsuz okutmalar amir listesini doldurmamalı.
  it('temiz okutmalar sorun listesine girmez', () => {
    const r = coz({ scanned_code: 'AVS-C:ALI', room_id: 5 })
    recordScan(r.scan, { item_id: 77 }, db)
    expect(listScanIssues({}, db).items).toHaveLength(0)
  })

  it('kayıt yoksa çağrı sessizce geçer', () => {
    expect(recordScan(null, { item_id: 77 }, db)).toBeNull()
  })

  it('istatistiği sonuca göre kırar', () => {
    recordScan(coz({ scanned_code: 'AVS-C:ALI' }).scan, { item_id: 77 }, db)
    recordScan(coz({ scanned_code: 'AVS-C:VELI' }).scan, { item_id: 77 }, db)
    const s = scanStats({}, db)
    expect(s).toMatchObject({ available: true, total: 2, ok: 1, mismatch: 1, success_ratio: 0.5 })
  })

  // Hiç okutma yokken "%100 başarılı" demek yanlış olur.
  it('okutma yoksa başarı oranı uydurmaz', () => {
    expect(scanStats({}, db)).toMatchObject({ total: 0, success_ratio: null })
  })

  // Boş liste "sorun yok" diye okunur; okunamadığını söylemek gerekir.
  it('tablo okunamazsa boş liste değil gerekçe döner', () => {
    const bos = new Database(':memory:')
    expect(listScanIssues({}, bos)).toMatchObject({ available: false, items: [] })
    expect(scanStats({}, bos).available).toBe(false)
    bos.close()
  })
})
