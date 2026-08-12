import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { getDB } from '../../shared/db/index.js'
import { logAudit } from '../../shared/audit.js'
import { revokeSession, revokeSessionsFor } from '../../shared/auth/service.js'

const TABLES = { staff: 'staff', personnel: 'personnel' }
const POLICY_KEYS = new Set([
  'kiosk_shared_idle_minutes',
  'kiosk_shared_absolute_hours',
  'kiosk_laundry_idle_minutes',
  'kiosk_laundry_absolute_hours',
  'kiosk_personal_session_days',
  'kiosk_personal_reauth_hours',
  'kiosk_initial_pin_hours',
])

function principal(kind, id) {
  const table = TABLES[kind]
  if (!table) return null
  const activeClause = kind === 'staff'
    ? 'is_active=1'
    : 'check_out_date IS NULL AND COALESCE(is_placeholder,0)=0'
  return getDB().prepare(`SELECT id, full_name FROM ${table} WHERE id=? AND ${activeClause}`).get(id) || null
}

function latestStatus(row) {
  if (!row.issuance_id) return row.has_pin ? 'permanent' : 'missing'
  if (row.revoked_at) return row.has_pin ? 'permanent' : 'revoked'
  if (row.completed_at) return 'permanent'
  if (row.first_used_at) return 'change_required'
  if (new Date(`${row.expires_at.replace(' ', 'T')}Z`).getTime() <= Date.now()) return 'expired'
  return row.delivered_at ? 'delivered' : 'issued'
}

export function listPinPrincipals({ q = '', kind = 'all', status = 'all', limit = 250 } = {}) {
  const normalizedKind = ['staff', 'personnel'].includes(kind) ? kind : 'all'
  const search = `%${String(q).trim()}%`
  const rows = getDB().prepare(`
    WITH principals AS (
      SELECT 'staff' AS principal_kind, s.id AS principal_id, s.full_name,
             COALESCE(d.name, s.role_label, 'AVS') AS group_name,
             CASE WHEN s.kiosk_pin IS NOT NULL AND s.kiosk_pin<>'' THEN 1 ELSE 0 END AS has_pin
      FROM staff s LEFT JOIN departments d ON d.id=s.department_id
      WHERE s.is_active=1
      UNION ALL
      SELECT 'personnel', p.id, p.full_name, COALESCE(p.company, 'Sakin'),
             CASE WHEN p.kiosk_pin IS NOT NULL AND p.kiosk_pin<>'' THEN 1 ELSE 0 END
      FROM personnel p
      WHERE p.check_out_date IS NULL AND COALESCE(p.is_placeholder,0)=0
    ), latest AS (
      SELECT i.* FROM kiosk_pin_issuances i
      WHERE i.id=(
        SELECT MAX(i2.id) FROM kiosk_pin_issuances i2
        WHERE i2.principal_kind=i.principal_kind AND i2.principal_id=i.principal_id
      )
    )
    SELECT p.*, i.id AS issuance_id, i.issued_at, i.expires_at, i.first_used_at,
           i.completed_at, i.delivered_at, i.delivery_method, i.delivered_to,
           i.revoked_at
    FROM principals p
    LEFT JOIN latest i ON i.principal_kind=p.principal_kind AND i.principal_id=p.principal_id
    WHERE (?='all' OR p.principal_kind=?) AND p.full_name LIKE ?
    ORDER BY p.full_name COLLATE NOCASE
    LIMIT ?
  `).all(normalizedKind, normalizedKind, search, Math.min(Math.max(Number(limit) || 250, 1), 500))
  const items = rows.map(row => ({ ...row, pin_status: latestStatus(row) }))
  return status === 'all' ? items : items.filter(item => item.pin_status === status)
}

export function issuePins(actorUserId, principals) {
  const db = getDB()
  const hoursValue = Number(db.prepare("SELECT value FROM system_settings WHERE key='kiosk_initial_pin_hours'").get()?.value)
  const hours = Number.isFinite(hoursValue) && hoursValue > 0 ? hoursValue : 24
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)
  const unique = [...new Map(principals.map(item => [`${item.kind}:${item.id}`, item])).values()]
  const issued = []

  db.transaction(() => {
    for (const item of unique) {
      const person = principal(item.kind, item.id)
      if (!person) continue
      const pin = String(randomInt(100000, 1000000))
      const hash = bcrypt.hashSync(pin, 10)
      const previous = db.prepare(`
        SELECT id FROM kiosk_pin_issuances
        WHERE principal_kind=? AND principal_id=? AND revoked_at IS NULL AND completed_at IS NULL
        ORDER BY id DESC LIMIT 1
      `).get(item.kind, item.id)
      if (previous) {
        db.prepare(`
          UPDATE kiosk_pin_issuances
          SET revoked_at=CURRENT_TIMESTAMP, revoked_by=?, revoke_reason='regenerated'
          WHERE id=?
        `).run(actorUserId, previous.id)
      }
      revokeSessionsFor(item.kind, item.id)
      db.prepare(`UPDATE ${TABLES[item.kind]} SET kiosk_pin=?, pin_attempts=0, pin_locked_until=NULL WHERE id=?`)
        .run(hash, item.id)
      const result = db.prepare(`
        INSERT INTO kiosk_pin_issuances(principal_kind, principal_id, issued_by, expires_at)
        VALUES(?,?,?,?)
      `).run(item.kind, item.id, actorUserId, expiresAt)
      const issuanceId = Number(result.lastInsertRowid)
      if (previous) db.prepare('UPDATE kiosk_pin_issuances SET replaced_by_id=? WHERE id=?').run(issuanceId, previous.id)
      issued.push({
        issuance_id: issuanceId,
        principal_kind: item.kind,
        principal_id: item.id,
        full_name: person.full_name,
        pin,
        expires_at: `${expiresAt.replace(' ', 'T')}Z`,
      })
    }
  })()
  logAudit(actorUserId, 'kiosk_pin_issue', 'kiosk-management', null, JSON.stringify({ count: issued.length }))
  return { items: issued, count: issued.length, expires_at: issued[0]?.expires_at || null }
}

