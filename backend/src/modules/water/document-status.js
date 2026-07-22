import * as q from './queries.js'

const normalizeWaybill = value => String(value || '').trim().toLocaleLowerCase('tr-TR')
const isSystemReference = value => /^(devir|devır|düzeltme|correction)[-_]/
  .test(String(value || '').trim().toLocaleLowerCase('tr-TR'))

const daysBetween = (fromIso, toIso) => {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime()
  const to = new Date(`${toIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.round((to - from) / 86400000))
}

// Aynı irsaliye numarasına ait çoklu ürün satırlarını tek belge kabul eder.
// Tam belge = irsaliye numarası + o numaraya veya satırlarından birine bağlı fotoğraf.
export function waybillDocumentStatus({ from, to, today = to, limit = 20000 } = {}) {
  const intakes = q.listIntakeDocumentLines({ from, to, limit })
  // Fotoğraf sonradan yüklense ve yükleme tarihi irsaliye döneminden farklı olsa
  // bile evrakı tamamlamalı; bu yüzden bağlantı indeksi tarih filtresizdir.
  const photos = q.listWaybillPhotoLinks({ limit })
  const photoMovementIds = new Set(photos.filter(row => row.movement_id != null).map(row => Number(row.movement_id)))
  const photoWaybills = new Set(photos.map(row => normalizeWaybill(row.waybill_no)).filter(Boolean))
  const groups = new Map()

  for (const intake of intakes) {
    const waybillNo = String(intake.waybill_no || '').trim() || null
    // Geçmiş bakiye/devir düzeltmeleri fiziksel teslimat ve irsaliye değildir.
    if (isSystemReference(waybillNo)) continue
    const normalized = normalizeWaybill(waybillNo)
    const key = normalized ? `waybill:${normalized}` : `movement:${intake.id}`
    const group = groups.get(key) || {
      document_key: key,
      move_date: intake.move_date,
      waybill_no: waybillNo,
      movement_ids: [],
      product_names: [],
      line_count: 0,
    }
    if (intake.move_date < group.move_date) group.move_date = intake.move_date
    group.movement_ids.push(Number(intake.id))
    if (!group.product_names.includes(intake.product_name)) group.product_names.push(intake.product_name)
    group.line_count += 1
    groups.set(key, group)
  }

  const documents = [...groups.values()].map(group => {
    const normalized = normalizeWaybill(group.waybill_no)
    const hasPhoto = (normalized && photoWaybills.has(normalized))
      || group.movement_ids.some(id => photoMovementIds.has(id))
    const issue = !group.waybill_no ? 'missing_waybill' : (!hasPhoto ? 'missing_photo' : null)
    return {
      ...group,
      product_names: [...group.product_names].sort((left, right) => left.localeCompare(right, 'tr')),
      has_photo: Boolean(hasPhoto),
      complete: !issue,
      issue,
      issue_label: issue === 'missing_waybill' ? 'İrsaliye numarası eksik' : (issue === 'missing_photo' ? 'İrsaliye fotoğrafı eksik' : 'Tam'),
      waiting_days: daysBetween(group.move_date, today),
    }
  }).sort((left, right) => left.move_date.localeCompare(right.move_date) || left.document_key.localeCompare(right.document_key))

  const issues = documents.filter(document => !document.complete)
  const complete = documents.length - issues.length
  return {
    from,
    to,
    total: documents.length,
    complete,
    incomplete: issues.length,
    missing_photo: issues.filter(document => document.issue === 'missing_photo').length,
    missing_waybill: issues.filter(document => document.issue === 'missing_waybill').length,
    complete_percent: documents.length ? Math.round((complete / documents.length) * 100) : 100,
    documents,
    issues,
    truncated: intakes.length >= limit || photos.length >= limit,
  }
}
