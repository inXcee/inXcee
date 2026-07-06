// Sakin (personnel) Excel toplu içe aktarımı — uzlaştırma + DB yazımı.
//
// Frontend ham Excel'i kanonik satırlara çevirir (bkz. frontend
// personnel/logic/excelImport.js) ve buraya gönderir:
//   { rows: [{ fullName, tcNo, passportNo, company, phone, hometown,
//              jobTitle, gender, block, roomNo, checkInDate }] }
//
// Mevcut sakin TC ile, yoksa aksan-katlamalı isimle eşlenir (mükerrer önlenir).
// dryRun=true hiçbir şey yazmaz, "ne olurdu" raporu döndürür. Yazım tek
// transaction; oturum personnel_import_batches'a kaydedilir (tek-tık undo).
//
// Oda ataması: blok+oda verilirse kapasite kontrolüyle sıradaki yatağa atanır.
// Checkin akışındaki vardiya-çakışma kuralı burada uygulanmaz (içe aktarılan
// sakinlerin henüz vardiya kaydı yok); kapasite + aktif-oda kontrolü yapılır.

import { getDB } from '../../shared/db/index.js'
import { normalizeName, foldName } from '../shifts/import.js'
import { guessGender } from '../shifts/nameGender.js'

// 'E'/'ERKEK'/'M' → male, 'K'/'KADIN'/'F' → female; tanınmazsa null.
export function parseGender(raw) {
  const s = String(raw || '').trim().toLocaleUpperCase('tr')
  if (!s) return null
  if (['E', 'M', 'ERKEK', 'MALE', 'BAY'].includes(s)) return 'male'
  if (['K', 'F', 'KADIN', 'FEMALE', 'BAYAN'].includes(s)) return 'female'
  return null
}

// TC alanını sadece rakama indir; 11 hane değilse geçersiz say.
export function normalizeTc(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return { tc: null, invalid: false }
  return /^\d{11}$/.test(digits) ? { tc: digits, invalid: false } : { tc: null, invalid: true }
}

