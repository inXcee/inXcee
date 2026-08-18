import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { setAttachment } from '../../shared/http/contentDisposition.js'
import { logger } from '../../shared/logger.js'
import {
  generateMissingQrCodes,
  getActiveCoverage,
  getPrintableLocation,
  getPortalSettings,
  listPrintableQrCodes,
  listServiceLocations,
  revokeLocationQr,
  rotateLocationQr,
  syncServiceLocations,
  updatePortalSettings,
} from './service.js'
import { buildQrSheetPdf } from './qrSheetPdf.js'
import { streamLabelPdf, streamCalibrationPdf, writeLabelPdfTo } from './labelPdf.js'
import { buildLabelSvg, buildLabelPng } from './labelSvg.js'
import { getPortalAnalytics } from './analytics.js'
import { TEMPLATES, DEFAULT_TEMPLATE, shortSerial, normalizeCalibration } from './labelTemplates.js'
import {
  cancelBatch,
  confirmBatchPrinted,
  createPrintBatch,
  getBatch,
  getBatchItems,
  getBatchPrintables,
  getDeploymentReport,
  listOpenMismatches,
  listPrintBatches,
  listStaleLabels,
  markInstalled,
  reportLabelIssue,
  resolveMismatch,
  verifyDeployment,
} from './deployment.js'

export const locationPortalRouter = Router()
const canRead = requireRole('campus_manager', 'shift_supervisor')
const managerOnly = requireRole('campus_manager')

function sendError(res, error, fallback) {
  res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback })
}

locationPortalRouter.get('/settings', ...canRead, (_req, res) => {
  try { res.json(getPortalSettings()) }
  catch (error) {
    logger.error({ error }, '[location-portal.settings.get]')
    sendError(res, error, 'QR portal ayarları alınamadı')
  }
})

locationPortalRouter.put('/settings', ...managerOnly, (req, res) => {
  try {
    const settings = updatePortalSettings(req.body)
    logAudit(req.user.id, 'location_portal_settings_update', 'location_portal', null, JSON.stringify(req.body))
    res.json(settings)
  } catch (error) { sendError(res, error, 'QR portal ayarları güncellenemedi') }
})

locationPortalRouter.get('/locations', ...canRead, (req, res) => {
  try { res.json(listServiceLocations(req.query)) }
  catch (error) { sendError(res, error, 'QR konumları alınamadı') }
})

locationPortalRouter.get('/coverage', ...canRead, (_req, res) => {
  try {
    res.json(getActiveCoverage())
  } catch (error) { sendError(res, error, 'QR kapsamı alınamadı') }
})

locationPortalRouter.post('/locations/sync', ...managerOnly, (req, res) => {
  try {
    const result = syncServiceLocations()
    logAudit(req.user.id, 'location_portal_locations_sync', 'location_portal', null, JSON.stringify(result))
    res.json(result)
  } catch (error) { sendError(res, error, 'Konumlar eşitlenemedi') }
})

locationPortalRouter.post('/locations/generate-missing', ...managerOnly, (req, res) => {
  try {
    const result = generateMissingQrCodes(req.body || {}, req.user.id)
    logAudit(req.user.id, 'location_portal_qr_generate_missing', 'location_portal', null, JSON.stringify(result))
    res.status(201).json(result)
  } catch (error) { sendError(res, error, 'QR kodları üretilemedi') }
})

locationPortalRouter.post('/locations/:id/rotate', ...managerOnly, (req, res) => {
  try {
    const qr = rotateLocationQr(req.params.id, req.user.id, req.body?.reason)
    logAudit(req.user.id, 'location_portal_qr_rotate', 'location_portal', Number(req.params.id), req.body?.reason || null)
    res.status(201).json(qr)
  } catch (error) { sendError(res, error, 'QR yenilenemedi') }
})

locationPortalRouter.post('/locations/:id/revoke', ...managerOnly, (req, res) => {
  try {
    const result = revokeLocationQr(req.params.id, req.user.id, req.body?.reason)
    logAudit(req.user.id, 'location_portal_qr_revoke', 'location_portal', Number(req.params.id), req.body?.reason || null)
    res.json(result)
  } catch (error) { sendError(res, error, 'QR iptal edilemedi') }
})

