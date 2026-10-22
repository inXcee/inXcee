import { getDB } from '../../shared/db/index.js'
import { getSetting, setSetting } from '../email/queries.js'
import { logger } from '../../shared/logger.js'
import { istanbulDate } from '../../shared/time.js'

const DEFAULT_POLICY = `KİŞİSEL VERİLERİN İŞLENMESİ AYDINLATMA METNİ

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla şantiye yönetiminden kişisel verileriniz aşağıda açıklandığı şekilde işlenmektedir.

1) İŞLENEN KİŞİSEL VERİLER
   - Kimlik: ad-soyad, T.C. kimlik no veya pasaport no
   - İletişim: telefon numarası
   - Çalışma: firma, departman, görev unvanı
   - Konaklama: yatakhane oda atamaları, giriş-çıkış tarihleri
   - Diğer: disiplin kayıtları, çamaşır/temizlik talepleri

2) İŞLEME AMACI
   - Şantiye yatakhanesi konaklama yönetimi
   - Kapasite ve oda atama planlaması
   - İş güvenliği ve disiplin takibi
   - Kanuni yükümlülüklerin yerine getirilmesi

3) HUKUKİ SEBEP
   - İş sözleşmesi ve kanuni yükümlülükler (KVKK m.5/2-c, e, f)

4) AKTARIM
   - Yetkili kamu kurumlarına talep halinde
   - Üçüncü taraflara aktarılmaz

5) HAKLARINIZ (KVKK m.11)
   - Verilerinizin işlenip işlenmediğini öğrenme
   - İşlenen verilerinizi öğrenme, düzeltilmesini/silinmesini isteme
   - Verilerinizin yurt dışına aktarımı hakkında bilgi alma
   - Bu hakları kullanmak için yöneticinize yazılı talepte bulunabilirsiniz.

Son güncelleme: ${istanbulDate()}`

export function getKvkkPolicyService() {
  const text = getSetting('kvkk_policy_text')
  return { text: text || DEFAULT_POLICY, is_default: !text }
}

export function setKvkkPolicyService(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    return { error: 'Politika metni en az 50 karakter olmalı', status: 400 }
  }
  setSetting('kvkk_policy_text', text.trim())
  return { ok: true }
}

