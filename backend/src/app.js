import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import v8 from 'node:v8'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { sanitizeBody } from './shared/middleware/sanitize.js'
import { getDB } from './shared/db/index.js'
import { logger } from './shared/logger.js'
import { setupExpressErrorHandler as setupSentryErrorHandler, isSentryActive } from './shared/sentry.js'
import { httpMetricsMiddleware } from './shared/metrics.js'
import { getStats as getJobStats } from './shared/jobs/index.js'

// Sürüm bilgisi — /api/health ve diagnostic için bir kez başlangıçta okunur.
const __dirname = dirname(fileURLToPath(import.meta.url))
let APP_VERSION = 'unknown'
try {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
  APP_VERSION = pkg.version || 'unknown'
} catch { /* package.json okunamazsa default kalır */ }
// Commit: önce env (CI/PaaS), yoksa git checkout'tan rev-parse (prod /opt/avskamp
// git pull ile deploy edilir → çalışır). Git yoksa null (eski davranış).
let APP_COMMIT = (process.env.GIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null
if (!APP_COMMIT) {
  try {
    const { execFileSync } = await import('node:child_process')
    APP_COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null
  } catch { /* git yoksa null kalır */ }
}
const APP_STARTED_AT = new Date().toISOString()
import { checkinRouter } from './modules/checkin/routes.js'
import { capacityRouter } from './modules/capacity/routes.js'
import { laundryRouter } from './modules/laundry/routes.js'
import { housekeepingRouter } from './modules/housekeeping/routes.js'
import { maintenanceRouter } from './modules/maintenance/routes.js'
import { disciplineRouter } from './modules/discipline/routes.js'
import { selfServiceRouter } from './modules/self-service/routes.js'
import { avsSelfServiceRouter } from './modules/avs-self-service/routes.js'
import { feedbackRouter } from './modules/feedback/routes.js'
import { dashboardRouter } from './modules/dashboard/routes.js'
import { roomHistoryRouter } from './modules/room-history/routes.js'
import { shiftsRouter } from './modules/shifts/routes.js'
import { checkoutRouter } from './modules/checkout/routes.js'
import { bulkActionsRouter } from './modules/bulk-actions/routes.js'
import { companiesRouter } from './modules/companies/routes.js'
import { visitorsRouter } from './modules/visitors/routes.js'
import { surveysRouter } from './modules/surveys/routes.js'
import { drillsRouter } from './modules/drills/routes.js'
import { displayRouter } from './modules/display/routes.js'
import { documentsRouter } from './modules/documents/routes.js'
import { expensesRouter } from './modules/expenses/routes.js'
import { notifGroupsRouter } from './modules/notification-groups/routes.js'
import { automationRouter } from './modules/automation/routes.js'
import { reportsRouter } from './modules/reports/routes.js'
import { inventoryRouter } from './modules/inventory/routes.js'
import { usersRouter } from './modules/users/routes.js'
import { authRouter } from './shared/auth/routes.js'
import { notificationsRouter } from './shared/notifications/routes.js'
import { whatsappRouter } from './shared/whatsapp/routes.js'
import { pushRouter } from './modules/push/routes.js'
import { emailRouter } from './modules/email/routes.js'
import { announcementsRouter } from './modules/announcements/routes.js'
import { avsWorkersRouter } from './modules/avs-workers/routes.js'
import { transportRouter } from './modules/transport/routes.js'
import { mobileAuthRouter } from './modules/mobile-auth/routes.js'
import { setupRouter } from './modules/setup/routes.js'
import { errorLogRouter } from './modules/error-log/routes.js'
import { reportErrorService } from './modules/error-log/service.js'
import { backupRouter } from './modules/backup/routes.js'
import { kvkkRouter } from './modules/kvkk/routes.js'
import { systemRouter } from './modules/system/routes.js'
import { publicRouter } from './modules/public/routes.js'
import { notificationPrefsRouter } from './modules/notification-prefs/routes.js'
import { campusMapRouter } from './modules/campus-map/routes.js'
import { personnelRouter } from './modules/personnel/routes.js'
import { hrRouter } from './modules/hr/routes.js'
import { qrRouter } from './modules/qr/routes.js'
import { cardsRouter } from './modules/cards/routes.js'
import { stationsRouter } from './modules/stations/routes.js'
import { activityRouter } from './modules/activity/routes.js'
import { accessRouter } from './modules/access/routes.js'
import { safetyRouter } from './modules/safety/routes.js'
import { mealsRouter } from './modules/meals/routes.js'
import { performanceRouter } from './modules/performance/routes.js'
import { commsRouter } from './modules/communications/routes.js'
import { integrityRouter } from './modules/integrity/routes.js'

if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGIN) {
  logger.error('[Startup] HATA: ALLOWED_ORIGIN env değişkeni production\'da zorunludur.')
  logger.error('[Startup] Render Dashboard\'a ALLOWED_ORIGIN=https://yourdomain.com ekleyin.')
  process.exit(1)
}

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174']

