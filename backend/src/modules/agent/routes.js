// Ajan (Hermes) entegrasyonu — bkz. docs/hermes-entegrasyon.md.
// Ajanın kendine özel bir "komut" API'si YOKTUR: anahtarıyla YYS'nin normal uçlarını çağırır. Bu router yalnız
// ajanın yolunu bulmasını sağlar (kimim, hangi uç var, modül kuralları) ve anahtar yönetimini barındırır.
import { Router } from 'express'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { requireRole, requireStaff } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import { createAgentKey, listAgentKeys, revokeAgentKey, setAgentKeyKasa, agentKasaAccess } from '../../shared/auth/agentKeys.js'
import { isOwner } from '../../shared/auth/owner.js'
import { logAudit } from '../../shared/audit.js'
import { getDB } from '../../shared/db/index.js'
import { searchCatalog, catalogModules, endpointSource, readSource } from './catalog.js'

export const agentRouter = Router()
const managerOnly = requireRole('campus_manager')
const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs')

// Kimlik: ajan hangi kullanıcı adına, hangi rolle ve hangi erişimle çalışıyor; sunucu saati (İstanbul).
agentRouter.get('/whoami', ...requireStaff, (req, res) => {
  const now = new Date()
  res.json({
    user: { id: req.user.id, username: req.user.username, full_name: req.user.full_name, role: req.user.role },
    agent: req.user.agent ? {
      name: req.user.agent.name, access: req.user.agent.access,
      // Yalnız izin varsa görünür: kasa izni olmayan anahtar kasanın varlığını buradan da öğrenmez.
      ...(agentKasaAccess(req.user.agent) ? { kasa: agentKasaAccess(req.user.agent) } : {}),
    } : null,
    server_time: now.toISOString(),
    local_date: now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
    local_time: now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false }),
    timezone: 'Europe/Istanbul',
  })
})

// Uç kataloğu. ?q=su dagitim (sözcüklerin hepsi), ?module=water, ?method=POST, ?schema=1 (gövde şemaları),
// ?only_callable=1 (bu anahtarın rolüyle çağrılabilenler), ?limit / ?offset.
agentRouter.get('/catalog', ...requireStaff, (req, res) => {
  const { q, module, method, limit, offset } = req.query
  const flag = v => v === '1' || v === 'true'
  res.json(searchCatalog(req.app, {
    q: typeof q === 'string' ? q : '',
    module: typeof module === 'string' ? module : '',
    method: typeof method === 'string' ? method : '',
    schema: flag(req.query.schema),
    only_callable: flag(req.query.only_callable),
    limit, offset,
  }, req.user))
})

// Tek ucun ayrıntısı: gövde şeması + route kaynak kodu (şeması olmayan uçta alanlar koddan okunur).
// ?method=POST&path=/api/water/distribute — yol katalogdaki haliyle (':id' dahil). Yalnız ajan anahtarı ve müdür.
agentRouter.get('/catalog/endpoint', ...requireStaff, (req, res) => {
  if (!req.user.agent && req.user.role !== 'campus_manager') return res.status(403).json({ error: 'Yetkisiz' })
  const { method, path } = req.query
  if (typeof method !== 'string' || typeof path !== 'string') return res.status(400).json({ error: 'method ve path gerekli' })
  const detail = endpointSource(req.app, method, path)
  if (!detail) return res.status(404).json({ error: 'Katalogda böyle bir uç yok' })
  res.json(detail)
})

// Backend kaynak dosyası (yalnız backend/src altındaki .js): ?file=modules/water/movements.js&from=1&lines=200
// ya da &grep=sözcük. Uç gövdesini service katmanı çözüyorsa alanlar buradan okunur. Yalnız ajan anahtarı ve müdür.
agentRouter.get('/source', ...requireStaff, (req, res) => {
  if (!req.user.agent && req.user.role !== 'campus_manager') return res.status(403).json({ error: 'Yetkisiz' })
  const { file, from, lines, grep } = req.query
  if (typeof file !== 'string') return res.status(400).json({ error: 'file gerekli' })
  const out = readSource(file, { from, lines, grep: typeof grep === 'string' ? grep : '' })
  if (!out) return res.status(404).json({ error: 'Dosya bulunamadı' })
  res.json(out)
})

