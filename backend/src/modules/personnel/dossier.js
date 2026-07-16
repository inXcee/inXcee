import { getDB } from '../../shared/db/index.js'

const TIMELINE_KINDS = new Set([
  'shift', 'leave', 'overtime', 'attendance', 'document', 'performance',
  'goal', 'training', 'safety', 'equipment', 'checklist', 'transport',
  'discipline', 'note', 'followup',
])

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

function daysFromToday(value) {
  if (!value) return null
  const today = new Date(`${isoToday()}T00:00:00Z`)
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(target.getTime())) return null
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function currentPerson(db, staffId) {
  return db.prepare(`
    SELECT s.*,
      d.name AS dept_name,
      d.color_class AS dept_color,
      sr.name AS role_name,
      wl.name AS primary_work_location_name,
      wl.site AS primary_work_location_site,
      wl.color_class AS primary_work_location_color,
      sa.id AS current_assignment_id,
      sa.department_id AS assignment_department_id,
      sa.role_id AS assignment_role_id,
      sa.work_location_id AS primary_work_location_id,
      sa.effective_from AS assignment_effective_from,
      sa.effective_to AS assignment_effective_to
    FROM staff s
    LEFT JOIN staff_assignments sa ON sa.id = (
      SELECT current_sa.id
      FROM staff_assignments current_sa
      WHERE current_sa.staff_id = s.id
        AND current_sa.effective_from <= date('now', 'localtime')
        AND (current_sa.effective_to IS NULL OR current_sa.effective_to >= date('now', 'localtime'))
      ORDER BY current_sa.effective_from DESC, current_sa.id DESC
      LIMIT 1
    )
    LEFT JOIN departments d ON d.id = CASE
      WHEN sa.id IS NOT NULL THEN sa.department_id ELSE s.department_id
    END
    LEFT JOIN staff_roles sr ON sr.id = CASE
      WHEN sa.id IS NOT NULL THEN sa.role_id ELSE s.role_id
    END
    LEFT JOIN work_locations wl ON wl.id = sa.work_location_id
    WHERE s.id = ?
  `).get(staffId)
}

function resolveIdentityLink(db, person) {
  const linked = db.prepare(`
    SELECT spl.personnel_id, spl.link_method, spl.link_status, spl.linked_at,
      p.full_name AS dorm_full_name, p.check_in_date, p.check_out_date,
      p.discipline_points, p.is_blacklisted
    FROM staff_personnel_links spl
    JOIN personnel p ON p.id = spl.personnel_id
    WHERE spl.staff_id = ?
  `).get(person.id)

  if (linked) {
    return {
      status: linked.link_status,
      personnel_id: linked.personnel_id,
      method: linked.link_method,
      linked_at: linked.linked_at,
      dorm_full_name: linked.dorm_full_name,
      check_in_date: linked.check_in_date,
      check_out_date: linked.check_out_date,
      discipline_points: linked.discipline_points || 0,
      is_blacklisted: linked.is_blacklisted || 0,
    }
  }

  const tcNo = String(person.tc_no || '').trim()
  if (!tcNo) return { status: 'missing_tc', personnel_id: null, match_count: 0 }

  const staffMatches = db.prepare(
    'SELECT COUNT(*) AS count FROM staff WHERE tc_no IS NOT NULL AND trim(tc_no)=?'
  ).get(tcNo).count
  const dormMatches = db.prepare(
    'SELECT COUNT(*) AS count FROM personnel WHERE tc_no IS NOT NULL AND trim(tc_no)=?'
  ).get(tcNo).count

  if (staffMatches > 1) {
    return { status: 'duplicate_staff_tc', personnel_id: null, match_count: dormMatches }
  }
  if (dormMatches > 1) {
    return { status: 'duplicate_personnel_tc', personnel_id: null, match_count: dormMatches }
  }
  if (dormMatches === 0) return { status: 'unmatched', personnel_id: null, match_count: 0 }

  const dorm = db.prepare(`
    SELECT id, full_name, check_in_date, check_out_date, discipline_points, is_blacklisted
    FROM personnel
    WHERE tc_no IS NOT NULL AND trim(tc_no)=?
  `).get(tcNo)
  return {
    status: 'unique_match_unlinked',
    personnel_id: dorm.id,
    match_count: 1,
    dorm_full_name: dorm.full_name,
    check_in_date: dorm.check_in_date,
    check_out_date: dorm.check_out_date,
    discipline_points: dorm.discipline_points || 0,
    is_blacklisted: dorm.is_blacklisted || 0,
  }
}