export function importPersonnel(payload, userId, { dryRun = false } = {}) {
  const db = getDB()
  const rows = (payload?.rows || []).filter(r => String(r?.fullName || '').trim())

  // ── Mevcut sakinleri indeksle ──
  const existing = db.prepare('SELECT id, tc_no, full_name FROM personnel').all()
  const byTc = new Map(existing.filter(p => p.tc_no).map(p => [p.tc_no, p]))
  const byName = new Map(existing.map(p => [normalizeName(p.full_name), p]))
  const byFold = new Map()
  for (const p of existing) {
    const k = foldName(p.full_name)
    if (k && !byFold.has(k)) byFold.set(k, p)
  }

  // ── Odaları indeksle (aktif olanlar) + mevcut doluluk ──
  const roomRows = db.prepare(`
    SELECT r.id, r.block, r.room_no, r.active_beds, r.status,
      (SELECT COUNT(*) FROM room_assignments ra WHERE ra.room_id = r.id AND ra.check_out_at IS NULL) AS occupied
    FROM rooms r
  `).all()
  const roomKey = (block, roomNo) => `${String(block || '').trim().toLocaleUpperCase('tr')}|${String(roomNo || '').trim()}`
  const roomByKey = new Map(roomRows.map(r => [roomKey(r.block, r.room_no), r]))
  const plannedOccupancy = new Map() // room.id → planlanan toplam (mevcut + bu içe aktarım)

  const report = {
    total: rows.length,
    matched: 0,
    matchedNames: [],
    fuzzyMatched: [],
    created: [],
    genderGuessed: 0,
    genderUnknown: [],
    invalidTc: [],
    duplicateRows: 0,
    rooms: { assigned: 0, warnings: [] },
  }

  // ── Satırları planla (yazmadan) ──
  const seenTc = new Set()
  const seenFold = new Set()
  const plan = [] // { name, tc, passport, company, phone, hometown, jobTitle, gender, checkInDate, room? }

  for (const r of rows) {
    const name = String(r.fullName).trim().replace(/\s+/g, ' ')
    const { tc, invalid } = normalizeTc(r.tcNo)
    if (invalid) report.invalidTc.push({ name, tcNo: String(r.tcNo) })

    // Dosya içi mükerrer: aynı TC ya da aynı katlanmış isim ikinci kez gelirse atla.
    const fold = foldName(name)
    if ((tc && seenTc.has(tc)) || (!tc && fold && seenFold.has(fold))) {
      report.duplicateRows++
      continue
    }
    if (tc) seenTc.add(tc)
    if (fold) seenFold.add(fold)

    // Mevcut sakinle eşleştir: önce TC, sonra birebir isim, sonra katlanmış isim.
    const match = (tc && byTc.get(tc)) || byName.get(normalizeName(name)) || null
    const foldMatch = !match ? byFold.get(fold) : null
    if (match || foldMatch) {
      report.matched++
      report.matchedNames.push(name)
      if (!match && foldMatch) report.fuzzyMatched.push({ excelName: name, matchedTo: foldMatch.full_name })
      continue
    }

    const gender = parseGender(r.gender) || guessGender(name)
    if (gender) report.genderGuessed++
    else report.genderUnknown.push(name)

    // Oda planı (blok+oda verildiyse).
    let room = null
    if (r.block || r.roomNo) {
      const key = roomKey(r.block, r.roomNo)
      const found = roomByKey.get(key)
      if (!found) {
        report.rooms.warnings.push({ name, message: `Oda bulunamadı: ${String(r.block || '?')}-${String(r.roomNo || '?')}` })
      } else if (found.status !== 'active') {
        report.rooms.warnings.push({ name, message: `Oda aktif değil (${found.status}): ${found.block}-${found.room_no}` })
      } else {
        const planned = plannedOccupancy.get(found.id) ?? found.occupied
        if (planned >= found.active_beds) {
          report.rooms.warnings.push({ name, message: `Oda dolu: ${found.block}-${found.room_no} (${found.active_beds} yatak)` })
        } else {
          plannedOccupancy.set(found.id, planned + 1)
          room = { id: found.id, bedNo: planned + 1, label: `${found.block}-${found.room_no}` }
        }
      }
    }
    if (room) report.rooms.assigned++

    plan.push({
      name, tc,
      passport: String(r.passportNo || '').trim() || null,
      company: String(r.company || '').trim() || null,
      phone: String(r.phone || '').trim() || null,
      hometown: String(r.hometown || '').trim() || null,
      jobTitle: String(r.jobTitle || '').trim() || null,
      gender,
      checkInDate: String(r.checkInDate || '').trim() || null,
      room,
    })
    report.created.push({ name, gender, room: room?.label || null })
  }

  if (dryRun) return report

  // ── Gerçek yazım — tek transaction ──
  const insPerson = db.prepare(`
    INSERT INTO personnel(tc_no, passport_no, full_name, company, phone_number, hometown,
                          job_title, gender, check_in_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)
  `)
  const insAssign = db.prepare(`
    INSERT INTO room_assignments(personnel_id, room_id, bed_no, assigned_by) VALUES (?, ?, ?, ?)
  `)
  const insBatch = db.prepare(`INSERT INTO personnel_import_batches(created_by, label, summary, undo_data) VALUES (?,?,?,?)`)

  const undo = { createdPersonnelIds: [], createdAssignmentIds: [] }
  const tx = db.transaction(() => {
    for (const p of plan) {
      const pid = insPerson.run(p.tc, p.passport, p.name, p.company, p.phone, p.hometown,
        p.jobTitle, p.gender, p.checkInDate, userId || null).lastInsertRowid
      undo.createdPersonnelIds.push(pid)
      if (p.room) {
        const aid = insAssign.run(pid, p.room.id, p.room.bedNo, userId || null).lastInsertRowid
        undo.createdAssignmentIds.push(aid)
      }
    }
    const summary = {
      total: report.total, created: report.created.length, matched: report.matched,
      roomAssigned: report.rooms.assigned, duplicateRows: report.duplicateRows,
    }
    const label = `${report.created.length} sakin içe aktarıldı`
    report.batchId = insBatch.run(userId || null, label, JSON.stringify(summary), JSON.stringify(undo)).lastInsertRowid
  })
  tx()

  return report
}

// ── İçe aktarım oturumlarını listele ──
export function listPersonnelImportBatches(limit = 20) {
  return getDB().prepare(`
    SELECT b.id, b.created_at, b.label, b.summary, b.undone_at, u.username AS created_by_name
    FROM personnel_import_batches b
    LEFT JOIN users u ON u.id = b.created_by
    ORDER BY b.id DESC LIMIT ?
  `).all(limit).map(b => ({ ...b, summary: safeParse(b.summary) }))
}

function safeParse(s) { try { return JSON.parse(s) } catch { return null } }

// ── Bir oturumu geri al: yarattığı atamaları + sakinleri sil ──
export function undoPersonnelImport(batchId) {
  const db = getDB()
  const batch = db.prepare('SELECT * FROM personnel_import_batches WHERE id = ?').get(batchId)
  if (!batch) throw new Error('İçe aktarım oturumu bulunamadı')
  if (batch.undone_at) throw new Error('Bu oturum zaten geri alınmış')
  const undo = safeParse(batch.undo_data)
  if (!undo) throw new Error('Geri alma verisi okunamadı')

  const delAssign = db.prepare('DELETE FROM room_assignments WHERE id = ?')
  const delAssignByPerson = db.prepare('DELETE FROM room_assignments WHERE personnel_id = ?')
  const delPerson = db.prepare('DELETE FROM personnel WHERE id = ?')

  const result = { personnelDeleted: 0, assignmentsDeleted: 0 }
  db.transaction(() => {
    for (const aid of undo.createdAssignmentIds || []) {
      result.assignmentsDeleted += delAssign.run(aid).changes
    }
    for (const pid of undo.createdPersonnelIds || []) {
      delAssignByPerson.run(pid) // içe aktarımdan sonra elle eklenen atama varsa da temizle
      result.personnelDeleted += delPerson.run(pid).changes
    }
    db.prepare("UPDATE personnel_import_batches SET undone_at = datetime('now') WHERE id = ?").run(batchId)
  })()

  return result
}
