// Barrel — rapor route'ları alan dosyalarına bölündü (routes/ altında).
// Dış import değişmedi: app.js `reportsRouter`'ı buradan almaya devam eder.
// Tüm path'ler aynı seviyede kalır; Express exact-match yaptığı için sıra önemsizdir.
import { Router } from 'express'
import { housekeepingReportsRouter } from './routes/housekeeping.js'
import { maintenanceReportsRouter } from './routes/maintenance.js'
import { occupancyReportsRouter } from './routes/occupancy.js'
import { disciplineReportsRouter } from './routes/discipline.js'
import { managementReportsRouter } from './routes/management.js'
import { personnelReportsRouter } from './routes/personnel.js'
import { inventoryReportsRouter } from './routes/inventory.js'
import { laundryReportsRouter } from './routes/laundry.js'
import { shiftsReportsRouter } from './routes/shifts.js'
import { analyticsReportsRouter } from './routes/analytics.js'

export const reportsRouter = Router()
reportsRouter.use(housekeepingReportsRouter)
reportsRouter.use(maintenanceReportsRouter)
reportsRouter.use(occupancyReportsRouter)
reportsRouter.use(disciplineReportsRouter)
reportsRouter.use(managementReportsRouter)
reportsRouter.use(personnelReportsRouter)
reportsRouter.use(inventoryReportsRouter)
reportsRouter.use(laundryReportsRouter)
reportsRouter.use(shiftsReportsRouter)
reportsRouter.use(analyticsReportsRouter)
