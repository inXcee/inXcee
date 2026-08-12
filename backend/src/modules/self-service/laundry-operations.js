import bcrypt from 'bcryptjs'
import { getDB } from '../../shared/db/index.js'
import { avsRoleGroup } from '../../shared/auth/avsRoles.js'
import { batchAssignService } from '../laundry/service.js'

const PROGRAMS = {
  standard: { label: 'Standart 40°', minutes: 45 },
  delicate: { label: 'Hassas 30°', minutes: 35 },
  intensive: { label: 'Yoğun 60°', minutes: 60 },
  quick: { label: 'Hızlı 30°', minutes: 30 },
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function estimateWeight(item) {
  const garments = parseArray(item.garments_json)
  const garmentEstimate = garments.reduce((total, garment) => {
    const name = String(garment.type_name || garment.name || '').toLocaleLowerCase('tr-TR')
    if (/mont|kaban|battaniye|nevresim/.test(name)) return total + 1.1
    if (/pantolon|kazak|havlu/.test(name)) return total + 0.55
    return total + 0.3
  }, 0)
  const pieceEstimate = Math.max(1, Number(item.item_count) || 1) * 0.35
  return Number(Math.max(garmentEstimate, pieceEstimate).toFixed(2))
}

function classify(item) {
  const text = `${item.item_details || ''} ${item.notes || ''} ${item.garments_json || ''}`.toLocaleLowerCase('tr-TR')
  const color = /beyaz|white/.test(text) ? 'white' : /siyah|koyu|black|lacivert/.test(text) ? 'dark' : 'mixed'
  const care = item.is_premium || /hassas|ipek|yün|delicate/.test(text) ? 'delicate' : 'standard'
  return { color, care }
}

function dirtyItems(db) {
  return db.prepare(`
    SELECT li.id, li.bag_no, li.item_count, li.urgent, li.is_premium,
           li.needs_ironing, li.item_details, li.notes, li.garments_json,
           li.created_at, r.block, r.room_no
    FROM laundry_items li LEFT JOIN rooms r ON r.id=li.room_id
    WHERE li.status='dirty'
    ORDER BY li.urgent DESC, li.created_at ASC, li.id ASC
  `).all().map(item => ({
    ...item,
    estimated_weight_kg: estimateWeight(item),
    ...classify(item),
  }))
}

function suggestionFor(machine, items) {
  const capacity = Number(machine.capacity_kg) || 10
  const first = items[0]
  if (!first) return { machine_id: machine.id, item_ids: [], estimated_weight_kg: 0, reasons: ['Yıkama bekleyen torba yok'] }
  const compatible = items.filter(item => item.care === first.care && (item.color === first.color || first.color === 'mixed'))
  const selected = []
  let total = 0
  for (const item of compatible) {
    if (total + item.estimated_weight_kg > capacity) continue
    selected.push(item)
    total += item.estimated_weight_kg
  }
  const program = first.care === 'delicate' ? 'delicate' : first.urgent ? 'quick' : 'standard'
  const fill = Math.round((total / capacity) * 100)
  return {
    machine_id: machine.id,
    machine_name: machine.name,
    capacity_kg: capacity,
    item_ids: selected.map(item => item.id),
    items: selected,
    estimated_weight_kg: Number(total.toFixed(2)),
    fill_percent: fill,
    program,
    timer_minutes: PROGRAMS[program].minutes,
    color_group: first.color,
    fabric_care: first.care,
    priority: selected.some(item => item.urgent) ? 'urgent' : 'normal',
    reasons: [
      `${selected.length} uyumlu torba`,
      `${total.toFixed(1)} / ${capacity} kg kapasite`,
      first.care === 'delicate' ? 'Hassas parçalar ayrı tutuldu' : 'Standart bakım grubu',
      selected.some(item => item.urgent) ? 'Acil kayıt öne alındı' : 'En eski kayıtlar öne alındı',
    ],
  }
}

export function getLoadSuggestions() {
  const db = getDB()
  const items = dirtyItems(db)
  const machines = db.prepare(`
    SELECT id, name, type, status, capacity_kg, timer_end
    FROM laundry_machines ORDER BY type, name
  `).all()
  return {
    programs: Object.entries(PROGRAMS).map(([value, details]) => ({ value, ...details })),
    items,
    machines,
    suggestions: machines.filter(machine => machine.type === 'washer' && ['idle','done'].includes(machine.status))
      .map(machine => suggestionFor(machine, items)),
  }
}

export function startMachineLoad(input, actor) {
  const db = getDB()
  const machine = db.prepare('SELECT * FROM laundry_machines WHERE id=?').get(input.machine_id)
  if (!machine) throw Object.assign(new Error('Makine bulunamadı'), { status: 404 })
  if (machine.type !== 'washer') throw Object.assign(new Error('Yük yalnız çamaşır makinesinde başlatılabilir'), { status: 409 })
  if (!['idle', 'done'].includes(machine.status)) throw Object.assign(new Error('Makine şu anda kullanılamıyor'), { status: 409 })
  if (!PROGRAMS[input.program]) throw Object.assign(new Error('Geçersiz yıkama programı'), { status: 400 })

  const ids = [...new Set((input.item_ids || []).map(Number))]
  if (!ids.length || ids.length > 50 || ids.some(id => !Number.isInteger(id))) {
    throw Object.assign(new Error('1-50 geçerli torba seçilmelidir'), { status: 400 })
  }
  const selected = dirtyItems(db).filter(item => ids.includes(item.id))
  if (selected.length !== ids.length) throw Object.assign(new Error('Seçilen torbalardan biri artık yıkama beklemiyor'), { status: 409 })
  const estimated = Number(selected.reduce((sum, item) => sum + item.estimated_weight_kg, 0).toFixed(2))
  const actual = input.actual_weight_kg == null ? estimated : Number(input.actual_weight_kg)
  if (!Number.isFinite(actual) || actual < 0) throw Object.assign(new Error('Gerçek ağırlık geçerli ve pozitif olmalıdır'), { status: 400 })
  const capacity = Number(machine.capacity_kg) || 10
  const careGroups = new Set(selected.map(item => item.care))
  const colorGroups = new Set(selected.map(item => item.color).filter(color => color !== 'mixed'))
  const needsOverride = actual > capacity || careGroups.size > 1 || colorGroups.size > 1
  if (needsOverride && String(input.override_reason || '').trim().length < 10) {
    throw Object.assign(new Error('Kapasite veya uyumluluk istisnası için en az 10 karakter gerekçe gereklidir'), { status: 409 })
  }

  const requestedTimer = input.timer_minutes == null ? PROGRAMS[input.program].minutes : Number(input.timer_minutes)
  if (!Number.isFinite(requestedTimer) || requestedTimer < 5 || requestedTimer > 180) {
    throw Object.assign(new Error('Yıkama süresi 5-180 dakika olmalıdır'), { status: 400 })
  }
  const timerMinutes = requestedTimer
  const assigned = batchAssignService(ids, machine.id, timerMinutes, actor.userId)
  if (!assigned.success.length) {
    throw Object.assign(new Error(assigned.failed[0]?.error || 'Yük başlatılamadı'), { status: 409 })
  }
  const load = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO laundry_machine_loads(
        machine_id, program, color_group, fabric_care, priority,
        estimated_weight_kg, actual_weight_kg, capacity_kg, override_reason,
        started_by_user_id, started_by_worker_id
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      machine.id, input.program, input.color_group || 'mixed', input.fabric_care || 'standard',
      selected.some(item => item.urgent) ? 'urgent' : 'normal', estimated, actual, capacity,
      input.override_reason?.trim() || null, actor.userId || null, actor.workerId || null,
    )
    const loadId = Number(result.lastInsertRowid)
    const insertItem = db.prepare('INSERT INTO laundry_machine_load_items(load_id,item_id,estimated_weight_kg) VALUES(?,?,?)')
    for (const item of selected.filter(row => assigned.success.includes(row.id))) {
      insertItem.run(loadId, item.id, item.estimated_weight_kg)
    }
    return db.prepare('SELECT * FROM laundry_machine_loads WHERE id=?').get(loadId)
  }).immediate()
  return { ...load, success: assigned.success, failed: assigned.failed, selected_count: selected.length }
}

