import { getDB } from '../../shared/db/index.js'
import { normalizeNfcUid } from '../../shared/nfc.js'

// Çamaşır kart sistemi — okutma çözümlemesi.
//
// Torbayı kimin bıraktığı elle yazılan bir isimdi, kimin aldığı ekrana atılan
// bir imzaydı. İkisi de "bu kişi gerçekten o mu" sorusunu cevaplamıyordu.
//
// Buradaki üç kural feature'ın tamamını taşıyor:
//
//  1. EŞLEŞMEME SESSİZ GEÇMEZ. Okutulan kart başkasınınsa (mismatch) işlem
//     bloklanmaz ama kayda geçer — zaten yakalanmak istenen durum bu. Sessizce
//     kabul etmek, kart okutmayı tamamen anlamsız kılardı.
//
//  2. ZORUNLULUK KİLİT DEĞİL, KAPIDIR. Kart zorunluyken kartsız kalan sakin
//     için gerekçeli geçiş var. Sabah 07:00'de kartını kaybeden biri yüzünden
//     çamaşırhane duracaksa, sistem ilk gün kapatılır. Ama geçiş kayıtsız
//     değildir: kim, neden geçti yazılır.
//
//  3. AYAR OKUNAMAZSA ZORUNLU SAYILMAZ. Ayar tablosu okunamadığında "zorunlu"
//     varsaymak, bir okuma hatasında bütün teslimatı durdurur. Kapalı sayıp
//     durumu bildirmek doğrusu.

export const SONUC = {
  OK: 'ok',
  MISMATCH: 'mismatch',
  UNKNOWN: 'unknown_card',
  INACTIVE: 'inactive',
  OVERRIDE: 'override',
}

export const AKSIYON = { INTAKE: 'intake', DELIVERY: 'delivery' }

const AYAR_ANAHTARI = {
  [AKSIYON.INTAKE]: 'card_required_intake',
  [AKSIYON.DELIVERY]: 'card_required_delivery',
}

// Kart kodu ön eki: giriş AVS-A:, yemek AVS-M:, çamaşır AVS-C:
export const CAMASIR_KART_ONEKI = 'AVS-C:'

export function getCardSettings(db = getDB()) {
  try {
    const satirlar = db.prepare(
      "SELECT key, value FROM laundry_global_settings WHERE key IN ('card_required_intake', 'card_required_delivery')"
    ).all()
    const harita = Object.fromEntries(satirlar.map(r => [r.key, r.value]))
    return {
      available: true,
      intake_required: harita.card_required_intake === '1',
      delivery_required: harita.card_required_delivery === '1',
    }
  } catch (err) {
    // Okunamayan ayarı "zorunlu" saymak, tek bir okuma hatasında bütün
    // teslimatı gerekçe girmeye zorlar.
    return {
      available: false,
      reason: `Kart ayarları okunamadı: ${err.message}`,
      intake_required: false,
      delivery_required: false,
    }
  }
}

