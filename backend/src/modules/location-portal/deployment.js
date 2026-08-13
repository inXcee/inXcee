import { getDB } from '../../shared/db/index.js'
import { labelsPerPage, getTemplate, normalizeCalibration } from './labelTemplates.js'

// Faz 7 — Basım partileri ve saha kurulumu.
//
// "Basıldı" ≠ "asıldı" ≠ "doğru kapıya asıldı". Bu dosya o üçünü ayırır.
//
// En önemli kural burada: KAYIT YOKSA "KURULMADI" DENMEZ. Bu tablolar canlıda
// 1078 QR üretildikten sonra eklendi; kayıtsız konumları "kurulmadı" saymak,
// çoktan asılmış etiketleri yeniden asmak için birini 19 bloğu gezmeye
// göndermek olurdu. Kayıtsız konum "bilinmiyor"dur ve raporda ayrı kovada durur.

function hata(message, status, code) {
  const error = new Error(message)
  error.statusCode = status
  error.code = code
  return error
}

export const DEPLOY_STATUS = Object.freeze(['printed', 'installed', 'verified', 'damaged', 'replaced', 'removed'])

// Konumun etiket durumunu KAYITTAN TÜRETİR. Bayatlık saklanmaz: asılı etiketin
// QR'ı ile konumun aktif QR'ı farklıysa (token döndürülmüş) o kâğıt ölüdür.
export function effectiveDeploymentState(row = {}) {
  if (!row.active_qr_id) {
    return { state: 'qr_missing', label: 'QR üretilmemiş', actionable: true }
  }
  if (!row.raw_status) {
    // Sessiz sıfır tuzağı: burada "kurulmadı" demek yanlış olurdu.
    return { state: 'unknown', label: 'Fiziksel durum kaydedilmemiş', actionable: false }
  }
  if (row.raw_status === 'removed') {
    return { state: 'removed', label: 'Etiket kaldırılmış', actionable: true }
  }
  if (row.deployed_qr_id && row.deployed_qr_id !== row.active_qr_id) {
    return { state: 'stale', label: 'Asılı etiket bayat — QR yenilendi, yeniden basılmalı', actionable: true }
  }
  if (row.raw_status === 'damaged') {
    return { state: 'damaged', label: 'Etiket hasarlı', actionable: true }
  }
  if (row.raw_status === 'verified') {
    return { state: 'verified', label: 'Yerinde doğrulandı', actionable: false }
  }
  if (row.raw_status === 'installed') {
    return { state: 'installed', label: 'Asıldı, yerinde doğrulanmadı', actionable: false }
  }
  return { state: 'printed', label: 'Basıldı, asıldığı kaydedilmedi', actionable: true }
}

/**
 * Basım partisi açar ve partideki etiketleri kaydeder.
 * Etiketler PDF'e basılmadan ÖNCE çağrılır: parti numarası kapak sayfasına
 * yazılacak, sahada bulunan etiketten hangi partiden geldiği bulunabilecek.
 */
