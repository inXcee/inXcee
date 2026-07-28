import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { applyMigrations } from '../../shared/db/runner.js'
import {
  createPickupPoint,
  createRoute,
  addRouteStop,
  setAssignment,
  setBoarded,
  clearAssignment,
} from './queries.js'
import {
  getTransportRevision,
  isTransportV2Enabled,
  setTransportV2Enabled,
} from './v2-core.js'

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
})

describe('Transport V2 foundation', () => {
  it('creates all core tables and keeps the feature flag disabled', () => {
    const db = getDB()
    const names = new Set(db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'transport_%'
    `).all().map(row => row.name))

    for (const name of [
      'transport_vehicles',
      'transport_drivers',
      'transport_resource_unavailability',
      'transport_trip_templates',
      'transport_trips',
      'transport_trip_assignments',
      'transport_trip_events',
      'transport_trip_access_tokens',
      'transport_scan_events',
    ]) {
      expect(names.has(name)).toBe(true)
    }
    expect(isTransportV2Enabled()).toBe(false)
    expect(setTransportV2Enabled(true)).toBe(true)
    expect(setTransportV2Enabled(false)).toBe(false)
  })

  it('normalizes legacy route resources into vehicle and driver records', () => {
    const firstId = createRoute({
      name: 'V2 Kaynak A',
      vehicle_plate: '67 V2 001',
      capacity: 24,
      driver_name: 'Veli Sürücü',
      driver_phone: '05320000001',
    })
    const secondId = createRoute({
      name: 'V2 Kaynak B',
      vehicle_plate: '67 v2 001',
      capacity: 24,
      driver_name: 'veli sürücü',
      driver_phone: '05320000001',
    })
    const db = getDB()

    expect(db.prepare(`
      SELECT COUNT(*) AS c FROM transport_vehicles
      WHERE lower(plate)=lower('67 V2 001')
    `).get().c).toBe(1)
    expect(db.prepare(`
      SELECT COUNT(*) AS c FROM transport_drivers
      WHERE lower(full_name)=lower('Veli Sürücü') AND phone='05320000001'
    `).get().c).toBe(1)

    const resources = db.prepare(`
      SELECT default_vehicle_id, default_driver_id FROM routes WHERE id IN (?,?)
      ORDER BY id
    `).all(firstId, secondId)
    expect(resources[0].default_vehicle_id).toBe(resources[1].default_vehicle_id)
    expect(resources[0].default_driver_id).toBe(resources[1].default_driver_id)
  })

  it('mirrors legacy assignment writes and status changes idempotently', () => {
    const db = getDB()
    const staff = db.prepare('SELECT id FROM staff WHERE is_active=1 ORDER BY id LIMIT 1').get()
    const pointId = createPickupPoint({ name: 'V2 Adapter Durağı' })
    const routeId = createRoute({
      name: 'V2 Adapter Hattı',
      vehicle_plate: '67 V2 002',
      capacity: 12,
      driver_name: 'Adapter Şoför',
    })
    const stopId = addRouteStop(routeId, {
      pickup_point_id: pointId,
      scheduled_time: '07:15',
    })
    const workDate = '2099-05-17'
    const revisionBefore = getTransportRevision()

    setAssignment({
      staffId: staff.id,
      routeId,
      stopId,
      workDate,
      userId: null,
    })

    const legacy = db.prepare(`
      SELECT id FROM route_assignments WHERE staff_id=? AND work_date=?
    `).get(staff.id, workDate)
    const trip = db.prepare(`
      SELECT * FROM transport_trips WHERE legacy_key=?
    `).get(`legacy:${routeId}:${workDate}`)
    const mirrored = db.prepare(`
      SELECT * FROM transport_trip_assignments WHERE legacy_assignment_id=?
    `).get(legacy.id)

    expect(trip.direction).toBe('outbound')
    expect(trip.status).toBe('published')
    expect(trip.scheduled_departure).toBe(`${workDate}T07:15`)
    expect(mirrored).toMatchObject({
      trip_id: trip.id,
      staff_id: staff.id,
      stop_id: stopId,
      status: 'assigned',
      source: 'legacy',
    })

    setBoarded(legacy.id, true, null)
    expect(db.prepare(`
      SELECT status FROM transport_trip_assignments WHERE legacy_assignment_id=?
    `).get(legacy.id).status).toBe('boarded')

    setBoarded(legacy.id, false, null)
    expect(db.prepare(`
      SELECT status FROM transport_trip_assignments WHERE legacy_assignment_id=?
    `).get(legacy.id).status).toBe('no_show')
    expect(getTransportRevision()).toBeGreaterThan(revisionBefore)

    clearAssignment(staff.id, workDate)
    expect(db.prepare(`
      SELECT COUNT(*) AS c FROM transport_trip_assignments WHERE legacy_assignment_id=?
    `).get(legacy.id).c).toBe(0)
    expect(db.prepare(`
      SELECT COUNT(*) AS c FROM transport_trips WHERE legacy_key=?
    `).get(`legacy:${routeId}:${workDate}`).c).toBe(0)
  })
})

describe('065 transport migration backfill', () => {
  const migrationPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../shared/db/migrations/065_transport_v2_core.sql',
  )
  let migrationDir

  afterAll(() => {
    if (migrationDir) rmSync(migrationDir, { recursive: true, force: true })
  })

  it('backfills legacy resources and assignments once with valid foreign keys', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE staff(id INTEGER PRIMARY KEY);
      CREATE TABLE shift_definitions(
        id INTEGER PRIMARY KEY,
        start_hour TEXT
      );
      CREATE TABLE pickup_points(id INTEGER PRIMARY KEY);
      CREATE TABLE routes(
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        vehicle_plate TEXT,
        capacity INTEGER NOT NULL,
        driver_name TEXT,
        driver_phone TEXT,
        shift_def_id INTEGER REFERENCES shift_definitions(id)
      );
      CREATE TABLE route_stops(
        id INTEGER PRIMARY KEY,
        route_id INTEGER NOT NULL REFERENCES routes(id),
        pickup_point_id INTEGER REFERENCES pickup_points(id),
        scheduled_time TEXT
      );
      CREATE TABLE route_assignments(
        id INTEGER PRIMARY KEY,
        route_id INTEGER NOT NULL REFERENCES routes(id),
        stop_id INTEGER REFERENCES route_stops(id),
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        work_date TEXT NOT NULL,
        assigned_by INTEGER REFERENCES users(id),
        created_at TEXT,
        boarded INTEGER,
        boarded_marked_at TEXT,
        boarded_marked_by INTEGER REFERENCES users(id),
        is_waitlist INTEGER DEFAULT 0
      );
      CREATE TABLE system_settings(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO shift_definitions(id, start_hour) VALUES(1, '08:00');
      INSERT INTO pickup_points(id) VALUES(1);
      INSERT INTO staff(id) VALUES(1),(2),(3);
      INSERT INTO routes(
        id, name, vehicle_plate, capacity, driver_name, driver_phone, shift_def_id
      ) VALUES(1, 'Legacy Hat', '67 LEG 001', 2, 'Eski Şoför', '05321111111', 1);
      INSERT INTO route_stops(id, route_id, pickup_point_id, scheduled_time)
      VALUES(1, 1, 1, '07:30');
      INSERT INTO route_assignments(
        id, route_id, stop_id, staff_id, work_date, created_at,
        boarded, boarded_marked_at, is_waitlist
      ) VALUES
        (1, 1, 1, 1, '2025-01-10', '2025-01-09 10:00:00', 1, '2025-01-10 07:31:00', 0),
        (2, 1, 1, 2, '2025-01-10', '2025-01-09 10:01:00', 0, '2025-01-10 07:40:00', 0),
        (3, 1, 1, 3, '2025-01-10', '2025-01-09 10:02:00', NULL, NULL, 1);
    `)

    migrationDir = mkdtempSync(join(tmpdir(), 'transport-v2-migration-'))
    writeFileSync(
      join(migrationDir, '065_transport_v2_core.sql'),
      readFileSync(migrationPath, 'utf8'),
      'utf8',
    )

    expect(applyMigrations(db, migrationDir)).toHaveLength(1)
    expect(applyMigrations(db, migrationDir)).toHaveLength(0)

    expect(db.prepare('SELECT COUNT(*) AS c FROM transport_vehicles').get().c).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS c FROM transport_drivers').get().c).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS c FROM transport_trips').get().c).toBe(1)
    expect(db.prepare('SELECT status FROM transport_trips').get().status).toBe('completed')
    expect(db.prepare(`
      SELECT group_concat(status, ',') AS statuses
      FROM (SELECT status FROM transport_trip_assignments ORDER BY legacy_assignment_id)
    `).get().statuses).toBe('boarded,no_show,waitlisted')
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.close()
  })
})
