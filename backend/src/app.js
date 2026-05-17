import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { sanitizeBody } from './shared/middleware/sanitize.js'
import { getDB } from './shared/db/index.js'
import { checkinRouter } from './modules/checkin/routes.js'
import { capacityRouter } from './modules/capacity/routes.js'
import { laundryRouter } from './modules/laundry/routes.js'
import { housekeepingRouter } from './modules/housekeeping/routes.js'
import { maintenanceRouter } from './modules/maintenance/routes.js'
import { disciplineRouter } from './modules/discipline/routes.js'
import { selfServiceRouter } from './modules/self-service/routes.js'
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
import { notificationPrefsRouter } from './modules/notification-prefs/routes.js'
import { campusMapRouter } from './modules/campus-map/routes.js'
import { personnelRouter } from './modules/personnel/routes.js'
import { hrRouter } from './modules/hr/routes.js'
import { qrRouter } from './modules/qr/routes.js'

if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGIN) {
  console.error('[Startup] HATA: ALLOWED_ORIGIN env değişkeni production\'da zorunludur.')
  console.error('[Startup] Render Dashboard\'a ALLOWED_ORIGIN=https://yourdomain.com ekleyin.')
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
      connectSrc: ["'self'"],
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
app.use(sanitizeBody)
// Multer dosya isimleri unique (Date.now()-rand) — immutable cache güvenli.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // inline: <img> tag'leri normal render edebilsin (magic byte ile zaten dogrulandi)
  res.setHeader('Content-Disposition', 'inline')
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  next()
}, express.static(process.env.UPLOADS_DIR || 'uploads', { maxAge: '1y', immutable: true }))

// Health check
app.get('/api/health', (req, res) => {
  let dbStatus = 'ok'
  try { getDB().prepare('SELECT 1').get() } catch { dbStatus = 'error' }
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: dbStatus,
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
app.use('/api/mobile/auth', mobileAuthLimiter, mobileAuthRouter)
app.use('/api/checkin', writeLimiter, checkinRouter)
app.use('/api/capacity', writeLimiter, capacityRouter)
app.use('/api/laundry', writeLimiter, laundryRouter)
app.use('/api/housekeeping', writeLimiter, housekeepingRouter)
app.use('/api/maintenance', writeLimiter, maintenanceRouter)
app.use('/api/discipline', writeLimiter, disciplineRouter)
app.use('/api/self-service', writeLimiter, selfServiceRouter)
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

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı' })
})

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Express]', err.stack || err.message)
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