export function createPrintBatch({ templateKey, calibration, filters = {}, items = [], userId = null, note = null }, db = getDB()) {
  if (!items.length) {
    // Boş PDF "hepsi basıldı" diye okunur; parti açmak da o yanılgıyı kaydeder.
    throw hata('Basılacak etiket yok — filtreye uyan aktif QR bulunamadı', 400, 'no_labels')
  }
  const tpl = getTemplate(templateKey)
  const perPage = labelsPerPage(tpl)
  const cal = normalizeCalibration(calibration)

  return db.transaction(() => {
    const batchId = db.prepare(`
      INSERT INTO location_qr_print_batches
        (template_key, calibration_json, filter_json, label_count, page_count, created_by, note)
      VALUES(?,?,?,?,?,?,?)
    `).run(
      tpl.key, JSON.stringify(cal), JSON.stringify(filters),
      items.length, Math.ceil(items.length / perPage), userId, note,
    ).lastInsertRowid

    // Parti numarası id'den türetilir: yarış durumunda çakışma olmaz.
    const batchNo = `BP-${String(batchId).padStart(5, '0')}`
    db.prepare('UPDATE location_qr_print_batches SET batch_no=? WHERE id=?').run(batchNo, batchId)

    const itemStmt = db.prepare(`
      INSERT INTO location_qr_print_batch_items
        (batch_id, location_id, qr_code_id, serial, page_no, slot_no)
      VALUES(?,?,?,?,?,?)
    `)
    const deployStmt = db.prepare(`
      INSERT INTO location_qr_deployments(location_id, qr_code_id, batch_id, status, printed_at, updated_at)
      VALUES(?,?,?,'printed',datetime('now'),datetime('now'))
      ON CONFLICT(location_id) DO UPDATE SET
        qr_code_id=excluded.qr_code_id,
        batch_id=excluded.batch_id,
        printed_at=datetime('now'),
        updated_at=datetime('now'),
        -- Yeniden basım, "asıldı/doğrulandı" bilgisini SİLMEZ. Eski etiket hâlâ
        -- kapıdadır; durumu geriye düşürmek raporu yanıltır. Ama QR değiştiyse
        -- doğrulama artık geçersizdir: durum 'printed'a döner.
        status = CASE
          WHEN location_qr_deployments.qr_code_id IS NOT excluded.qr_code_id THEN 'printed'
          WHEN location_qr_deployments.status IN ('removed','damaged') THEN 'printed'
          ELSE location_qr_deployments.status
        END,
        verified_at = CASE
          WHEN location_qr_deployments.qr_code_id IS NOT excluded.qr_code_id THEN NULL
          ELSE location_qr_deployments.verified_at
        END
    `)
    const printedStmt = db.prepare("UPDATE location_qr_codes SET last_printed_at=datetime('now') WHERE id=?")

    items.forEach((it, i) => {
      itemStmt.run(batchId, it.location_id, it.qr_code_id, it.serial,
        Math.floor(i / perPage) + 1, (i % perPage) + 1)
      deployStmt.run(it.location_id, it.qr_code_id, batchId)
      printedStmt.run(it.qr_code_id)
    })

    return {
      id: batchId,
      batch_no: batchNo,
      label_count: items.length,
      page_count: Math.ceil(items.length / perPage),
      template_key: tpl.key,
      calibration: cal,
    }
  })()
}

// Partinin PDF'i, KAYDEDİLEN sıraya göre yeniden basılabilir olmalı: aynı parti
// numarası her indirişte aynı kâğıdı vermeli. Bu yüzden PDF filtreden değil
// parti kayıtlarından üretilir.
export function getBatchPrintables(batchId, db = getDB()) {
  return db.prepare(`
    SELECT sl.id, sl.display_name, sl.block, sl.floor, sl.area_code, sl.location_type,
           q.token, q.id AS qr_code_id, bi.serial
    FROM location_qr_print_batch_items bi
    JOIN service_locations sl ON sl.id=bi.location_id
    JOIN location_qr_codes q ON q.id=bi.qr_code_id
    WHERE bi.batch_id=?
    ORDER BY bi.page_no, bi.slot_no, bi.id
  `).all(Number(batchId))
}

export function getBatch(batchId, db = getDB()) {
  return db.prepare('SELECT * FROM location_qr_print_batches WHERE id=?').get(Number(batchId)) || null
}

export function listPrintBatches({ limit = 50 } = {}, db = getDB()) {
  try {
    return {
      available: true,
      items: db.prepare(`
        SELECT b.*, u.full_name AS created_by_name,
               (SELECT COUNT(*) FROM location_qr_print_batch_items bi
                 JOIN location_qr_codes q ON q.id=bi.qr_code_id
                WHERE bi.batch_id=b.id AND q.status<>'active') AS stale_labels
        FROM location_qr_print_batches b
        LEFT JOIN users u ON u.id=b.created_by
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ?
      `).all(Math.max(1, Math.min(200, Number(limit) || 50))),
    }
  } catch (err) {
    // Boş liste "hiç basım yapılmadı" diye okunur; okunamadığını söylemek gerekir.
    return { available: false, reason: `Basım partileri okunamadı: ${err.message}`, items: [] }
  }
}

