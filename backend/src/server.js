import app from './app.js'
import { initDB } from './shared/db/index.js'
import { startCronJobs } from './shared/cron/index.js'

initDB()
startCronJobs()

app.listen(3001, () => console.log('YYS Backend http://localhost:3001'))
