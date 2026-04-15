import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
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
import { reportsRouter } from './modules/reports/routes.js'
import { inventoryRouter } from './modules/inventory/routes.js'
import { usersRouter } from './modules/users/routes.js'
import { authRouter } from './shared/auth/routes.js'
import { notificationsRouter } from './shared/notifications/routes.js'
import { whatsappRouter } from './shared/whatsapp/routes.js'
import { emailRouter } from './modules/email/routes.js'
import { announcementsRouter } from './modules/announcements/routes.js'

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174']

const app = express()
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
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
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', 'attachment')
  next()
}, express.static('uploads'))

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Write endpoint rate limiter — 60 req/min
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Read-only endpoint rate limiter — 120 req/min
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/auth', authLimiter, authRouter)
app.use('/api/checkin', writeLimiter, checkinRouter)
app.use('/api/capacity', writeLimiter, capacityRouter)
app.use('/api/laundry', writeLimiter, laundryRouter)
app.use('/api/housekeeping', writeLimiter, housekeepingRouter)
app.use('/api/maintenance', writeLimiter, maintenanceRouter)
app.use('/api/discipline', writeLimiter, disciplineRouter)
app.use('/api/self-service', writeLimiter, selfServiceRouter)
app.use('/api/dashboard', readLimiter, dashboardRouter)
app.use('/api/room-history', readLimiter, roomHistoryRouter)
app.use('/api/notifications', writeLimiter, notificationsRouter)
app.use('/api/whatsapp', writeLimiter, whatsappRouter)
app.use('/api/shifts', writeLimiter, shiftsRouter)
app.use('/api/checkout', writeLimiter, checkoutRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/inventory', writeLimiter, inventoryRouter)
app.use('/api/users', writeLimiter, usersRouter)
app.use('/api/settings/email', writeLimiter, emailRouter)
app.use('/api/announcements', writeLimiter, announcementsRouter)

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Express]', err.stack || err.message)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: status < 500 ? err.message : 'Sunucu hatası' })
})

export default app