export function markLoadProgress(itemId) {
  const db = getDB()
  const load = db.prepare(`
    SELECT l.* FROM laundry_machine_loads l
    JOIN laundry_machine_load_items li ON li.load_id=l.id
    WHERE li.item_id=? AND l.status='running' ORDER BY l.id DESC LIMIT 1
  `).get(itemId)
  if (!load) return null
  const remaining = db.prepare(`
    SELECT COUNT(*) AS count FROM laundry_machine_load_items li
    JOIN laundry_items item ON item.id=li.item_id
    WHERE li.load_id=? AND item.status='washing'
  `).get(load.id).count
  if (remaining === 0) {
    db.prepare("UPDATE laundry_machine_loads SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?").run(load.id)
    db.prepare("UPDATE laundry_machines SET status='done', timer_end=NULL WHERE id=?").run(load.machine_id)
  } else {
    db.prepare("UPDATE laundry_machines SET status='running' WHERE id=?").run(load.machine_id)
  }
  return { load_id: load.id, remaining }
}

function deviceIdFor(req) {
  if (!req.user?.jti) return null
  return getDB().prepare('SELECT device_id FROM auth_sessions WHERE jti=?').get(req.user.jti)?.device_id || null
}

function verifyLaundryWorker(workerId, pin) {
  const db = getDB()
  const worker = db.prepare(`
    SELECT s.id, s.full_name, s.kiosk_pin, d.name AS department_name
    FROM staff s LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.id=? AND s.is_active=1
  `).get(workerId)
  if (!worker || avsRoleGroup(worker.department_name) !== 'laundry') return null
  if (!worker.kiosk_pin || !bcrypt.compareSync(String(pin || ''), worker.kiosk_pin)) return null
  return worker
}