export function confirmBatchPrinted(batchId, userId = null, db = getDB()) {
  const bilgi = db.prepare(`
    UPDATE location_qr_print_batches
    SET status='printed', printed_confirmed_at=datetime('now'), printed_confirmed_by=?
    WHERE id=? AND status='generated'
  `).run(userId, Number(batchId))
  if (!bilgi.changes) {
    throw hata('Onaylanacak parti bulunamadı (zaten onaylanmış veya iptal edilmiş olabilir)', 404, 'batch_not_found')
  }
  return db.prepare('SELECT * FROM location_qr_print_batches WHERE id=?').get(Number(batchId))
}

// Yazıcı sıkıştı, kâğıt bitti: parti iptal edilir. SADECE bu partiden gelen ve
// henüz asılmamış kurulum kayıtları silinir — asılmış etikete dokunulmaz.
export function cancelBatch(batchId, userId = null, db = getDB()) {
  return db.transaction(() => {
    const bilgi = db.prepare(`
      UPDATE location_qr_print_batches SET status='cancelled', printed_confirmed_by=?
      WHERE id=? AND status<>'cancelled'
    `).run(userId, Number(batchId))
    if (!bilgi.changes) throw hata('İptal edilecek parti bulunamadı', 404, 'batch_not_found')
    const silinen = db.prepare(`
      DELETE FROM location_qr_deployments
      WHERE batch_id=? AND status='printed' AND installed_at IS NULL AND verified_at IS NULL
    `).run(Number(batchId)).changes
    return { id: Number(batchId), reverted_deployments: silinen }
  })()
}

export function getBatchItems(batchId, db = getDB()) {
  return db.prepare(`
    SELECT bi.serial, bi.page_no, bi.slot_no,
           sl.display_name, sl.block, sl.floor, sl.location_type,
           q.status AS qr_status,
           d.status AS deploy_status
    FROM location_qr_print_batch_items bi
    JOIN service_locations sl ON sl.id=bi.location_id
    JOIN location_qr_codes q ON q.id=bi.qr_code_id
    LEFT JOIN location_qr_deployments d ON d.location_id=bi.location_id
    WHERE bi.batch_id=?
    ORDER BY bi.page_no, bi.slot_no
  `).all(Number(batchId))
}

function deploymentWhere(filters, params) {
  const kosul = ['sl.is_active=1']
  if (filters.block) { kosul.push('sl.block=?'); params.push(filters.block) }
  if (filters.floor) { kosul.push('sl.floor=?'); params.push(Number(filters.floor)) }
  if (filters.type) { kosul.push('sl.location_type=?'); params.push(filters.type) }
  return `WHERE ${kosul.join(' AND ')}`
}

/**
 * Saha kurulum raporu. Her aktif konum için etiketin fiziksel durumu.
 * Özet, "bilinmiyor" kovasını AYRI tutar — onu kuruluya da kurulmamışa da
 * saymak, iki farklı yanlış karara yol açar.
 */