export function deliverPin(issuanceId, actorUserId, input) {
  const db = getDB()
  const row = db.prepare('SELECT * FROM kiosk_pin_issuances WHERE id=?').get(issuanceId)
  if (!row) return { error: 'PIN kaydı bulunamadı', status: 404 }
  if (row.revoked_at || row.completed_at) return { error: 'Bu PIN artık teslim edilemez', status: 409 }
  if (new Date(`${row.expires_at.replace(' ', 'T')}Z`).getTime() <= Date.now()) {
    return { error: 'PIN süresi dolmuş', status: 410 }
  }
  db.prepare(`
    UPDATE kiosk_pin_issuances
    SET delivered_at=CURRENT_TIMESTAMP, delivered_by=?, delivered_to=?, delivery_method=?
    WHERE id=?
  `).run(actorUserId, input.delivered_to, input.delivery_method, issuanceId)
  logAudit(actorUserId, 'kiosk_pin_deliver', 'kiosk-management', issuanceId, JSON.stringify(input))
  return { ok: true }
}

export function revokePin(issuanceId, actorUserId, reason = 'manager_revoked') {
  const db = getDB()
  const row = db.prepare('SELECT * FROM kiosk_pin_issuances WHERE id=?').get(issuanceId)
  if (!row) return { error: 'PIN kaydı bulunamadı', status: 404 }
  if (row.revoked_at) return { ok: true }
  db.transaction(() => {
    db.prepare(`
      UPDATE kiosk_pin_issuances
      SET revoked_at=CURRENT_TIMESTAMP, revoked_by=?, revoke_reason=? WHERE id=?
    `).run(actorUserId, String(reason).slice(0, 300), issuanceId)
    const newer = db.prepare(`
      SELECT 1 FROM kiosk_pin_issuances
      WHERE principal_kind=? AND principal_id=? AND id>? AND revoked_at IS NULL LIMIT 1
    `).get(row.principal_kind, row.principal_id, row.id)
    if (!newer) {
      db.prepare(`UPDATE ${TABLES[row.principal_kind]} SET kiosk_pin=NULL WHERE id=?`).run(row.principal_id)
      revokeSessionsFor(row.principal_kind, row.principal_id)
    }
  })()
  logAudit(actorUserId, 'kiosk_pin_revoke', 'kiosk-management', issuanceId, String(reason))
  return { ok: true }
}

export function markPinDeliveries(actorUserId, issuanceIds, input) {
  const results = issuanceIds.map(id => ({ id, result: deliverPin(id, actorUserId, input) }))
  return { updated: results.filter(item => item.result.ok).length, results }
}

export function listKioskSessions() {
  return getDB().prepare(`
    SELECT a.jti, a.principal_kind, a.principal_id, a.full_name, a.role, a.device_id,
           a.session_mode, a.created_at, a.last_seen_at, a.locked_at, a.lock_reason,
           a.absolute_expires_at, a.pin_change_required, d.name AS device_name
    FROM auth_sessions a LEFT JOIN kiosk_devices d ON d.id=a.device_id
    WHERE a.role IN ('kiosk','avs_kiosk') AND a.revoked_at IS NULL
      AND COALESCE(a.absolute_expires_at,a.expires_at)>?
    ORDER BY COALESCE(a.last_seen_at,a.created_at) DESC
  `).all(Math.floor(Date.now() / 1000))
}

export function endKioskSession(jti, actorUserId) {
  const ok = revokeSession(jti)
  if (ok) logAudit(actorUserId, 'kiosk_session_revoke', 'kiosk-management', null, jti)
  return ok
}

export function endPrincipalSessions(kind, id, actorUserId) {
  if (!TABLES[kind] || !principal(kind, id)) return false
  revokeSessionsFor(kind, id)
  logAudit(actorUserId, 'kiosk_principal_logout', 'kiosk-management', id, kind)
  return true
}

export function getSessionSettings() {
  const rows = getDB().prepare(`
    SELECT key, value FROM system_settings
    WHERE key IN (${[...POLICY_KEYS].map(() => '?').join(',')})
  `).all(...POLICY_KEYS)
  return Object.fromEntries(rows.map(row => [row.key, Number(row.value)]))
}

export function updateSessionSettings(actorUserId, values) {
  const db = getDB()
  const statement = db.prepare(`
    INSERT INTO system_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
  `)
  db.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      if (POLICY_KEYS.has(key)) statement.run(key, String(value))
    }
  })()
  logAudit(actorUserId, 'kiosk_session_settings_update', 'kiosk-management', null, JSON.stringify(values))
  return getSessionSettings()
}