const app = express()

// Reverse proxy (Render/Railway/Nginx) arkasında req.ip'nin gerçek client IP'sini döndürmesi için.
// TRUST_PROXY env: sayı (proxy hop sayısı), 'loopback', 'true'/'false'. Prod'da genelde '1'.
const TRUST_PROXY_RAW = process.env.TRUST_PROXY ?? 'loopback'
const TRUST_PROXY = TRUST_PROXY_RAW === 'false'
  ? false
  : TRUST_PROXY_RAW === 'true'
    ? true
    : Number.isFinite(+TRUST_PROXY_RAW)
      ? +TRUST_PROXY_RAW
      : TRUST_PROXY_RAW
app.set('trust proxy', TRUST_PROXY)

// Prometheus HTTP metrics — route eslesmesinden sonra finish event ile latency olcer.
// Compression'dan once cunku response writer'a ihtiyaci yok, sadece timing ve label.
app.use(httpMetricsMiddleware)

// SSE response'ları sıkıştırma — chunk akışı bozulur, ayrıca event delivery gecikir.
// Diğer JSON response'lar gzip ile ~70-80% küçülür.
app.use(compression({
  filter: (req, res) => {
    if (req.path === '/api/notifications/stream') return false
    if (res.getHeader('Content-Type')?.toString().includes('text/event-stream')) return false
    return compression.filter(req, res)
  },
}))

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // script-src: unsafe-inline KALDIRILDI. SW kaydı dahil tüm scriptler external.
      scriptSrc: ["'self'"],
      // style-src: React inline style prop'ları (4400+ kullanım) için unsafe-inline ZORUNLU.
      // Google Fonts CSS dosyası için fonts.googleapis.com.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      // Login landing canlı Filyos hava/deniz verisi için open-meteo (auth'suz, public API).
      connectSrc: ["'self'", "https://api.open-meteo.com", "https://marine-api.open-meteo.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}))
app.use(cors({
  origin: (origin, callback) => {
    // Postman, curl gibi origin'siz isteklere izin ver (server-to-server, healthcheck)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: ${origin} origin'ine izin verilmiyor`))
  },
  credentials: true,
}))
// 5mb limit: zimmet imzası canvas base64 ve profil fotoğrafları JSON body'de taşınıyor
app.use(express.json({ limit: '5mb' }))
app.use(cookieParser())
app.use(sanitizeBody)
// Multer dosya isimleri unique (Date.now()-rand) — immutable cache güvenli.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // inline: <img> tag'leri normal render edebilsin (magic byte ile zaten dogrulandi)
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  next()
}, express.static(process.env.UPLOADS_DIR || 'uploads', { maxAge: '1y', immutable: true }))

// Health check — disk %95 üstü veya job queue 100+ pending'de 503 döner (UptimeRobot tetiklensin diye).
// Heap kullanımı %90'ı geçerse warning olarak işaretlenir ama 503 vermez.
const JOB_BACKLOG_CRITICAL = 100
const JOB_BACKLOG_WARN = 50
const HEAP_WARN_PERCENT = 90