function documentSummary(db, person) {
  const requirements = db.prepare(`
    SELECT id, document_kind, display_name, requires_expiry, visibility
    FROM staff_document_requirements
    WHERE is_active=1
      AND (department_id IS NULL OR department_id=?)
      AND (role_id IS NULL OR role_id=?)
    ORDER BY display_name
  `).all(person.department_id || null, person.role_id || null)

  const documents = db.prepare(`
    SELECT id, document_kind, title, expires_on, visibility, uploaded_at
    FROM documents
    WHERE staff_id=? AND archived_at IS NULL
    ORDER BY uploaded_at DESC, id DESC
  `).all(person.id)
  const latestByKind = new Map()
  for (const document of documents) {
    if (!latestByKind.has(document.document_kind)) latestByKind.set(document.document_kind, document)
  }

  const today = isoToday()
  const expiringCutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const missing = requirements
    .filter(requirement => !latestByKind.has(requirement.document_kind))
    .map(requirement => ({
      requirement_id: requirement.id,
      document_kind: requirement.document_kind,
      display_name: requirement.display_name,
      visibility: requirement.visibility,
    }))
  const expired = documents.filter(document => document.expires_on && document.expires_on < today)
  const expiring = documents.filter(document =>
    document.expires_on
    && document.expires_on >= today
    && document.expires_on <= expiringCutoff
  )
  const completed = Math.max(0, requirements.length - missing.length)
  return {
    required: requirements.length,
    completed,
    missing: missing.length,
    expired: expired.length,
    expiring: expiring.length,
    completion_rate: requirements.length ? Math.round((completed / requirements.length) * 100) : 100,
    missing_items: missing,
  }
}

function addUpcoming(items, value, kind, title, severity = 'info', entityId = null, extra = {}) {
  if (!value) return
  items.push({
    date: String(value).slice(0, 10),
    kind,
    title,
    severity,
    entity_id: entityId,
    days_remaining: daysFromToday(value),
    ...extra,
  })
}

function buildRisks({ person, identityLink, documents, counters, upcoming }) {
  const risks = []
  const add = (code, title, severity, count = 1) => risks.push({ code, title, severity, count })

  if (identityLink.status !== 'confirmed') {
    add('identity_link', 'Yatakhane personel eşleşmesi kontrol edilmeli', 'warning')
  }
  if (documents.missing) add('missing_documents', `${documents.missing} zorunlu belge eksik`, 'warning', documents.missing)
  if (documents.expired) add('expired_documents', `${documents.expired} belgenin süresi dolmuş`, 'critical', documents.expired)
  if (counters.open_attendance_exceptions) {
    add('attendance_exceptions', `${counters.open_attendance_exceptions} açık devam istisnası`, 'warning', counters.open_attendance_exceptions)
  }
  if (counters.overdue_followups) {
    add('overdue_followups', `${counters.overdue_followups} gecikmiş görev`, 'critical', counters.overdue_followups)
  }
  if (counters.expired_certificates) {
    add('expired_certificates', `${counters.expired_certificates} sertifikanın süresi dolmuş`, 'critical', counters.expired_certificates)
  }
  if (counters.open_offboarding && (counters.active_inventory || counters.active_kkd)) {
    add('offboarding_equipment', 'Çıkış sürecinde iade edilmemiş ekipman var', 'critical')
  }
  if (!person.department_id) add('missing_department', 'Departman ataması eksik', 'warning')
  if (!person.role_id) add('missing_role', 'Personel rolü eksik', 'warning')
  if (!person.primary_work_location_id) add('missing_location', 'Çalışma lokasyonu eksik', 'warning')
  if (person.contract_end && daysFromToday(person.contract_end) <= 30) {
    add('contract_expiring', 'Sözleşme bitiş tarihi yaklaşıyor', daysFromToday(person.contract_end) < 0 ? 'critical' : 'warning')
  }

  const urgentUpcoming = upcoming.filter(item => item.days_remaining != null && item.days_remaining >= 0 && item.days_remaining <= 7)
  if (urgentUpcoming.length) add('upcoming_deadlines', `${urgentUpcoming.length} yakın tarihli işlem var`, 'warning', urgentUpcoming.length)
  return risks
}