// KVKK m.11 — silme/anonimleştirme: TC, pasaport, telefon, fotoğraf, acil durum kişisi ve kişiyi
// tanımlanabilir kılan diğer alanlar kalıcı olarak NULL yapılır. Kayıt silinmez (audit/raporlama
// bütünlüğü için); ama kişi artık tanımlanabilir değildir. Küçük bir kampta memleket ve zimmet imzası
// (canvas görüntüsü) kişiyi yeniden tanımlatabildiği için onlar da temizlenir; push aboneliği silinir.
// Yalnızca check-out yapılmış personel anonimleştirilebilir.
export function anonymizePersonnelDataService(personnelId, userId) {
  const db = getDB()
  const id = parseInt(personnelId, 10)
  if (!id) return { error: 'Geçersiz personel ID', status: 400 }

  const p = db.prepare('SELECT id, full_name, check_out_date FROM personnel WHERE id=?').get(id)
  if (!p) return { error: 'Personel bulunamadı', status: 404 }
  if (!p.check_out_date) return { error: 'Sadece çıkış yapmış personel anonimleştirilebilir', status: 400 }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE personnel
      SET full_name = 'Anonim #' || id,
          tc_no = NULL,
          passport_no = NULL,
          phone_number = NULL,
          photo_url = NULL,
          emergency_name = NULL,
          emergency_phone = NULL,
          kiosk_pin = NULL,
          hometown = NULL,
          blacklist_reason = NULL
      WHERE id = ?
    `).run(id)
    // Zimmet kaydı (ne verildi / iade) raporlama için kalır, imza görüntüsü kişisel veridir.
    // (Eskiden olmayan bir 'personnel_notes' tablosu temizlenmeye çalışılıyordu — hiçbir şey yapmıyordu.)
    db.prepare('UPDATE zimmet SET digital_signature = NULL WHERE personnel_id = ?').run(id)
    db.prepare("UPDATE cards SET photo_url = NULL WHERE holder_type = 'personnel' AND holder_id = ?").run(id)
    db.prepare('DELETE FROM push_subscriptions WHERE personnel_id = ?').run(id)
  })
  tx()
  return { ok: true, personnel_id: id, anonymized_at: new Date().toISOString(), by_user_id: userId }
}

// Retention policy: kaç gün çıkış yapmış personelin kişisel verisi
// otomatik anonimleştirilsin. 0 = devre dışı, default 365 gün.
// Setting key: kvkk_retention_days
export function getKvkkRetentionPolicyService() {
  const raw = getSetting('kvkk_retention_days')
  const days = parseInt(raw ?? '0', 10)
  return { enabled: days > 0, days: Number.isFinite(days) ? days : 0 }
}

export function setKvkkRetentionPolicyService(days) {
  const n = parseInt(days, 10)
  if (!Number.isFinite(n) || n < 0 || n > 3650) {
    return { error: 'Retention süresi 0 (devre dışı) ile 3650 gün arası olmalı', status: 400 }
  }
  setSetting('kvkk_retention_days', String(n))
  return { ok: true, days: n, enabled: n > 0 }
}

// Cron tarafından çağrılır: retention süresi geçmiş, henüz anonimleştirilmemiş
// (full_name 'Anonim #' ile başlamayan) personel kayıtlarını anonimleştirir.
// Returns { processed, errors } — sayım ile çağıran cron bildirim yapabilir.
export function enforceKvkkRetentionService() {
  const policy = getKvkkRetentionPolicyService()
  if (!policy.enabled) return { processed: 0, skipped: true, reason: 'disabled' }

  const db = getDB()
  // Adaylar: çıkış yapmış + saklama süresi dolmuş + henüz anonimleştirilmemiş. check_out_date SQLite
  // metni ('YYYY-MM-DD HH:MM:SS'); eskiden ISO ('…T…Z') ile kıyaslanıp sınır günü bütünüyle erken düşüyordu.
  const candidates = db.prepare(`
    SELECT id FROM personnel
    WHERE check_out_date IS NOT NULL
      AND check_out_date < datetime('now', ?)
      AND (full_name IS NULL OR full_name NOT LIKE 'Anonim #%')
  `).all(`-${policy.days} days`)

  let processed = 0, errors = 0
  for (const { id } of candidates) {
    try {
      anonymizePersonnelDataService(id, null)
      processed++
    } catch (e) {
      errors++
      logger.error({ err: e.message, personnelId: id }, '[KVKK retention] anonimleştirme hatası')
    }
  }
  return { processed, errors, candidates: candidates.length, retention_days: policy.days }
}

// Bir personelin tüm kişisel verisini topla
export function exportPersonnelDataService(personnelId) {
  const db = getDB()
  const id = parseInt(personnelId, 10)
  if (!id) return { error: 'Geçersiz personel ID', status: 400 }

  const personnel = db.prepare(`
    SELECT p.*, d.name as department_name
    FROM personnel p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.id = ?
  `).get(id)
  if (!personnel) return { error: 'Personel bulunamadı', status: 404 }

  // Her bölüm ayrı okunur. Okunamayan bölüm artık sessizce boş liste değil: 'eksik_bolumler'de görünür
  // ve loglanır. Eskiden hatalar yutuluyordu; yanlış kolon/tablo adları yüzünden oda atamaları
  // (check_in_at yok → assigned_at), disiplin (discipline_cards yok → discipline_records) ve notlar
  // (personnel_notes tablosu hiç yok) her talepte boş dönüyor, dışa aktarım eksik kalıyordu.
  const eksik = []
  const section = (name, sql) => {
    try { return db.prepare(sql).all(id) } catch (e) {
      eksik.push(name)
      logger.error({ err: e.message, section: name }, '[KVKK export] bölüm okunamadı')
      return []
    }
  }

  return {
    exported_at: new Date().toISOString(),
    personnel,
    room_assignments: section('room_assignments', `
      SELECT ra.id, ra.room_id, r.block, r.room_no, ra.bed_no, ra.assigned_at, ra.check_out_at
      FROM room_assignments ra
      LEFT JOIN rooms r ON r.id = ra.room_id
      WHERE ra.personnel_id = ?
      ORDER BY ra.assigned_at DESC
    `),
    zimmet: section('zimmet', 'SELECT * FROM zimmet WHERE personnel_id = ? ORDER BY created_at DESC'),
    cards: section('cards', `
      SELECT id, card_type, code, status, issued_at, revoked_at, valid_until
      FROM cards WHERE holder_type = 'personnel' AND holder_id = ? ORDER BY issued_at DESC
    `),
    maintenance_requests: section('maintenance_requests',
      'SELECT * FROM maintenance_requests WHERE reporter_personnel_id = ? ORDER BY opened_at DESC'),
    discipline_records: section('discipline_records',
      'SELECT * FROM discipline_records WHERE personnel_id = ? ORDER BY created_at DESC'),
    feedback: section('feedback', 'SELECT * FROM feedback WHERE personnel_id = ? ORDER BY created_at DESC'),
    satisfaction_surveys: section('satisfaction_surveys',
      'SELECT * FROM satisfaction_surveys WHERE personnel_id = ? ORDER BY created_at DESC'),
    inventory_checkouts: section('inventory_checkouts', `
      SELECT ic.*, i.item_name FROM inventory_checkouts ic LEFT JOIN inventory i ON i.id = ic.item_id
      WHERE ic.personnel_id = ? ORDER BY ic.checked_out_at DESC
    `),
    laundry_pickup_requests: section('laundry_pickup_requests',
      'SELECT * FROM laundry_pickup_requests WHERE personnel_id = ? ORDER BY created_at DESC'),
    laundry_card_scans: section('laundry_card_scans',
      'SELECT * FROM laundry_card_scans WHERE personnel_id = ? ORDER BY created_at DESC'),
    // Çamaşır torbası oda bazlıdır: yalnız kişinin O ODADA KALDIĞI süredeki kayıtlar ve başka sakinlere ait
    // olabilecek kişisel alanlar (teslim eden/alan adı, imza, telefon, fotoğraf, not) olmadan. Eskiden
    // kaldığı her odanın TÜM zamanlardaki torbaları, oda arkadaşlarının adı ve imzasıyla dışa aktarılıyordu.
    laundry_items: section('laundry_items', `
      SELECT DISTINCT li.id, r.block, r.room_no, li.status, li.item_count, li.bag_no,
        li.created_at, li.collected_at, li.updated_at
      FROM room_assignments ra
      JOIN laundry_items li ON li.room_id = ra.room_id
        AND li.created_at >= ra.assigned_at
        AND (ra.check_out_at IS NULL OR li.created_at <= ra.check_out_at)
      LEFT JOIN rooms r ON r.id = li.room_id
      WHERE ra.personnel_id = ?
      ORDER BY li.created_at DESC
    `),
    audit_log: section('audit_log',
      "SELECT * FROM audit_log WHERE module='personnel' AND target_id = ? ORDER BY created_at DESC"),
    eksik_bolumler: eksik,
  }
}
