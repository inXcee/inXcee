import express from 'express'
import cors from 'cors'
import { checkinRouter } from './modules/checkin/routes.js'
import { capacityRouter } from './modules/capacity/routes.js'
import { laundryRouter } from './modules/laundry/routes.js'
import { housekeepingRouter } from './modules/housekeeping/routes.js'
import { maintenanceRouter } from './modules/maintenance/routes.js'
import { disciplineRouter } from './modules/discipline/routes.js'
import { selfServiceRouter } from './modules/self-service/routes.js'
import { dashboardRouter } from './modules/dashboard/routes.js'
import { roomHistoryRouter } from './modules/room-history/routes.js'
import { authRouter } from './shared/auth/routes.js'
import { notificationsRouter } from './shared/notifications/routes.js'
import { whatsappRouter } from './shared/whatsapp/routes.js'

const app = express()
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:5173', 'http://localhost:5174']
}))
app.use(express.json())
app.use('/uploads', express.static('uploads'))

app.use('/api/auth', authRouter)
app.use('/api/checkin', checkinRouter)
app.use('/api/capacity', capacityRouter)
app.use('/api/laundry', laundryRouter)
app.use('/api/housekeeping', housekeepingRouter)
app.use('/api/maintenance', maintenanceRouter)
app.use('/api/discipline', disciplineRouter)
app.use('/api/self-service', selfServiceRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/room-history', roomHistoryRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/whatsapp', whatsappRouter)

export default app