// Basılabilir QR föyü: sayfa başına 12 etiket, kesim çizgili.
// Filtreler listeyle aynı (blok/kat/tip) — bir bloğu tek seferde basmak için.
locationPortalRouter.get('/qr-sheet.pdf', ...managerOnly, async (req, res) => {
  try {
    const kayitlar = listPrintableQrCodes(req.query)
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    const pdf = await buildQrSheetPdf(kayitlar, { baseUrl })
    const ad = ['qr', req.query.block, req.query.floor, req.query.type].filter(Boolean).join('-')
    res.setHeader('Content-Type', 'application/pdf')
    // `ad` kullanıcının filtre parametrelerinden gelir — ham hâlde başlığa
    // yazmak başlığı bozabilir.
    setAttachment(res, `${ad || 'qr'}-etiketleri.pdf`, 'qr-etiketleri.pdf')
    logAudit(req.user.id, 'location_portal_qr_print', 'location_portal', null, `${kayitlar.length} etiket`)
    res.send(pdf)
  } catch (error) { sendError(res, error, 'QR föyü üretilemedi') }
})

// ---------------------------------------------------------------------------
// Faz 7 — Profesyonel basım ve saha kurulumu
// ---------------------------------------------------------------------------
//
// Akış bilerek iki adımlı: önce PARTİ açılır (POST /print-batches), sonra o
// partinin PDF'i indirilir. Tek adımda GET ile hem basıp hem kaydetmek,
// tarayıcının ön-getirmesi veya kullanıcının sayfayı yenilemesiyle hayalet
// partiler üretirdi. Ayrıca PDF filtreden değil PARTİ KAYDINDAN üretilir: aynı
// parti numarası her indirişte aynı kâğıdı verir.

const fieldRoles = requireRole('campus_manager', 'shift_supervisor', 'housekeeper', 'technical')

locationPortalRouter.get('/label-templates', ...canRead, (_req, res) => {
  try {
    res.json({
      templates: Object.values(TEMPLATES).map(t => ({
        key: t.key,
        label: t.label,
        cols: t.cols,
        rows: t.rows,
        per_page: t.cols * t.rows,
        label_w_mm: t.labelW,
        label_h_mm: t.labelH,
        qr_mm: t.qrMm,
      })),
      default_template: DEFAULT_TEMPLATE,
    })
  } catch (error) { sendError(res, error, 'Etiket şablonları alınamadı') }
})

locationPortalRouter.post('/print-batches', ...managerOnly, (req, res) => {
  try {
    const filtre = req.body?.filters || {}
    const kayitlar = listPrintableQrCodes(filtre)
    const parti = createPrintBatch({
      templateKey: req.body?.template,
      calibration: req.body?.calibration,
      filters: filtre,
      note: req.body?.note || null,
      userId: req.user.id,
      // Seri, PDF'te de aynı saf fonksiyonla üretilir; kâğıttaki seri ile kayıt
      // birebir tutar.
      items: kayitlar.map(k => ({
        location_id: k.id,
        qr_code_id: k.qr_code_id,
        serial: shortSerial(k, k.token),
      })),
    })
    logAudit(req.user.id, 'location_portal_print_batch', 'location_portal', parti.id,
      `${parti.batch_no} — ${parti.label_count} etiket (${parti.template_key})`)
    res.status(201).json(parti)
  } catch (error) { sendError(res, error, 'Basım partisi açılamadı') }
})

locationPortalRouter.get('/print-batches', ...canRead, (req, res) => {
  try { res.json(listPrintBatches({ limit: req.query.limit })) }
  catch (error) { sendError(res, error, 'Basım partileri alınamadı') }
})

locationPortalRouter.get('/print-batches/:id/items', ...canRead, (req, res) => {
  try { res.json({ items: getBatchItems(req.params.id) }) }
  catch (error) { sendError(res, error, 'Parti içeriği alınamadı') }
})

locationPortalRouter.post('/print-batches/:id/confirm', ...managerOnly, (req, res) => {
  try {
    const parti = confirmBatchPrinted(req.params.id, req.user.id)
    logAudit(req.user.id, 'location_portal_batch_confirm', 'location_portal', parti.id, parti.batch_no)
    res.json(parti)
  } catch (error) { sendError(res, error, 'Parti onaylanamadı') }
})

locationPortalRouter.post('/print-batches/:id/cancel', ...managerOnly, (req, res) => {
  try {
    const sonuc = cancelBatch(req.params.id, req.user.id)
    logAudit(req.user.id, 'location_portal_batch_cancel', 'location_portal', sonuc.id,
      `${sonuc.reverted_deployments} kurulum kaydı geri alındı`)
    res.json(sonuc)
  } catch (error) { sendError(res, error, 'Parti iptal edilemedi') }
})