function dataQuality(person, identityLink) {
  const missingFields = []
  const check = (value, field, label) => {
    if (value === null || value === undefined || String(value).trim() === '') {
      missingFields.push({ field, label })
    }
  }
  check(person.tc_no, 'tc_no', 'TC kimlik numarası')
  check(person.phone, 'phone', 'Telefon')
  check(person.department_id, 'department_id', 'Departman')
  check(person.role_id, 'role_id', 'Personel rolü')
  check(person.primary_work_location_id, 'primary_work_location_id', 'Çalışma lokasyonu')
  check(person.hire_date, 'hire_date', 'İşe giriş tarihi')
  check(person.emergency_phone, 'emergency_phone', 'Acil iletişim telefonu')
  return {
    missing_fields: missingFields,
    missing_count: missingFields.length,
    identity_link_status: identityLink.status,
    is_complete: missingFields.length === 0 && identityLink.status === 'confirmed',
  }
}

export function getDossier(staffId, { includeSensitive = false } = {}) {
  const db = getDB()
  const person = currentPerson(db, staffId)
  if (!person) return null

  if (person.current_assignment_id) {
    person.department_id = person.assignment_department_id
    person.role_id = person.assignment_role_id
  }

  const identityLink = resolveIdentityLink(db, person)
  const today = isoToday()
  const last30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)

  const todayShift = db.prepare(`
    SELECT ss.id, ss.work_date, ss.status, ss.leave_type, ss.absent_reason,
      sd.name AS shift_name, sd.start_hour, sd.end_hour,
      wl.name AS work_location_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id=ss.work_location_id
    WHERE ss.staff_id=? AND ss.work_date=?
    LIMIT 1
  `).get(staffId, today) || null

  const nextShift = db.prepare(`
    SELECT ss.id, ss.work_date, ss.status,
      sd.name AS shift_name, sd.start_hour, sd.end_hour,
      wl.name AS work_location_name
    FROM shift_schedule ss
    LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
    LEFT JOIN work_locations wl ON wl.id=ss.work_location_id
    WHERE ss.staff_id=? AND ss.work_date>? AND ss.status NOT IN ('off','on_leave')
    ORDER BY ss.work_date
    LIMIT 1
  `).get(staffId, today) || null

  const work30 = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status IN ('worked','overtime') THEN 1 ELSE 0 END) AS worked,
      SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
      SUM(CASE WHEN status='off' THEN 1 ELSE 0 END) AS off_days
    FROM shift_schedule
    WHERE staff_id=? AND work_date BETWEEN ? AND ?
  `).get(staffId, last30, today)

  const documents = documentSummary(db, person)
  const counters = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM staff_followups
        WHERE staff_id=@staff_id AND status='open') AS open_followups,
      (SELECT COUNT(*) FROM staff_followups
        WHERE staff_id=@staff_id AND status='open' AND due_at IS NOT NULL
          AND due_at < datetime('now', 'localtime')) AS overdue_followups,
      (SELECT COUNT(*) FROM attendance_exceptions
        WHERE staff_id=@staff_id AND status='open') AS open_attendance_exceptions,
      (SELECT COUNT(*) FROM inventory_checkouts
        WHERE staff_id=@staff_id AND returned_at IS NULL
          AND (quantity-COALESCE(returned_qty,0))>0) AS active_inventory,
      (SELECT COUNT(*) FROM kkd_assignments
        WHERE staff_id=@staff_id AND returned_at IS NULL) AS active_kkd,
      (SELECT COUNT(*) FROM training_attendances
        WHERE staff_id=@staff_id AND attended=1 AND cert_expires_at IS NOT NULL
          AND cert_expires_at < date('now', 'localtime')) AS expired_certificates,
      (SELECT COUNT(*) FROM training_attendances
        WHERE staff_id=@staff_id AND attended=1 AND cert_expires_at BETWEEN
          date('now', 'localtime') AND date('now', 'localtime', '+30 days')) AS expiring_certificates,
      (SELECT COUNT(*) FROM work_accidents
        WHERE staff_id=@staff_id AND status<>'closed') AS open_accidents,
      (SELECT COUNT(*) FROM hr_checklists
        WHERE staff_id=@staff_id AND kind='onboarding' AND status='open') AS open_onboarding,
      (SELECT COUNT(*) FROM hr_checklists
        WHERE staff_id=@staff_id AND kind='offboarding' AND status='open') AS open_offboarding,
      (SELECT COUNT(*) FROM performance_goals
        WHERE staff_id=@staff_id AND status IN ('open','in_progress')) AS active_goals,
      (SELECT COALESCE(SUM(points),0) FROM positive_points
        WHERE staff_id=@staff_id) AS positive_points
  `).get({ staff_id: staffId })

  const latestPerformance = db.prepare(`
    SELECT id, period, total_score, reviewed_at
    FROM performance_reviews
    WHERE staff_id=?
    ORDER BY reviewed_at DESC, id DESC
    LIMIT 1
  `).get(staffId) || null

  const upcoming = []
  addUpcoming(upcoming, person.contract_end, 'contract', 'Sözleşme bitişi',
    person.contract_end < today ? 'critical' : 'warning')
  const expiringDocuments = db.prepare(`
    SELECT id, title, document_kind, expires_on, visibility
    FROM documents
    WHERE staff_id=? AND archived_at IS NULL AND expires_on IS NOT NULL
    ORDER BY expires_on
    LIMIT 20
  `).all(staffId)
  for (const document of expiringDocuments) {
    addUpcoming(upcoming, document.expires_on, 'document', document.title,
      document.expires_on < today ? 'critical' : 'warning', document.id,
      { visibility: document.visibility })
  }
  const certificates = db.prepare(`
    SELECT a.id, a.cert_expires_at, t.title
    FROM training_attendances a
    JOIN training_sessions t ON t.id=a.session_id
    WHERE a.staff_id=? AND a.attended=1 AND a.cert_expires_at IS NOT NULL
    ORDER BY a.cert_expires_at
    LIMIT 20
  `).all(staffId)
  for (const certificate of certificates) {
    addUpcoming(upcoming, certificate.cert_expires_at, 'certificate', certificate.title,
      certificate.cert_expires_at < today ? 'critical' : 'warning', certificate.id)
  }
  const followups = db.prepare(`
    SELECT id, title, due_at, priority
    FROM staff_followups
    WHERE staff_id=? AND status='open' AND due_at IS NOT NULL
    ORDER BY due_at
    LIMIT 20
  `).all(staffId)
  for (const followup of followups) {
    addUpcoming(upcoming, followup.due_at, 'followup', followup.title,
      followup.due_at < `${today}T00:00:00` || followup.priority === 'critical' ? 'critical' : 'warning',
      followup.id)
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))

  const room = identityLink.personnel_id ? db.prepare(`
    SELECT ra.id AS assignment_id, ra.assigned_at, ra.bed_no,
      r.id AS room_id, r.block, r.floor, r.room_no
    FROM room_assignments ra
    JOIN rooms r ON r.id=ra.room_id
    WHERE ra.personnel_id=? AND ra.check_out_at IS NULL
    LIMIT 1
  `).get(identityLink.personnel_id) || null : null

  const risks = buildRisks({ person, identityLink, documents, counters, upcoming })
  const quality = dataQuality(person, identityLink)
  const recentActivity = getDossierTimeline(staffId, {
    from: last30,
    to: today,
    limit: 8,
    includeSensitive,
  })
  return {
    person,
    identity_link: identityLink,
    today: {
      shift: todayShift,
      attendance: db.prepare(`
        SELECT id, check_in_at, check_out_at, actual_hours
        FROM attendance_logs
        WHERE staff_id=? AND (
          date(check_in_at, 'localtime')=? OR date(check_out_at, 'localtime')=?
        )
        ORDER BY id DESC LIMIT 1
      `).get(staffId, today, today) || null,
    },
    next_shift: nextShift,
    work_30d: {
      total: work30.total || 0,
      worked: work30.worked || 0,
      absent: work30.absent || 0,
      on_leave: work30.on_leave || 0,
      off_days: work30.off_days || 0,
      overtime_hours: db.prepare(`
        SELECT COALESCE(SUM(hours),0) AS hours
        FROM overtime_records
        WHERE staff_id=? AND work_date BETWEEN ? AND ?
      `).get(staffId, last30, today).hours,
    },
    documents,
    counters,
    latest_performance: latestPerformance,
    room,
    upcoming: upcoming.slice(0, 12).map(item => {
      if (includeSensitive || item.visibility !== 'sensitive') return item
      return { ...item, title: 'Hassas belge süresi' }
    }),
    data_quality: quality,
    recent_activity: recentActivity?.items || [],
    risks,
    risk_score: risks.reduce((score, risk) =>
      score + (risk.severity === 'critical' ? 20 : risk.severity === 'warning' ? 10 : 3), 0),
  }
}

