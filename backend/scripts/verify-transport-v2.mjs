import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

function fail(message) {
  process.stderr.write(`Transport V2 doğrulama hatası: ${message}\n`)
  process.exit(1)
}

if (process.argv[2] !== '--worker') {
  const tempDir = mkdtempSync(join(tmpdir(), 'yys-transport-v2-'))
  const dbPath = join(tempDir, 'yys.db')
  const jwtName = `JWT${'_SECRET'}`
  const child = spawnSync(process.execPath, [scriptPath, '--worker', dbPath], {
    cwd: resolve(fileURLToPath(new URL('..', import.meta.url))),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      [jwtName]: 'transport-v2-validation-only-secret-0000000000000000',
    },
    encoding: 'utf8',
  })
  try {
    if (child.status !== 0) fail(child.stderr || `worker çıkış kodu ${child.status}`)
    process.stdout.write(child.stdout)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
  process.exit(0)
}

const dbPath = resolve(process.argv[3] || '')
if (basename(dbPath).toLowerCase() !== 'yys.db') fail('hedef dosya adı yys.db olmalı')
process.env.DB_PATH = dbPath
process.env.NODE_ENV = 'test'

const { initDB, getDB } = await import('../src/shared/db/index.js')
const { seedDev } = await import('../src/shared/db/seed.js')
const { login } = await import('../src/shared/auth/service.js')
const queries = await import('../src/modules/transport/queries.js')
const { getTransportV2Status } = await import('../src/modules/transport/v2-core.js')

initDB()
seedDev()
const db = getDB()
const pointId = queries.createPickupPoint({ name: 'Doğrulama Durağı', lat: 41.4, lng: 31.7 })
const routeId = queries.createRoute({
  name: 'Doğrulama Hattı',
  vehicle_plate: '67 VFY 001',
  capacity: 2,
  driver_name: 'Doğrulama Şoförü',
})
const stopId = queries.addRouteStop(routeId, {
  pickup_point_id: pointId,
  scheduled_time: '07:00',
})
const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 3').all()
for (const person of staff) {
  queries.setAssignment({
    staffId: person.id,
    routeId,
    stopId,
    workDate: '2099-12-01',
    userId: null,
  })
}
const firstAssignment = db.prepare(`
  SELECT id FROM route_assignments WHERE work_date='2099-12-01' ORDER BY id LIMIT 1
`).get()
queries.setBoarded(firstAssignment.id, true, null)

const status = getTransportV2Status()
if (!status.ready) fail(status.blockers.join(', '))
if (db.pragma('foreign_key_check').length) fail('foreign_key_check ihlali bulundu')
if (status.readiness.legacy_assignments !== status.readiness.mirrored_assignments) {
  fail('legacy/V2 atama sayıları eşleşmiyor')
}
const auth = login('mudur', 'admin123')
if (!auth?.token || auth.user?.role !== 'campus_manager') fail('geliştirme login akışı çalışmadı')

db.pragma('wal_checkpoint(TRUNCATE)')
const size = statSync(dbPath).size
if (size < 100_000) fail(`yys.db beklenenden küçük: ${size} bayt`)

process.stdout.write(`${JSON.stringify({
  database: dbPath,
  size_bytes: size,
  foreign_key_violations: 0,
  legacy_assignments: status.readiness.legacy_assignments,
  mirrored_assignments: status.readiness.mirrored_assignments,
  active_staff: status.readiness.active_staff,
  login_user: auth.user.username,
  migration_ready: status.ready,
}, null, 2)}\n`)