export function setCardSetting(action, required, db = getDB()) {
  const anahtar = AYAR_ANAHTARI[action]
  if (!anahtar) throw Object.assign(new Error('Geçersiz işlem türü'), { statusCode: 400 })
  db.prepare(`
    INSERT INTO laundry_global_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(anahtar, required ? '1' : '0')
  return getCardSettings(db)
}

// Okutulan değer QR kodu ("AVS-C:xxxx") ya da NFC UID olabilir; kiosk hangisini
// aldığını bilmek zorunda kalmasın diye ikisi de aynı kapıdan girer.
export function findLaundryCard(raw, db = getDB()) {
  const metin = String(raw || '').trim()
  if (!metin) return null

  const kodla = db.prepare(`
    SELECT c.*, p.full_name, p.id AS personnel_id
    FROM cards c LEFT JOIN personnel p ON p.id = c.holder_id AND c.holder_type = 'personnel'
    WHERE c.card_type = 'laundry' AND c.code = ?
  `).get(metin)
  if (kodla) return kodla

  const uid = normalizeNfcUid(metin)
  if (!uid) return null
  return db.prepare(`
    SELECT c.*, p.full_name, p.id AS personnel_id
    FROM cards c LEFT JOIN personnel p ON p.id = c.holder_id AND c.holder_type = 'personnel'
    WHERE c.card_type = 'laundry' AND c.nfc_uid = ?
  `).get(uid) || null
}

function kartAktifMi(kart, bugun) {
  if (kart.status !== 'active') return false
  if (kart.valid_until && kart.valid_until < bugun) return false
  return true
}

// Odanın o anki sakinleri: çıkış yapmamış atamalar.
export function roomOccupants(roomId, db = getDB()) {
  if (!roomId) return []
  try {
    return db.prepare(`
      SELECT p.id, p.full_name
      FROM room_assignments ra JOIN personnel p ON p.id = ra.personnel_id
      WHERE ra.room_id = ? AND ra.check_out_at IS NULL
    `).all(roomId)
  } catch {
    return []   // tablo okunamazsa eşleşme "bilinmiyor" olarak ele alınır
  }
}

/**
 * Okutmayı çözümler ve NE YAPILMASI gerektiğini söyler — kaydetmez.
 * Kaydetme çağıran tarafta, asıl işlemle aynı transaction içinde yapılır ki
 * "okutma kaydedildi ama teslim yazılmadı" durumu oluşmasın.
 */
export function resolveScan({
  action, room_id, scanned_code = null, override_reason = null, today = null,
} = {}, db = getDB()) {
  if (!Object.values(AKSIYON).includes(action)) {
    throw Object.assign(new Error('Geçersiz işlem türü'), { statusCode: 400 })
  }
  const ayarlar = getCardSettings(db)
  const zorunlu = action === AKSIYON.INTAKE ? ayarlar.intake_required : ayarlar.delivery_required
  const bugun = today || new Date().toLocaleDateString('sv-SE')
  const gerekce = String(override_reason || '').trim()

  // ── Kart okutulmamış ──────────────────────────────────────────────────────
  if (!String(scanned_code || '').trim()) {
    if (!zorunlu) {
      return { allowed: true, required: false, scan: null, message: 'Kart okutma kapalı' }
    }
    if (gerekce.length >= 3) {
      return {
        allowed: true,
        required: true,
        scan: { action, result: SONUC.OVERRIDE, room_id, override_reason: gerekce },
        message: 'Kartsız geçildi — gerekçe kaydedildi',
      }
    }
    return {
      allowed: false,
      required: true,
      code: 'card_required',
      // Kullanıcıya ne yapacağını söyle: ya okut ya gerekçe yaz.
      message: 'Bu işlem için çamaşır kartı okutulmalı. Kart yoksa en az 3 karakterlik gerekçe girin.',
    }
  }

  // ── Kart okutulmuş ────────────────────────────────────────────────────────
  const kart = findLaundryCard(scanned_code, db)

  if (!kart) {
    return {
      allowed: !zorunlu,
      required: zorunlu,
      code: 'unknown_card',
      scan: { action, result: SONUC.UNKNOWN, room_id, scanned_code: String(scanned_code).trim() },
      message: 'Bu kart sistemde kayıtlı bir çamaşır kartı değil',
    }
  }

  if (!kartAktifMi(kart, bugun)) {
    return {
      allowed: !zorunlu,
      required: zorunlu,
      code: 'inactive_card',
      scan: {
        action, result: SONUC.INACTIVE, room_id, card_id: kart.id,
        scanned_code: String(scanned_code).trim(), personnel_id: kart.personnel_id,
      },
      message: kart.status === 'lost' ? 'Bu kart kayıp olarak işaretli'
        : kart.status === 'revoked' ? 'Bu kart iptal edilmiş'
          : 'Bu kartın geçerlilik süresi dolmuş',
    }
  }

  const sakinler = roomOccupants(room_id, db)
  const sakinMi = sakinler.some(s => Number(s.id) === Number(kart.personnel_id))

  // Eşleşmeme işlemi DURDURMAZ ama kayda geçer: yakalanmak istenen tam olarak
  // "başkasının torbasını alan kişi". Amir sonradan listeden görür.
  if (sakinler.length > 0 && !sakinMi) {
    return {
      allowed: true,
      required: zorunlu,
      code: 'mismatch',
      scan: {
        action, result: SONUC.MISMATCH, room_id, card_id: kart.id,
        scanned_code: String(scanned_code).trim(), personnel_id: kart.personnel_id,
      },
      card: { id: kart.id, holder_name: kart.full_name, personnel_id: kart.personnel_id },
      message: `Dikkat: ${kart.full_name || 'kart sahibi'} bu odanın sakini değil — işlem kaydedildi`,
    }
  }

  return {
    allowed: true,
    required: zorunlu,
    code: 'ok',
    scan: {
      action, result: SONUC.OK, room_id, card_id: kart.id,
      scanned_code: String(scanned_code).trim(), personnel_id: kart.personnel_id,
    },
    card: { id: kart.id, holder_name: kart.full_name, personnel_id: kart.personnel_id },
    message: kart.full_name ? `${kart.full_name} doğrulandı` : 'Kart doğrulandı',
  }
}

// Çözümleme sonucunu kaydeder. Asıl işlemle AYNI transaction içinde çağrılmalı.
export function recordScan(scan, { item_id, operator_user_id = null, operator_worker_id = null } = {}, db = getDB()) {
  if (!scan) return null
  const bilgi = db.prepare(`
    INSERT INTO laundry_card_scans
      (item_id, action, result, card_id, scanned_code, personnel_id, room_id,
       override_reason, operator_user_id, operator_worker_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    item_id ?? null, scan.action, scan.result, scan.card_id ?? null,
    scan.scanned_code ?? null, scan.personnel_id ?? null, scan.room_id ?? null,
    scan.override_reason ?? null, operator_user_id, operator_worker_id)
  return bilgi.lastInsertRowid
}

// Amir ekranı: dikkat gerektiren okutmalar (eşleşmeyen, tanınmayan, gerekçeli).
export function listScanIssues({ from = null, to = null, limit = 100 } = {}, db = getDB()) {
  const kosul = ["s.result != 'ok'"]
  const params = []
  if (from) { kosul.push('s.created_at >= ?'); params.push(from) }
  if (to) { kosul.push('s.created_at <= ?'); params.push(`${to} 23:59:59`) }

  try {
    const items = db.prepare(`
      SELECT s.*, p.full_name AS card_holder_name, r.block, r.room_no,
             u.full_name AS operator_name, w.full_name AS worker_name
      FROM laundry_card_scans s
      LEFT JOIN personnel p ON p.id = s.personnel_id
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN users u ON u.id = s.operator_user_id
      LEFT JOIN staff w ON w.id = s.operator_worker_id
      WHERE ${kosul.join(' AND ')}
      ORDER BY s.created_at DESC
      LIMIT ?
    `).all(...params, Number(limit) || 100)
    return { available: true, items }
  } catch (err) {
    // Boş liste "sorun yok" diye okunur; okunamadığını söylemek gerekir.
    return { available: false, reason: `Okutma kayıtları okunamadı: ${err.message}`, items: [] }
  }
}

export function scanStats({ from = null, to = null } = {}, db = getDB()) {
  const kosul = []
  const params = []
  if (from) { kosul.push('created_at >= ?'); params.push(from) }
  if (to) { kosul.push('created_at <= ?'); params.push(`${to} 23:59:59`) }
  const where = kosul.length ? `WHERE ${kosul.join(' AND ')}` : ''

  try {
    const satirlar = db.prepare(`SELECT result, COUNT(*) AS adet FROM laundry_card_scans ${where} GROUP BY result`).all(...params)
    const harita = Object.fromEntries(satirlar.map(r => [r.result, r.adet]))
    const toplam = satirlar.reduce((t, r) => t + r.adet, 0)
    return {
      available: true,
      total: toplam,
      ok: harita.ok || 0,
      mismatch: harita.mismatch || 0,
      unknown_card: harita.unknown_card || 0,
      inactive: harita.inactive || 0,
      override: harita.override || 0,
      // Hiç okutma yoksa "%100 başarılı" demek yanlış olur.
      success_ratio: toplam > 0 ? Number(((harita.ok || 0) / toplam).toFixed(3)) : null,
    }
  } catch (err) {
    return { available: false, reason: `Okutma istatistiği okunamadı: ${err.message}` }
  }
}