function handoverSummary(db) {
  const work = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('dirty','washing','ironing') THEN 1 ELSE 0 END) AS active_jobs,
      SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS pending_deliveries,
      SUM(CASE WHEN urgent=1 AND status NOT IN ('delivered','lost') THEN 1 ELSE 0 END) AS urgent_jobs
    FROM laundry_items
  `).get()
  const machines = db.prepare(`SELECT id,name,status,timer_end FROM laundry_machines ORDER BY name`).all()
  const supplies = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN current_stock<=critical_threshold AND critical_threshold>0 THEN 1 ELSE 0 END) AS critical
    FROM laundry_supplies WHERE is_active=1
  `).get()
  return { ...work, machines, supplies }
}

export function listHandoverWorkers(query = '') {
  const rows = getDB().prepare(`
    SELECT s.id, s.full_name, s.role_label, d.name AS department_name
    FROM staff s LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.is_active=1 AND s.full_name LIKE ? ORDER BY s.full_name LIMIT 20
  `).all(`%${String(query).trim()}%`)
  return rows.filter(row => avsRoleGroup(row.department_name) === 'laundry')
    .map(({ department_name, ...row }) => row)
}

export function getCurrentHandover(req) {
  const db = getDB()
  const deviceId = deviceIdFor(req)
  const row = deviceId
    ? db.prepare("SELECT * FROM laundry_shift_handovers WHERE device_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(deviceId)
    : db.prepare("SELECT * FROM laundry_shift_handovers WHERE outgoing_worker_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(req.laundryOperator?.id)
  if (!row) return { handover: null, summary: handoverSummary(db) }
  return { ...row, summary: JSON.parse(row.summary_json || '{}'), issues: JSON.parse(row.issues_json || '[]') }
}

export function startHandover(req, input) {
  const actor = req.laundryOperator
  if (actor?.type !== 'worker') throw Object.assign(new Error('Vardiya teslimi personel kiosk oturumu gerektirir'), { status: 403 })
  if (Number(input.offline_queue_count || 0) > 0) throw Object.assign(new Error('Vardiya tesliminden önce offline kuyruk boşaltılmalıdır'), { status: 409 })
  const outgoing = verifyLaundryWorker(actor.id, input.outgoing_pin)
  if (!outgoing) throw Object.assign(new Error('Çıkan personel PIN doğrulaması başarısız'), { status: 401 })
  const db = getDB()
  const deviceId = deviceIdFor(req)
  const existing = deviceId
    ? db.prepare("SELECT id FROM laundry_shift_handovers WHERE device_id=? AND status='open'").get(deviceId)
    : db.prepare("SELECT id FROM laundry_shift_handovers WHERE outgoing_worker_id=? AND status='open'").get(actor.id)
  if (existing) throw Object.assign(new Error('Bu cihazda açık bir vardiya teslimi zaten var'), { status: 409 })
  const summary = handoverSummary(db)
  const result = db.prepare(`
    INSERT INTO laundry_shift_handovers(device_id,outgoing_worker_id,summary_json,offline_queue_count)
    VALUES(?,?,?,0)
  `).run(deviceId, actor.id, JSON.stringify(summary))
  return { id: Number(result.lastInsertRowid), status: 'open', outgoing_worker: outgoing.full_name, summary }
}

export function finalizeHandover(req, handoverId, input) {
  const db = getDB()
  const actor = req.laundryOperator
  const handover = db.prepare("SELECT * FROM laundry_shift_handovers WHERE id=? AND status='open'").get(handoverId)
  if (!handover) throw Object.assign(new Error('Açık vardiya teslimi bulunamadı'), { status: 404 })
  if (actor?.type !== 'worker' || actor.id !== handover.outgoing_worker_id) {
    throw Object.assign(new Error('Vardiya teslimini yalnız başlatan personel tamamlayabilir'), { status: 403 })
  }
  if (Number(input.offline_queue_count || 0) > 0) throw Object.assign(new Error('Offline kuyruk boşalmadan teslim tamamlanamaz'), { status: 409 })
  if (Number(input.incoming_worker_id) === handover.outgoing_worker_id) {
    throw Object.assign(new Error('Çıkan ve devralan personel farklı olmalıdır'), { status: 400 })
  }
  const incoming = verifyLaundryWorker(Number(input.incoming_worker_id), input.incoming_pin)
  if (!incoming) throw Object.assign(new Error('Devralan personel PIN doğrulaması başarısız'), { status: 401 })
  const issues = Array.isArray(input.issues) ? input.issues.map(value => String(value).trim()).filter(Boolean).slice(0, 20) : []
  db.prepare(`
    UPDATE laundry_shift_handovers SET incoming_worker_id=?, status='completed',
      issues_json=?, note=?, offline_queue_count=0,
      incoming_verified_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(incoming.id, JSON.stringify(issues), String(input.note || '').trim().slice(0, 1000) || null, handover.id)
  return { id: handover.id, status: 'completed', incoming_worker: incoming.full_name, completed_at: new Date().toISOString() }
}