app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok'
  let dbLatencyMs = null
  try {
    const t0 = Date.now()
    getDB().prepare('SELECT 1').get()
    dbLatencyMs = Date.now() - t0
  } catch { dbStatus = 'error' }

  let diskPercent = null
  let diskStatus = 'ok'
  try {
    const stats = await statfs('/')
    diskPercent = Math.round(((Number(stats.blocks) - Number(stats.bfree)) / Number(stats.blocks)) * 100)
    if (diskPercent >= 95) diskStatus = 'critical'
    else if (diskPercent >= 85) diskStatus = 'warning'
  } catch { diskStatus = 'unknown' }

  let jobs = { pending: 0, processing: 0, failed: 0 }
  let jobsStatus = 'ok'
  try {
    const stats = getJobStats()
    jobs = { pending: stats.pending, processing: stats.processing, failed: stats.failed }
    if (jobs.pending >= JOB_BACKLOG_CRITICAL) jobsStatus = 'critical'
    else if (jobs.pending >= JOB_BACKLOG_WARN) jobsStatus = 'warning'
  } catch { jobsStatus = 'unknown' }

  // V8 heap baskısı: heapUsed/heapTotal hatalı (heapTotal ihtiyaca göre adımlı büyür, normalde %90+).
  // Doğrusu V8'in OOM limitine (heap_size_limit) oranı.
  const memUsage = process.memoryUsage()
  const heapPercent = Math.round((memUsage.heapUsed / v8.getHeapStatistics().heap_size_limit) * 100)
  const heapStatus = heapPercent >= HEAP_WARN_PERCENT ? 'warning' : 'ok'

  const isCritical = dbStatus === 'error' || diskStatus === 'critical' || jobsStatus === 'critical'
  const overall = isCritical ? 'degraded' : 'ok'

  res.status(overall === 'ok' ? 200 : 503).json({
    status: overall,
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
    db_latency_ms: dbLatencyMs,
    disk_percent: diskPercent,
    disk_status: diskStatus,
    jobs,
    jobs_status: jobsStatus,
    heap_percent: heapPercent,
    heap_status: heapStatus,
    sentry_status: isSentryActive() ? 'ok' : 'disabled',
    version: APP_VERSION,
    commit: APP_COMMIT,
    started_at: APP_STARTED_AT,
    node_env: process.env.NODE_ENV || 'development',
  })
})

// Rate-limit key: kimlik doğrulaması yapılmış isteklerde kullanıcı ID'si,
// aksi halde IP. Aynı NAT/WiFi arkasındaki kullanıcıların birbirini bloke
// etmesini önler. JWT sadece decode edilir (verify değil) — rate-limit
// kovası için tutarlı bir anahtar yeterli, güvenlik yetki kontrolüne bağlı.
const rateLimitKey = (req, _res) => {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) {
    try {
      const p = jwt.decode(h.slice(7))
      const id = p?.id ?? p?.personnelId ?? p?.workerId
      if (id) return `u:${p.role || 'x'}:${id}`
    } catch { /* token parse edilemezse IP'ye düş */ }
  }
  return `ip:${ipKeyGenerator(req.ip)}`
}

// Login endpoint — brute-force koruması için per-IP, window başına 30 deneme
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
})

// Mobile PIN login — 4 haneli PIN brute-force riski; per-IP sıkı
const mobileAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Çok fazla PIN denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
})

// Write endpoint limiter — per-user 300/dk (5/sn). Modern SPA tek sayfa
// açılışında rahat 15+ istek atar; 60/dk çok sıkıydı.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: rateLimitKey,
})

// Read endpoint limiter — per-user 600/dk (10/sn), dashboard'lar için rahat
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: rateLimitKey,
})

// Notifications: 4 ayrı hook (useNotifications/useOccupancy/useLaundrySSE/
// useMobileSSE) aynı /stream endpoint'ine uzun ömürlü SSE bağlantısı açıyor
// ve reconnect'ler yüzünden write limit'e takılıyordu. SSE'yi tamamen bypass,
// polling PATCH/GET için bol limit.
const notificationsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test'
    || req.path === '/stream'
    || req.originalUrl.startsWith('/api/notifications/stream'),
  keyGenerator: rateLimitKey,
})