export function getDeploymentReport(filters = {}, db = getDB()) {
  try {
    const params = []
    const where = deploymentWhere(filters, params)
    const satirlar = db.prepare(`
      SELECT sl.id AS location_id, sl.display_name, sl.block, sl.floor,
             sl.location_type, sl.area_code,
             aktif.id AS active_qr_id,
             d.qr_code_id AS deployed_qr_id,
             d.status AS raw_status,
             d.installed_at, d.verified_at, d.verify_count, d.damage_note,
             d.updated_at, d.note,
             b.batch_no,
             (SELECT bi.serial FROM location_qr_print_batch_items bi
               WHERE bi.location_id=sl.id ORDER BY bi.id DESC LIMIT 1) AS serial,
             (SELECT COUNT(*) FROM location_qr_verify_mismatches m
               WHERE m.expected_location_id=sl.id AND m.resolved_at IS NULL) AS open_mismatches
      FROM service_locations sl
      LEFT JOIN location_qr_codes aktif ON aktif.location_id=sl.id AND aktif.status='active'
      LEFT JOIN location_qr_deployments d ON d.location_id=sl.id
      LEFT JOIN location_qr_print_batches b ON b.id=d.batch_id
      ${where}
      ORDER BY sl.block, sl.floor,
        CASE sl.location_type WHEN 'room' THEN 0 ELSE 1 END, sl.display_name
    `).all(...params)

    const items = satirlar.map(r => ({ ...r, ...effectiveDeploymentState(r) }))
    const ozet = {
      total: items.length, unknown: 0, qr_missing: 0, printed: 0,
      installed: 0, verified: 0, damaged: 0, stale: 0, removed: 0,
    }
    for (const it of items) ozet[it.state] = (ozet[it.state] || 0) + 1

    return {
      available: true,
      items,
      summary: {
        ...ozet,
        // Kurulum oranı yalnız durumu BİLİNEN konumlar üzerinden hesaplanır ve
        // paydası açıkça yazılır. Bilinmeyeni paydaya katmak oranı sahte
        // düşürür, paya katmak sahte yükseltir.
        known: items.length - ozet.unknown,
        coverage_measurable: items.length - ozet.unknown > 0,
        coverage_note: ozet.unknown > 0
          ? `${ozet.unknown} konumun etiket durumu hiç kaydedilmemiş; oran bunlar hariç hesaplandı.`
          : null,
      },
    }
  } catch (err) {
    return { available: false, reason: `Kurulum raporu okunamadı: ${err.message}`, items: [], summary: null }
  }
}

function locationByToken(token, db) {
  const value = String(token || '').trim()
  if (!value) return null
  // Telefonla okutulunca elde tam URL kalır; sondaki parça token'dır.
  const arananToken = value.includes('/') ? value.split('/').filter(Boolean).pop() : value
  if (arananToken.length < 43 || arananToken.length > 200) return null
  return db.prepare(`
    SELECT q.id AS qr_id, q.status AS qr_status,
           sl.id AS location_id, sl.display_name, sl.block, sl.floor, sl.location_type
    FROM location_qr_codes q
    JOIN service_locations sl ON sl.id=q.location_id
    WHERE q.token=?
  `).get(arananToken) || null
}

/**
 * Yerinde doğrulama: görevli kapının önünde etiketi okutur.
 *
 * ASIL DEĞER BURADA: yanlış kapıya asılmış etiket sahadaki en sık hata.
 * Beklenen konum verildiyse ve QR başka konumu gösteriyorsa doğrulama
 * SAYILMAZ — uyuşmazlık kaydedilir, düzeltme listesine düşer.
 */