// Partinin etiket PDF'i. Akış, hedefe çizim başlamadan bağlanır; 1078 etiket
// belleğe yığılmaz.
locationPortalRouter.get('/print-batches/:id/labels.pdf', ...managerOnly, async (req, res) => {
  try {
    const parti = getBatch(req.params.id)
    if (!parti) { res.status(404).json({ error: 'Basım partisi bulunamadı' }); return }
    const kayitlar = getBatchPrintables(parti.id)
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`

    res.setHeader('Content-Type', 'application/pdf')
    setAttachment(res, `${parti.batch_no}-etiketler.pdf`, 'etiketler.pdf')
    // writeLabelPdfTo: her sayfadan sonra olay döngüsüne dönerek yanıtı
    // besler. streamLabelPdf senkron çizdiği için 1174 etikette PDF'in
    // tamamını bellekte tutuyordu.
    await writeLabelPdfTo(res, kayitlar, {
      template: parti.template_key,
      calibration: JSON.parse(parti.calibration_json || '{}'),
      filters: JSON.parse(parti.filter_json || '{}'),
      batchNo: parti.batch_no,
      baseUrl,
    })
  } catch (error) {
    logger.error({ err: error, batch: req.params.id }, '[location-portal.labels.pdf]')
    // Başlıklar gittiyse JSON hata gövdesi yazmak PDF'i bozar; bağlantıyı kes.
    if (res.headersSent) res.destroy(error)
    else sendError(res, error, 'Etiket PDF üretilemedi')
  }
})

// Kalibrasyon sayfası: QR yok, yalnız etiket sınırları. Basılıp etiket kâğıdının
// üstüne tutularak kayma ölçülür.
locationPortalRouter.get('/calibration.pdf', ...managerOnly, (req, res) => {
  try {
    const cal = normalizeCalibration({
      offset_x_mm: req.query.offset_x_mm,
      offset_y_mm: req.query.offset_y_mm,
      scale: req.query.scale,
    })
    res.setHeader('Content-Type', 'application/pdf')
    setAttachment(res, 'etiket-kalibrasyon.pdf')
    streamCalibrationPdf({ template: req.query.template, calibration: cal, pipeTo: res })
  } catch (error) { sendError(res, error, 'Kalibrasyon sayfası üretilemedi') }
})

locationPortalRouter.get('/deployments', ...canRead, (req, res) => {
  try { res.json(getDeploymentReport(req.query)) }
  catch (error) { sendError(res, error, 'Kurulum raporu alınamadı') }
})

locationPortalRouter.get('/deployments/stale', ...canRead, (_req, res) => {
  try { res.json(listStaleLabels()) }
  catch (error) { sendError(res, error, 'Bayat etiket listesi alınamadı') }
})

locationPortalRouter.get('/deployments/mismatches', ...canRead, (_req, res) => {
  try { res.json(listOpenMismatches()) }
  catch (error) { sendError(res, error, 'Uyuşmazlık listesi alınamadı') }
})

locationPortalRouter.post('/deployments/mismatches/:id/resolve', ...fieldRoles, (req, res) => {
  try {
    const sonuc = resolveMismatch(req.params.id, req.user.id)
    logAudit(req.user.id, 'location_portal_mismatch_resolve', 'location_portal', sonuc.id, null)
    res.json(sonuc)
  } catch (error) { sendError(res, error, 'Uyuşmazlık kapatılamadı') }
})

// Görevli kapının önünde etiketi okutur. Beklenen konum gönderildiyse ve QR
// başka konumu gösteriyorsa DOĞRULAMA SAYILMAZ — yanlış kapıya asılmış etiket
// sahadaki en sık hatadır, sessizce onaylanmamalıdır.
locationPortalRouter.post('/deployments/verify', ...fieldRoles, (req, res) => {
  try {
    const sonuc = verifyDeployment({
      token: req.body?.token,
      expectedLocationId: req.body?.expected_location_id,
      note: req.body?.note || null,
      userId: req.user.id,
    })
    if (!sonuc.ok) {
      logAudit(req.user.id, 'location_portal_verify_failed', 'location_portal',
        sonuc.scanned?.location_id || null, sonuc.code)
      res.status(409).json(sonuc)
      return
    }
    logAudit(req.user.id, 'location_portal_verify', 'location_portal', sonuc.scanned.location_id, null)
    res.json(sonuc)
  } catch (error) { sendError(res, error, 'Etiket doğrulanamadı') }
})

locationPortalRouter.post('/deployments/install', ...fieldRoles, (req, res) => {
  try {
    const sonuc = markInstalled(req.body?.location_ids || [], {
      userId: req.user.id,
      note: req.body?.note || null,
    })
    logAudit(req.user.id, 'location_portal_install', 'location_portal', null,
      `${sonuc.updated} konum asıldı olarak işaretlendi`)
    res.json(sonuc)
  } catch (error) { sendError(res, error, 'Kurulum kaydedilemedi') }
})

locationPortalRouter.post('/deployments/:id/issue', ...fieldRoles, (req, res) => {
  try {
    const kayit = reportLabelIssue(req.params.id, {
      status: req.body?.status,
      note: req.body?.note || null,
      userId: req.user.id,
    })
    logAudit(req.user.id, 'location_portal_label_issue', 'location_portal', kayit.location_id, kayit.status)
    res.json(kayit)
  } catch (error) { sendError(res, error, 'Etiket durumu kaydedilemedi') }
})

// ---------------------------------------------------------------------------
// Faz 6 — Yönetim ve analitik
// ---------------------------------------------------------------------------

// QR analitiği. Sayıların yanında NEDEN o sayı olduğu da döner: kapalı hizmetin
// sıfırı ile kullanılmayan hizmetin sıfırı aynı şey değildir.
locationPortalRouter.get('/analytics', ...canRead, (req, res) => {
  try { res.json(getPortalAnalytics(req.query)) }
  catch (error) { sendError(res, error, 'QR analitiği alınamadı') }
})

// Tekli etiket — kâğıt yırtıldığında 135 sayfalık föyü yeniden basmamak için.
// Üç biçim aynı kaynaktan üretilir; PDF föyle, SVG/PNG birbiriyle aynı görünür.
function tekliKonum(req, res) {
  const konum = getPrintableLocation(req.params.id)
  if (!konum) { res.status(404).json({ error: 'Konum bulunamadı' }); return null }
  if (!konum.token) {
    // Sessizce boş etiket vermek, üstünde çalışmayan QR olan kâğıt üretmektir.
    res.status(409).json({
      error: 'Bu konumun aktif QR kodu yok — önce QR üretilmeli',
      code: 'no_active_qr',
    })
    return null
  }
  return konum
}

function tekliDosyaAdi(konum, uzanti) {
  const ad = String(konum.display_name || konum.id).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return `${ad || 'etiket'}.${uzanti}`
}

locationPortalRouter.get('/locations/:id/label.pdf', ...canRead, (req, res) => {
  try {
    const konum = tekliKonum(req, res)
    if (!konum) return
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    res.setHeader('Content-Type', 'application/pdf')
    setAttachment(res, tekliDosyaAdi(konum, 'pdf'), 'etiket.pdf')
    streamLabelPdf([konum], { template: 'tek_100x70', baseUrl, cutMarks: false, pipeTo: res })
      .on('error', (err) => {
        logger.error({ err, id: konum.id }, '[location-portal.label.pdf]')
        res.destroy(err)
      })
  } catch (error) { sendError(res, error, 'Etiket PDF üretilemedi') }
})

locationPortalRouter.get('/locations/:id/label.svg', ...canRead, async (req, res) => {
  try {
    const konum = tekliKonum(req, res)
    if (!konum) return
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    const svg = await buildLabelSvg(konum, { baseUrl })
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    setAttachment(res, tekliDosyaAdi(konum, 'svg'), 'etiket.svg')
    res.send(svg)
  } catch (error) { sendError(res, error, 'Etiket SVG üretilemedi') }
})

locationPortalRouter.get('/locations/:id/label.png', ...canRead, async (req, res) => {
  try {
    const konum = tekliKonum(req, res)
    if (!konum) return
    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    const png = await buildLabelPng(konum, { baseUrl, dpi: req.query.dpi })
    res.setHeader('Content-Type', 'image/png')
    setAttachment(res, tekliDosyaAdi(konum, 'png'), 'etiket.png')
    res.send(png)
  } catch (error) { sendError(res, error, 'Etiket PNG üretilemedi') }
})