// Setup — auth gerektirmez, ilk kurulum sihirbazı için açık endpoint.
// authLimiter brute-force korur (15dk içinde 30 deneme).
app.use('/api/setup', authLimiter, setupRouter)
app.use('/api/auth', authLimiter, authRouter)
app.use('/api/public', readLimiter, publicRouter)  // login öncesi güvenli toplu sayılar (auth yok)
app.use('/api/mobile/auth', mobileAuthLimiter, mobileAuthRouter)
app.use('/api/checkin', writeLimiter, checkinRouter)
app.use('/api/capacity', writeLimiter, capacityRouter)
app.use('/api/laundry', writeLimiter, laundryRouter)
app.use('/api/housekeeping', writeLimiter, housekeepingRouter)
app.use('/api/maintenance', writeLimiter, maintenanceRouter)
app.use('/api/discipline', writeLimiter, disciplineRouter)
app.use('/api/self-service', writeLimiter, selfServiceRouter)
app.use('/api/avs-self-service', writeLimiter, avsSelfServiceRouter)
app.use('/api/dashboard', readLimiter, dashboardRouter)
app.use('/api/room-history', readLimiter, roomHistoryRouter)
app.use('/api/notifications', notificationsLimiter, notificationsRouter)
app.use('/api/push', writeLimiter, pushRouter)
app.use('/api/whatsapp', writeLimiter, whatsappRouter)
app.use('/api/shifts', writeLimiter, shiftsRouter)
app.use('/api/checkout', writeLimiter, checkoutRouter)
app.use('/api/bulk-actions', writeLimiter, bulkActionsRouter)
app.use('/api/companies', writeLimiter, companiesRouter)
app.use('/api/visitors', writeLimiter, visitorsRouter)
app.use('/api/surveys', writeLimiter, surveysRouter)
app.use('/api/feedback', writeLimiter, feedbackRouter)
app.use('/api/drills', writeLimiter, drillsRouter)
app.use('/api/display', readLimiter, displayRouter)
app.use('/api/documents', writeLimiter, documentsRouter)
app.use('/api/expenses', writeLimiter, expensesRouter)
app.use('/api/notification-groups', writeLimiter, notifGroupsRouter)
app.use('/api/automation', writeLimiter, automationRouter)
app.use('/api/reports', readLimiter, reportsRouter)
app.use('/api/inventory', writeLimiter, inventoryRouter)
app.use('/api/users', writeLimiter, usersRouter)
app.use('/api/settings/email', writeLimiter, emailRouter)
app.use('/api/announcements', writeLimiter, announcementsRouter)
app.use('/api/avs-workers', writeLimiter, avsWorkersRouter)
app.use('/api/transport', writeLimiter, transportRouter)
// Error log: POST writeLimiter (frontend hata flood'una karşı), GET/DELETE admin
app.use('/api/error-log', writeLimiter, errorLogRouter)
app.use('/api/backup', writeLimiter, backupRouter)
app.use('/api/kvkk', readLimiter, kvkkRouter)
app.use('/api/system', readLimiter, systemRouter)
app.use('/api/notification-prefs', writeLimiter, notificationPrefsRouter)
app.use('/api/campus-map', writeLimiter, campusMapRouter)
app.use('/api/personnel', writeLimiter, personnelRouter)
app.use('/api/hr', writeLimiter, hrRouter)
app.use('/api/qr', writeLimiter, qrRouter)
app.use('/api/cards', writeLimiter, cardsRouter)
app.use('/api/stations', writeLimiter, stationsRouter)
app.use('/api/activity', readLimiter, activityRouter)
app.use('/api/access', readLimiter, accessRouter)
app.use('/api/safety', writeLimiter, safetyRouter)
app.use('/api/meals', writeLimiter, mealsRouter)
app.use('/api/performance', writeLimiter, performanceRouter)
app.use('/api/comms', writeLimiter, commsRouter)
app.use('/api/integrity', writeLimiter, integrityRouter)

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı' })
})

// Sentry error handler — kendi error handler'imizdan ONCE, sadece 5xx'i yakalar.
// initSentry() cagrilmadiysa no-op (sentry.js icinde initialized=false kontrolu).
setupSentryErrorHandler(app)

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, '[Express] request failed')
  const status = err.status || err.statusCode || 500
  // 5xx hataları DB'ye logla (4xx normal akış — istemci hatası)
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    try {
      reportErrorService({
        source: 'backend',
        severity: 'error',
        message: err.message || 'Bilinmeyen hata',
        stack: err.stack,
        url: `${req.method} ${req.originalUrl}`,
        user_id: req.user?.id || req.user?.userId || null,
        context: { status, ip: req.ip },
      })
    } catch { /* ignore — hata loglarken hata olursa sessiz */ }
  }
  res.status(status).json({ error: status < 500 ? err.message : 'Sunucu hatası' })
})

export default app