// Modül listesi (uç sayılarıyla) — kataloğa nereden başlanacağını gösterir.
agentRouter.get('/modules', ...requireStaff, (req, res) => {
  res.json(catalogModules(req.app))
})

function docFiles() {
  try { return readdirSync(DOCS_DIR).filter(f => /^[a-z0-9-]+\.md$/.test(f)).sort() } catch { return [] }
}

// Modül belgeleri (docs/*.md): iş kuralları, akışlar. Ajan bir modülde yazmadan önce ilgili belgeyi okur.
agentRouter.get('/docs', ...requireStaff, (req, res) => {
  res.json(docFiles().map(file => {
    let title = file
    try { title = readFileSync(join(DOCS_DIR, file), 'utf8').match(/^#\s+(.+)$/m)?.[1] || file } catch { /* başlıksız */ }
    return { name: file.replace(/\.md$/, ''), title }
  }))
})

agentRouter.get('/docs/:name', ...requireStaff, (req, res) => {
  const file = `${req.params.name}.md`
  if (!docFiles().includes(file)) return res.status(404).json({ error: 'Belge bulunamadı' })
  res.type('text/markdown; charset=utf-8').send(readFileSync(join(DOCS_DIR, file), 'utf8'))
})

// ── Anahtar yönetimi — yalnız müdürün web oturumu (ajan anahtarı bu uçlara giremez: gate.js) ─────────
const createKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  user_id: z.number().int().positive().optional(),
  access: z.enum(['read', 'write']).default('write'),
  expires_at: z.string().datetime({ offset: true }).nullish(),
})

// Kasa izni sütunları yalnız sahibe gösterilir; diğer müdürler kasanın varlığını anahtar listesinden öğrenmez.
agentRouter.get('/keys', ...managerOnly, (req, res) => {
  const owner = isOwner(req.user)
  res.json(listAgentKeys().map(k => {
    if (owner) return k
    const { kasa_access: _a, kasa_granted_at: _b, ...rest } = k
    return rest
  }))
})

// Yanıttaki `key` yalnız bu bir kez görünür. user_id verilmezse anahtar oluşturan müdürün hesabına bağlanır.
agentRouter.post('/keys', ...managerOnly, validate(createKeySchema), (req, res, next) => {
  try {
    const { name, user_id, access, expires_at } = req.validated
    const created = createAgentKey({ name, userId: user_id ?? req.user.id, access, expiresAt: expires_at ?? null, createdBy: req.user.id })
    logAudit(req.user.id, 'agent_key_create', 'agent', created.id, `ad=${created.name} kullanıcı=${created.user.username} erişim=${access}`)
    res.status(201).json(created)
  } catch (e) { next(e) }
})

agentRouter.delete('/keys/:id', ...managerOnly, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || !revokeAgentKey(id)) return res.status(404).json({ error: 'Anahtar bulunamadı ya da zaten iptal' })
  logAudit(req.user.id, 'agent_key_revoke', 'agent', id, null)
  res.json({ ok: true })
})

// Anahtara özel finans kasası izni ver/kaldır: { access: 'read' | 'write' | null }. Yalnız SAHİBİN web oturumu;
// diğer herkese 404 (kasa görünmez). Firma denetim günlüğüne yazılmaz (müdürlere açık) — iz satırda tutulur.
const kasaSchema = z.object({ access: z.enum(['read', 'write']).nullable() })
agentRouter.patch('/keys/:id/kasa', ...managerOnly, (req, res, next) => {
  if (!isOwner(req.user)) return res.status(404).json({ error: 'Bulunamadı' })
  next()
}, validate(kasaSchema), (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Anahtar bulunamadı' })
    res.json(setAgentKeyKasa(id, req.validated.access, req.user.id))
  } catch (e) { next(e) }
})

// Ajanın yaptığı son yazma işlemleri (denetim günlüğünden) — "Hermes ne yaptı?".
agentRouter.get('/activity', ...managerOnly, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  res.json(getDB().prepare(`
    SELECT a.id, a.created_at, a.action, a.detail, a.target_id AS key_id, u.username, u.full_name
    FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.module='agent' ORDER BY a.id DESC LIMIT ?
  `).all(limit))
})
