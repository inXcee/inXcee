import { getDB } from '../../shared/db/index.js'
import { addRecord } from './queries.js'
import { logAudit } from '../../shared/audit.js'
import { createNotification } from '../../shared/notifications/service.js'

// N1 — Disiplin otomasyon kuralları (günlük cron):
//   A) Son 30 günde 3+ sarı kart → otomatik 1 kırmızı (30 günde en fazla 1 kez tetiklenir)
//   B) 90 gün temiz + puanı > 0 → 1 puan af (audit_log guard ile 90 günde en fazla 1 kez)
export const AUTO_RED_REASON = 'Otomatik: 30 gün içinde 3 sarı kart'
export const AMNESTY_DETAIL = '90 gün temiz — 1 disiplin puanı silindi'

export function runDisciplineAutomation() {
  const db = getDB()
  const systemUser = db.prepare("SELECT id FROM users WHERE role='campus_manager' ORDER BY id LIMIT 1").get()
  if (!systemUser) return { auto_red: 0, amnesty: 0 }

  let autoRed = 0
  let amnesty = 0

  // ── Kural A: 30 günde 3 sarı → 1 kırmızı ──
  const redCandidates = db.prepare(`
    SELECT p.id, p.full_name,
      (SELECT COUNT(*) FROM discipline_records
        WHERE personnel_id = p.id AND card_type = 'yellow'
          AND created_at >= datetime('now', '-30 days')) as yellow30,
      (SELECT COUNT(*) FROM discipline_records
        WHERE personnel_id = p.id AND card_type = 'red' AND reason = ?
          AND created_at >= datetime('now', '-30 days')) as autored30
    FROM personnel p
    WHERE p.check_out_date IS NULL
  `).all(AUTO_RED_REASON).filter(r => r.yellow30 >= 3 && r.autored30 === 0)

  redCandidates.forEach(c => {
    addRecord({ personnelId: c.id, cardType: 'red', reason: AUTO_RED_REASON, createdBy: systemUser.id })
    logAudit(systemUser.id, 'discipline_auto_red', 'discipline', c.id, `${c.full_name}: ${AUTO_RED_REASON}`)
    createNotification({
      message: `🟥 Otomatik kırmızı kart: ${c.full_name} — son 30 günde 3 sarı`,
      type: 'critical', module: 'discipline', target_role: 'campus_manager',
      dedup_key: `auto_red_${c.id}_${new Date().toISOString().slice(0, 10)}`,
    })
    autoRed += 1
  })

  // ── Kural B: 90 gün temiz → 1 puan af ──
  const amnestyCandidates = db.prepare(`
    SELECT p.id, p.full_name, p.discipline_points
    FROM personnel p
    WHERE p.check_out_date IS NULL AND p.discipline_points > 0
      AND NOT EXISTS (
        SELECT 1 FROM discipline_records
        WHERE personnel_id = p.id AND created_at >= datetime('now', '-90 days'))
      AND NOT EXISTS (
        SELECT 1 FROM audit_log
        WHERE action = 'discipline_amnesty' AND module = 'discipline' AND target_id = p.id
          AND created_at >= datetime('now', '-90 days'))
  `).all()

  amnestyCandidates.forEach(c => {
    db.prepare('UPDATE personnel SET discipline_points = discipline_points - 1 WHERE id = ? AND discipline_points > 0')
      .run(c.id)
    logAudit(systemUser.id, 'discipline_amnesty', 'discipline', c.id, AMNESTY_DETAIL)
    createNotification({
      message: `🕊 Disiplin affı: ${c.full_name} — ${AMNESTY_DETAIL}`,
      type: 'info', module: 'discipline', target_role: 'campus_manager',
      dedup_key: `amnesty_${c.id}_${new Date().toISOString().slice(0, 10)}`,
    })
    amnesty += 1
  })

  return { auto_red: autoRed, amnesty }
}