export function verifyDeployment({ token, expectedLocationId = null, userId = null, note = null }, db = getDB()) {
  const bulunan = locationByToken(token, db)
  const beklenen = expectedLocationId ? Number(expectedLocationId) : null

  if (!bulunan) {
    if (beklenen) {
      db.prepare(`
        INSERT INTO location_qr_verify_mismatches
          (scanned_qr_code_id, scanned_location_id, expected_location_id, reason, reported_by)
        VALUES(NULL, NULL, ?, 'unknown_token', ?)
      `).run(beklenen, userId)
    }
    throw hata('Bu QR sistemde tanımlı değil — etiket başka bir kurulumdan kalmış olabilir', 404, 'qr_unknown')
  }

  if (bulunan.qr_status !== 'active') {
    // İptal edilmiş token: kâğıt fiziksel olarak duruyor ama ölü. Doğrulama
    // sayılmaz; asıl aksiyon yeniden basımdır.
    db.prepare(`
      INSERT INTO location_qr_verify_mismatches
        (scanned_qr_code_id, scanned_location_id, expected_location_id, reason, reported_by)
      VALUES(?,?,?,'revoked_label',?)
    `).run(bulunan.qr_id, bulunan.location_id, beklenen, userId)
    return {
      ok: false,
      code: 'qr_revoked',
      message: `Bu etiketteki QR iptal edilmiş (${bulunan.display_name}). Etiket yeniden basılmalı.`,
      scanned: bulunan,
    }
  }

  if (beklenen && beklenen !== bulunan.location_id) {
    const hedef = db.prepare('SELECT id, display_name FROM service_locations WHERE id=?').get(beklenen)
    db.prepare(`
      INSERT INTO location_qr_verify_mismatches
        (scanned_qr_code_id, scanned_location_id, expected_location_id, reason, reported_by)
      VALUES(?,?,?,'location_mismatch',?)
    `).run(bulunan.qr_id, bulunan.location_id, beklenen, userId)
    return {
      ok: false,
      code: 'location_mismatch',
      message: `Yanlış etiket: burada ${hedef?.display_name || 'beklenen konum'} olmalıydı, okutulan etiket ${bulunan.display_name} etiketi.`,
      scanned: bulunan,
      expected: hedef || null,
    }
  }

  db.prepare(`
    INSERT INTO location_qr_deployments
      (location_id, qr_code_id, status, installed_at, verified_at, verified_by, verify_count, note, updated_at)
    VALUES(?,?, 'verified', datetime('now'), datetime('now'), ?, 1, ?, datetime('now'))
    ON CONFLICT(location_id) DO UPDATE SET
      qr_code_id=excluded.qr_code_id,
      status='verified',
      -- Doğrulama aynı zamanda "asılı" kanıtıdır: kurulum kaydı yoksa şimdi doğar.
      installed_at=COALESCE(location_qr_deployments.installed_at, datetime('now')),
      verified_at=datetime('now'),
      verified_by=excluded.verified_by,
      verify_count=location_qr_deployments.verify_count+1,
      damaged_at=NULL, damage_note=NULL, removed_at=NULL,
      note=COALESCE(excluded.note, location_qr_deployments.note),
      updated_at=datetime('now')
  `).run(bulunan.location_id, bulunan.qr_id, userId, note)

  return { ok: true, code: 'verified', message: `${bulunan.display_name} doğrulandı`, scanned: bulunan }
}

