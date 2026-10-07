// Özel finans kasası API'si — yalnız SAHİP (users.is_owner=1, campus_manager) ve
// kapsamlı API anahtarı (Hermes). Diğer HERKES — oturumsuz, müdür, vardiya — her uçta
// 404 alır: kasanın varlığı dışarıdan anlaşılmaz. Firma denetim günlüğüne (logAudit)
// bilinçli olarak YAZILMAZ; o günlük müdürlere açıktır.
import { Router } from 'express'
import { verifyToken } from '../../shared/auth/service.js'
import { getDB } from '../../shared/db/index.js'
import * as vault from './vault.js'

export const privateFinanceRouter = Router()

const COOKIE_NAME = 'yys_session'

function sessionUser(req) {
  const h = req.headers.authorization
  const token = req.cookies?.[COOKIE_NAME] || (h?.startsWith('Bearer ') ? h.slice(7) : null)
  if (!token) return null
  try { return verifyToken(token) } catch { return null }
}

export function isOwner(user) {
  // Kiosk/cihaz token'larının id'si users tablosuyla çakışabilir → rol de şart.
  if (!user?.id || user.role !== 'campus_manager') return false
  return Boolean(getDB().prepare('SELECT 1 FROM users WHERE id=? AND is_owner=1 AND is_active=1').get(user.id))
}

const hide = res => res.status(404).json({ error: 'Bulunamadı' })

function access(scope, { allowKey = true } = {}) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const key = req.get('x-pf-key')
    if (key) {
      if (!allowKey) return hide(res)
      const k = vault.verifyApiKey(key)
      if (!k || !k.scopes.includes(scope)) return hide(res)
      req.pfActor = `anahtar:${k.name}`
      return next()
    }
    const user = sessionUser(req)
    if (!isOwner(user)) return hide(res)
    req.pfUser = user
    req.pfActor = `kullanıcı:${user.username}`
    next()
  }
}

const send = (res, e) => {
  if (!e.statusCode) throw e
  res.status(e.statusCode).json({ error: e.message, ...(e.current_version != null ? { current_version: e.current_version, updated_at: e.updated_at } : {}) })
}

// nginx auth_request alt isteği: FinansApp statik dosyaları yalnız sahibe servis edilir.
// nginx X-Original-URI ekler; doğrudan çağrıda 404. 401/403 nginx'te 404'e çevrilir.
privateFinanceRouter.get('/gate', (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (!req.get('x-original-uri')) return hide(res)
  const user = sessionUser(req)
  if (!user) return res.status(401).end()
  return isOwner(user) ? res.status(204).end() : res.status(403).end()
})

privateFinanceRouter.get('/me', access('read', { allowKey: false }), (req, res) => {
  const u = getDB().prepare('SELECT username, full_name, totp_enabled FROM users WHERE id=?').get(req.pfUser.id)
  res.json({ owner: true, username: u.username, full_name: u.full_name, totp_enabled: Boolean(u.totp_enabled) })
})

privateFinanceRouter.get('/state', access('read'), (req, res) => {
  res.json({ stores: vault.listStates() })
})

privateFinanceRouter.get('/state/:key', access('read'), (req, res) => {
  try {
    const row = vault.getState(req.params.key)
    if (!row) return res.status(404).json({ error: 'Store yok', store_key: req.params.key, version: 0 })
    res.json(row)
  } catch (e) { send(res, e) }
})

privateFinanceRouter.put('/state/:key', access('write'), (req, res) => {
  try {
    const { data, base_version: baseVersion, device_id: deviceId, force } = req.body || {}
    const r = vault.putState(req.params.key, data, {
      baseVersion: baseVersion == null ? 0 : Number(baseVersion), deviceId: deviceId ? String(deviceId).slice(0, 80) : null,
      actor: req.pfActor, force: force === true,
    })
    res.status(r.unchanged ? 200 : 201).json(r)
  } catch (e) { send(res, e) }
})

privateFinanceRouter.get('/state/:key/history', access('read'), (req, res) => {
  try { res.json({ versions: vault.stateHistory(req.params.key) }) } catch (e) { send(res, e) }
})

privateFinanceRouter.post('/state/:key/restore', access('write', { allowKey: false }), (req, res) => {
  try {
    const version = Number(req.body?.version)
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'version gerekli' })
    res.json(vault.restoreState(req.params.key, version, req.pfActor))
  } catch (e) { send(res, e) }
})

// Bilinmeyen alt yol da 404 (Express'in varsayılan "Cannot GET" sayfası yerine aynı yanıt).
privateFinanceRouter.use((req, res) => hide(res))
