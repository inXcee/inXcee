import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { sanitizeBody } from './shared/middleware/sanitize.js'
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

const app = express()
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:5173', 'http://localhost:5174']
}))
app.use(express.json({ limit: '5mb' }))
app.use(sanitizeBody)
app.use('/uploads', express.static('uploads'))

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

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

app.use('/api/auth', authLimiter, authRouter)
app.use('/api/checkin', writeLimiter, checkinRouter)
app.use('/api/capacity', capacityRouter)
app.use('/api/laundry', writeLimiter, laundryRouter)
app.use('/api/housekeeping', writeLimiter, housekeepingRouter)
app.use('/api/maintenance', writeLimiter, maintenanceRouter)
app.use('/api/discipline', writeLimiter, disciplineRouter)
app.use('/api/self-service', selfServiceRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/room-history', roomHistoryRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/whatsapp', whatsappRouter)
app.use('/api/shifts', writeLimiter, shiftsRouter)
app.use('/api/checkout', writeLimiter, checkoutRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/inventory', writeLimiter, inventoryRouter)
app.use('/api/users', writeLimiter, usersRouter)
app.use('/api/settings/email', writeLimiter, emailRouter)

export default app
