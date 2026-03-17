import app from '../backend/src/app.js'
import { initDB } from '../backend/src/shared/db/index.js'

// Vercel serverless: /tmp is the only writable directory
process.env.DB_PATH = '/tmp/yys.db'

let dbInitialized = false

export default function handler(req, res) {
  if (!dbInitialized) {
    initDB()
    // Auto-seed on first cold start so the demo has data
    import('../backend/src/shared/db/seed.js').then(m => {
      if (m.seedDev) m.seedDev()
    }).catch(() => {})
    dbInitialized = true
  }
  return app(req, res)
}
