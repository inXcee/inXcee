import { getDB } from '../../shared/db/index.js'
import { getSetting, setSetting } from '../email/queries.js'

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

Son güncelleme: ${new Date().toISOString().split('T')[0]}`

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

  // Tüm ilişkili veriler — try/catch yetmediğinde tablonun yokluğuna karşı dirençli
  const safe = (sql, params = []) => {
    try { return db.prepare(sql).all(...params) } catch { return [] }
  }

  return {
    exported_at: new Date().toISOString(),
    personnel,
    room_assignments: safe(`
      SELECT ra.*, r.block, r.room_no
      FROM room_assignments ra
      LEFT JOIN rooms r ON r.id = ra.room_id
      WHERE ra.personnel_id = ?
      ORDER BY ra.check_in_at DESC
    `, [id]),
    maintenance_requests: safe(`
      SELECT * FROM maintenance_requests WHERE reporter_personnel_id = ? ORDER BY opened_at DESC
    `, [id]),
    discipline_records: safe(`
      SELECT * FROM discipline_cards WHERE personnel_id = ? ORDER BY issued_at DESC
    `, [id]),
    laundry_items: safe(`
      SELECT li.* FROM laundry_items li
      LEFT JOIN room_assignments ra ON ra.room_id = li.room_id
      WHERE ra.personnel_id = ?
    `, [id]),
    notes: safe(`
      SELECT * FROM personnel_notes WHERE personnel_id = ? ORDER BY created_at DESC
    `, [id]),
    audit_log: safe(`
      SELECT * FROM audit_log WHERE module='personnel' AND target_id = ? ORDER BY created_at DESC
    `, [id]),
  }
}