function timelineBounds(options = {}) {
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1)
  const limit = Math.max(1, Math.min(100, Number.parseInt(options.limit, 10) || 30))
  const defaultTo = isoToday()
  const defaultFrom = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const validDate = value =>
    typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  const to = validDate(options.to) ? options.to : defaultTo
  const from = validDate(options.from) ? options.from : defaultFrom
  const requestedKinds = Array.isArray(options.kinds) ? options.kinds : []
  const kinds = requestedKinds.filter(kind => TIMELINE_KINDS.has(kind))
  return { page, limit, from, to, kinds, kindFilterApplied: requestedKinds.length > 0 }
}

function event({ id, date, kind, title, status = null, severity = 'info', entityId = null, route = null }) {
  return { id: `${kind}-${id}`, date, kind, title, status, severity, entity_id: entityId ?? id, route }
}

export function getDossierTimeline(staffId, options = {}) {
  const db = getDB()
  const person = db.prepare('SELECT id, tc_no FROM staff WHERE id=?').get(staffId)
  if (!person) return null
  const { page, limit, from, to, kinds, kindFilterApplied } = timelineBounds(options)
  const includeSensitive = options.includeSensitive === true
  const accepts = kind => !kindFilterApplied || kinds.includes(kind)
  const events = []

  if (accepts('shift')) {
    const rows = db.prepare(`
      SELECT ss.id, ss.work_date, ss.status, sd.name AS shift_name
      FROM shift_schedule ss
      LEFT JOIN shift_definitions sd ON sd.id=ss.shift_def_id
      WHERE ss.staff_id=? AND ss.work_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.work_date, kind: 'shift',
      title: `${row.shift_name || 'Vardiya'} · ${row.status}`, status: row.status,
      severity: row.status === 'absent' ? 'critical' : row.status === 'on_leave' ? 'warning' : 'info',
      route: `/shifts?tab=schedule&staff=${staffId}&date=${row.work_date}`,
    }))
  }

  if (accepts('leave')) {
    const rows = db.prepare(`
      SELECT id, start_date, leave_type, total_days, status
      FROM leave_requests WHERE staff_id=? AND start_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.start_date, kind: 'leave',
      title: `${row.leave_type} izni · ${row.total_days} gün`, status: row.status,
      severity: row.status === 'rejected' ? 'warning' : 'info',
    }))
  }

  if (accepts('overtime')) {
    const rows = db.prepare(`
      SELECT id, work_date, hours, reason
      FROM overtime_records WHERE staff_id=? AND work_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.work_date, kind: 'overtime',
      title: `${row.hours} saat mesai${row.reason ? ` · ${row.reason}` : ''}`,
    }))
  }

  if (accepts('attendance')) {
    const rows = db.prepare(`
      SELECT id, work_date, severity, status, message
      FROM attendance_exceptions WHERE staff_id=? AND work_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.work_date, kind: 'attendance',
      title: row.message, status: row.status, severity: row.severity,
    }))
  }

  if (accepts('document')) {
    const rows = db.prepare(`
      SELECT id, uploaded_at, archived_at, title, document_kind, visibility
      FROM documents WHERE staff_id=? AND date(uploaded_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) {
      if (!includeSensitive && row.visibility === 'sensitive') continue
      events.push(event({
        id: row.id, date: row.uploaded_at, kind: 'document',
        title: `${row.title} · ${row.document_kind}`,
        status: row.archived_at ? 'archived' : 'active',
        route: `/shifts/personnel/${staffId}?tab=documents&document=${row.id}`,
      }))
    }
  }

  if (accepts('performance')) {
    const rows = db.prepare(`
      SELECT id, reviewed_at, period, total_score
      FROM performance_reviews WHERE staff_id=? AND date(reviewed_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.reviewed_at, kind: 'performance',
      title: `${row.period} performans değerlendirmesi · ${row.total_score ?? '—'}`,
      route: `/shifts/personnel/${staffId}?tab=performance`,
    }))
  }

  if (accepts('goal')) {
    const rows = db.prepare(`
      SELECT id, created_at, title, status, progress
      FROM performance_goals WHERE staff_id=? AND date(created_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.created_at, kind: 'goal',
      title: `${row.title} · %${row.progress}`, status: row.status,
      severity: row.status === 'cancelled' ? 'warning' : 'info',
    }))
  }

  if (accepts('training')) {
    const rows = db.prepare(`
      SELECT a.id, t.session_date, t.title, a.attended, a.score
      FROM training_attendances a
      JOIN training_sessions t ON t.id=a.session_id
      WHERE a.staff_id=? AND t.session_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.session_date, kind: 'training',
      title: `${row.title}${row.score != null ? ` · puan ${row.score}` : ''}`,
      status: row.attended ? 'attended' : 'missed', severity: row.attended ? 'info' : 'warning',
    }))
  }

  if (accepts('safety')) {
    const rows = db.prepare(`
      SELECT id, accident_date, description, severity, status
      FROM work_accidents WHERE staff_id=? AND accident_date BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.accident_date, kind: 'safety',
      title: `İş kazası · ${row.description}`, status: row.status,
      severity: ['lost_time', 'fatal'].includes(row.severity) ? 'critical' : 'warning',
      route: `/safety?tab=accidents&id=${row.id}`,
    }))
  }

  if (accepts('equipment')) {
    const inventory = db.prepare(`
      SELECT ic.id, ic.checked_out_at, ic.returned_at, i.item_name, ic.quantity
      FROM inventory_checkouts ic
      JOIN inventory i ON i.id=ic.item_id
      WHERE ic.staff_id=? AND date(ic.checked_out_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of inventory) events.push(event({
      id: `inventory-${row.id}`, date: row.checked_out_at, kind: 'equipment',
      title: `${row.item_name} · ${row.quantity} teslim`,
      status: row.returned_at ? 'returned' : 'active', entityId: row.id,
    }))
    const kkd = db.prepare(`
      SELECT id, assigned_at, returned_at, item_type
      FROM kkd_assignments WHERE staff_id=? AND date(assigned_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of kkd) events.push(event({
      id: `kkd-${row.id}`, date: row.assigned_at, kind: 'equipment',
      title: `${row.item_type} KKD teslimi`,
      status: row.returned_at ? 'returned' : 'active', entityId: row.id,
    }))
  }

  if (accepts('checklist')) {
    const rows = db.prepare(`
      SELECT id, started_at, kind, status
      FROM hr_checklists WHERE staff_id=? AND date(started_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.started_at, kind: 'checklist',
      title: row.kind === 'onboarding' ? 'İşe giriş süreci' : 'İşten çıkış süreci',
      status: row.status, severity: row.status === 'open' ? 'warning' : 'info',
    }))
  }

  if (accepts('transport')) {
    const rows = db.prepare(`
      SELECT ra.id, ra.work_date, r.name AS route_name
      FROM route_assignments ra JOIN routes r ON r.id=ra.route_id
      WHERE ra.staff_id=? AND ra.work_date BETWEEN ? AND ? AND ra.boarded=0
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.work_date, kind: 'transport',
      title: `${row.route_name} servisine binmedi`, status: 'no_show', severity: 'warning',
    }))
  }

  const identityLink = resolveIdentityLink(db, person)
  if (accepts('discipline') && identityLink.personnel_id) {
    const rows = db.prepare(`
      SELECT id, created_at, card_type, reason
      FROM discipline_records
      WHERE personnel_id=? AND date(created_at) BETWEEN ? AND ?
    `).all(identityLink.personnel_id, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.created_at, kind: 'discipline',
      title: `${row.card_type} kart · ${row.reason}`,
      severity: row.card_type === 'red' ? 'critical' : 'warning',
    }))
  }

  if (accepts('note')) {
    const rows = db.prepare(`
      SELECT id, created_at, category, pinned, visibility
      FROM staff_notes
      WHERE staff_id=? AND archived_at IS NULL AND date(created_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) {
      if (!includeSensitive && row.visibility === 'sensitive') continue
      events.push(event({
        id: row.id, date: row.created_at, kind: 'note',
        title: `${row.category} notu${row.pinned ? ' · sabitlendi' : ''}`,
      }))
    }
  }

  if (accepts('followup')) {
    const rows = db.prepare(`
      SELECT id, created_at, title, status, priority
      FROM staff_followups WHERE staff_id=? AND date(created_at) BETWEEN ? AND ?
    `).all(staffId, from, to)
    for (const row of rows) events.push(event({
      id: row.id, date: row.created_at, kind: 'followup', title: row.title, status: row.status,
      severity: row.priority === 'critical' ? 'critical' : row.priority === 'high' ? 'warning' : 'info',
    }))
  }

  events.sort((a, b) => {
    const dateOrder = String(b.date || '').localeCompare(String(a.date || ''))
    return dateOrder || String(b.id).localeCompare(String(a.id))
  })
  const total = events.length
  const offset = (page - 1) * limit
  return {
    items: events.slice(offset, offset + limit),
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    filters: { from, to, kinds },
    available_kinds: [...TIMELINE_KINDS],
  }
}