// Görevli koridoru gezip "bunları astım" der. Kayıt yoksa doğar: etiket bu
// tablolar yokken basılmış olabilir.
export function markInstalled(locationIds = [], { userId = null, note = null } = {}, db = getDB()) {
  const idler = [...new Set(locationIds.map(Number).filter(Number.isInteger))]
  if (!idler.length) throw hata('Konum seçilmedi', 400, 'no_locations')

  return db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO location_qr_deployments
        (location_id, qr_code_id, status, installed_at, installed_by, note, updated_at)
      SELECT ?, q.id, 'installed', datetime('now'), ?, ?, datetime('now')
      FROM location_qr_codes q WHERE q.location_id=? AND q.status='active'
      ON CONFLICT(location_id) DO UPDATE SET
        qr_code_id=excluded.qr_code_id,
        status='installed',
        installed_at=datetime('now'),
        installed_by=excluded.installed_by,
        damaged_at=NULL, damage_note=NULL, removed_at=NULL,
        note=COALESCE(excluded.note, location_qr_deployments.note),
        updated_at=datetime('now')
    `)
    let yazilan = 0
    const atlanan = []
    for (const id of idler) {
      const r = stmt.run(id, userId, note, id)
      // Aktif QR yoksa SELECT boş döner, satır hiç yazılmaz. Sessizce başarı
      // dönmek "astım" diyen görevliye yalan söylemek olurdu.
      if (r.changes) yazilan += 1
      else atlanan.push(id)
    }
    return { updated: yazilan, skipped_no_active_qr: atlanan }
  })()
}

export function reportLabelIssue(locationId, { status = 'damaged', note = null, userId = null } = {}, db = getDB()) {
  if (!['damaged', 'removed', 'replaced'].includes(status)) {
    throw hata('Geçersiz etiket durumu', 400, 'invalid_status')
  }
  const bilgi = db.prepare(`
    INSERT INTO location_qr_deployments(location_id, status, damaged_at, damage_note, removed_at, installed_by, updated_at)
    VALUES(?,?, CASE WHEN ?='damaged' THEN datetime('now') END, ?,
           CASE WHEN ?='removed' THEN datetime('now') END, ?, datetime('now'))
    ON CONFLICT(location_id) DO UPDATE SET
      status=excluded.status,
      damaged_at=excluded.damaged_at,
      damage_note=excluded.damage_note,
      removed_at=excluded.removed_at,
      updated_at=datetime('now')
  `).run(Number(locationId), status, status, note, status, userId)
  if (!bilgi.changes) throw hata('Kurulum kaydı yazılamadı', 500, 'deployment_write_failed')
  return db.prepare('SELECT * FROM location_qr_deployments WHERE location_id=?').get(Number(locationId))
}

// Basılmış ama QR'ı artık aktif olmayan etiketler: sahada duran ölü kâğıtlar.
// Yeniden basım listesi budur.
export function listStaleLabels(db = getDB()) {
  try {
    return {
      available: true,
      items: db.prepare(`
        SELECT sl.id AS location_id, sl.display_name, sl.block, sl.floor,
               d.status, d.installed_at, d.verified_at,
               eski.status AS printed_qr_status,
               b.batch_no,
               (SELECT bi.serial FROM location_qr_print_batch_items bi
                 WHERE bi.location_id=sl.id ORDER BY bi.id DESC LIMIT 1) AS serial
        FROM location_qr_deployments d
        JOIN service_locations sl ON sl.id=d.location_id
        JOIN location_qr_codes eski ON eski.id=d.qr_code_id
        LEFT JOIN location_qr_codes aktif ON aktif.location_id=sl.id AND aktif.status='active'
        LEFT JOIN location_qr_print_batches b ON b.id=d.batch_id
        WHERE d.status<>'removed'
          AND (aktif.id IS NULL OR aktif.id<>d.qr_code_id)
        ORDER BY sl.block, sl.floor, sl.display_name
      `).all(),
    }
  } catch (err) {
    return { available: false, reason: `Bayat etiket listesi okunamadı: ${err.message}`, items: [] }
  }
}

export function listOpenMismatches(db = getDB()) {
  try {
    return {
      available: true,
      items: db.prepare(`
        SELECT m.id, m.reason, m.created_at,
               bek.display_name AS expected_name, bek.block AS expected_block,
               bul.display_name AS scanned_name,
               u.full_name AS reported_by_name
        FROM location_qr_verify_mismatches m
        LEFT JOIN service_locations bek ON bek.id=m.expected_location_id
        LEFT JOIN service_locations bul ON bul.id=m.scanned_location_id
        LEFT JOIN users u ON u.id=m.reported_by
        WHERE m.resolved_at IS NULL
        ORDER BY m.created_at DESC
      `).all(),
    }
  } catch (err) {
    return { available: false, reason: `Uyuşmazlık listesi okunamadı: ${err.message}`, items: [] }
  }
}

export function resolveMismatch(id, userId = null, db = getDB()) {
  const bilgi = db.prepare(`
    UPDATE location_qr_verify_mismatches
    SET resolved_at=datetime('now'), resolved_by=?
    WHERE id=? AND resolved_at IS NULL
  `).run(userId, Number(id))
  if (!bilgi.changes) throw hata('Açık uyuşmazlık bulunamadı', 404, 'mismatch_not_found')
  return { id: Number(id), resolved: true }
}
