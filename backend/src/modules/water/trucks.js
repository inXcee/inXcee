import fs from 'node:fs'
import { getDB } from '../../shared/db/index.js'
import { enqueue } from '../../shared/jobs/index.js'
import { parseRecipients } from '../email/service.js'
import * as q from './queries.js'
import { humanize } from './units.js'
import { notifyWaterOperations } from './notifications.js'
import { isIsoDate, isTime } from '../../shared/validation/date.js'

const TRUCK_STATUS = new Set(['planned', 'mail_sent', 'confirmed', 'arrived', 'cancelled'])
const STATUS_LABEL = {
  planned: 'Planlandı',
  mail_sent: 'Mail atıldı',
  confirmed: 'Gelecek onaylandı',
  arrived: 'Geldi',
  cancelled: 'İptal',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const minutesOf = (value) => {
  if (!isTime(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
const clean = (value) => {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function validateTimeRange(start, end, label) {
  if (!isTime(start) || !isTime(end)) {
    throw Object.assign(new Error(`${label} saatleri HH:MM olmalı`), { statusCode: 400 })
  }
  if (minutesOf(start) > minutesOf(end)) {
    throw Object.assign(new Error(`${label} başlangıcı bitişten sonra olamaz`), { statusCode: 400 })
  }
}

function normalizeTruckPayload(data, userId, existing = null) {
  if (!isIsoDate(data?.arrival_date)) {
    throw Object.assign(new Error('Geliş tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  }
  const arrival_start_time = data.arrival_start_time || existing?.arrival_start_time || '08:00'
  const arrival_end_time = data.arrival_end_time || existing?.arrival_end_time || '17:00'
  const mail_deadline_date = data.mail_deadline_date || existing?.mail_deadline_date || data.arrival_date
  const mail_deadline_time = data.mail_deadline_time || existing?.mail_deadline_time || '17:00'
  const reminder_start_time = data.reminder_start_time || existing?.reminder_start_time || '08:00'
  const reminder_end_time = data.reminder_end_time || existing?.reminder_end_time || '17:00'
  if (!isIsoDate(mail_deadline_date)) {
    throw Object.assign(new Error('Mail son tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  }
  validateTimeRange(arrival_start_time, arrival_end_time, 'Geliş aralığı')
  validateTimeRange(reminder_start_time, reminder_end_time, 'Kontrol aralığı')
  if (!isTime(mail_deadline_time)) {
    throw Object.assign(new Error('Mail son saati HH:MM olmalı'), { statusCode: 400 })
  }
  const reminder_interval_minutes = Math.max(
    15,
    Math.min(240, parseInt(data.reminder_interval_minutes, 10) || existing?.reminder_interval_minutes || 60),
  )
  const plate = clean(data.plate)
  if (!plate) throw Object.assign(new Error('Plaka gerekli'), { statusCode: 400 })
  let brand_id = existing?.brand_id || null
  if (Object.prototype.hasOwnProperty.call(data, 'brand_id')) {
    brand_id = data.brand_id ? parseInt(data.brand_id, 10) : null
    if (brand_id && !q.getBrand(brand_id)) {
      throw Object.assign(new Error('Marka bulunamadı'), { statusCode: 400 })
    }
  }
  const center_email = clean(data.center_email)
  if (center_email && !EMAIL_RE.test(center_email)) {
    throw Object.assign(new Error('Ana merkez e-postası geçersiz'), { statusCode: 400 })
  }
  const identity_type = data.identity_type || existing?.identity_type || 'tc'
  if (!['tc', 'passport'].includes(identity_type)) {
    throw Object.assign(new Error('Kimlik türü TC veya pasaport olmalı'), { statusCode: 400 })
  }
  const status = data.status || existing?.status || 'planned'
  if (!TRUCK_STATUS.has(status)) {
    throw Object.assign(new Error('Geçersiz tır durumu'), { statusCode: 400 })
  }
  return {
    arrival_date: data.arrival_date,
    arrival_start_time,
    arrival_end_time,
    mail_deadline_date,
    mail_deadline_time,
    reminder_start_time,
    reminder_end_time,
    reminder_interval_minutes,
    supplier_name: clean(data.supplier_name),
    brand_id,
    driver_name: clean(data.driver_name),
    driver_tc: clean(data.driver_tc),
    driver_phone: clean(data.driver_phone),
    plate: plate.toUpperCase(),
    trailer_plate: clean(data.trailer_plate)?.toUpperCase() || null,
    identity_type,
    visit_company: clean(data.visit_company),
    host_person_name: clean(data.host_person_name),
    host_person_phone: clean(data.host_person_phone),
    entry_reason: clean(data.entry_reason) || existing?.entry_reason || 'SU AMAÇLI NAKLİYE',
    work_area: clean(data.work_area),
    center_email,
    status,
    note: clean(data.note),
    created_by: existing?.created_by || userId || null,
    updated_by: userId || null,
  }
}

const MAIL_FIELD_DEFS = [
  ['center_email', 'Ana merkez e-postası'],
  ['driver_name', 'Tırcı adı'],
  ['driver_tc', 'Sicil / Arşiv TC'],
  ['driver_phone', 'Telefon'],
  ['plate', 'Plaka'],
  ['trailer_plate', 'Dorse'],
  ['visit_company', 'Ziyaret edilecek firma'],
  ['host_person_name', 'Ziyaret edilecek kişi'],
  ['host_person_phone', 'Ziyaret edilecek kişi telefonu'],
  ['entry_reason', 'Saha giriş nedeni'],
  ['work_area', 'Çalışma yapılacak bölge'],
  ['arrival_date', 'Geliş tarihi'],
  ['arrival_start_time', 'Geliş başlangıç'],
  ['arrival_end_time', 'Geliş bitiş'],
]

function mailChecklist(row) {
  return MAIL_FIELD_DEFS.map(([key, label]) => ({
    key,
    label,
    ok: !!row[key],
    value: row[key] || null,
  }))
}

function missingMailFields(row) {
  return mailChecklist(row).filter(item => !item.ok).map(item => item.label)
}

function dateTimeMinute(date, time) {
  if (!isIsoDate(date) || !isTime(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return Math.round(Date.UTC(year, month - 1, day, hours, minutes) / 60000)
}

function durationLabel(minutes) {
  const absolute = Math.abs(Math.round(minutes || 0))
  if (absolute < 60) return `${absolute} dk`
  const hours = Math.floor(absolute / 60)
  const remainderMinutes = absolute % 60
  if (hours < 24) return remainderMinutes ? `${hours} sa ${remainderMinutes} dk` : `${hours} sa`
  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  return remainderHours ? `${days} gün ${remainderHours} sa` : `${days} gün`
}

function nextReminderLabel(row, current) {
  const start = minutesOf(row.reminder_start_time)
  const end = minutesOf(row.reminder_end_time)
  const interval = Math.max(15, parseInt(row.reminder_interval_minutes, 10) || 60)
  if (current == null || start == null || end == null) return null
  if (current <= start) return row.reminder_start_time
  if (current > end) return null
  const elapsed = current - start
  const next = start + (Math.floor(elapsed / interval) + 1) * interval
  if (next > end) return null
  const hours = String(Math.floor(next / 60)).padStart(2, '0')
  const minutes = String(next % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

function minuteSlotKey(totalMinutes) {
  const safe = Math.max(0, Math.min(1439, Math.round(totalMinutes)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}${String(safe % 60).padStart(2, '0')}`
}

function reminderSlot(current, start, end, interval) {
  if ([current, start, end].some(value => value == null) || current < start || current > end) return null
  const slotMinute = start + Math.floor((current - start) / interval) * interval
  return { minute: slotMinute, key: minuteSlotKey(slotMinute) }
}

function overdueSlot(current, deadline, interval) {
  if (current == null || deadline == null || current <= deadline) return null
  const firstOverdueMinute = deadline + 1
  const slotMinute = firstOverdueMinute + Math.floor((current - firstOverdueMinute) / interval) * interval
  return { minute: slotMinute, key: minuteSlotKey(slotMinute) }
}

function truckMailSubject(row) {
  return `Su amaçlı nakliye personel giriş talebi - ${row.arrival_date} - ${row.plate}`
}

function trDateLabel(value) {
  if (!isIsoDate(value)) return value || '-'
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function truckMailBody(row) {
  const identityLabel = row.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik'
  const arrivalWindow = `${row.arrival_start_time}-${row.arrival_end_time}`
  return [
    'Merhaba,',
    '',
    `${trDateLabel(row.arrival_date)} tarihinde ${arrivalWindow} saatleri arasında ${row.driver_name || 'aşağıda bilgileri bulunan personelin'}, ${row.plate}${row.trailer_plate ? ` araç / ${row.trailer_plate} dorse` : ' plakalı araç'} ile ${row.work_area || 'belirtilen bölgede'} su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.`,
    '',
    'PERSONEL GÜNLÜK GİRİŞ BİLGİLERİ',
    `Adı soyadı: ${row.driver_name || '-'}`,
    `${identityLabel} / Sicil-Arşiv No: ${row.driver_tc || '-'}`,
    `Telefon numarası: ${row.driver_phone || '-'}`,
    `Araç plakası: ${row.plate}`,
    `Dorse plakası: ${row.trailer_plate || '-'}`,
    `Ziyaret edilecek firma: ${row.visit_company || '-'}`,
    `Ziyaret edilecek kişi: ${row.host_person_name || '-'}`,
    `Ziyaret edilecek kişi telefonu: ${row.host_person_phone || '-'}`,
    `Giriş tarihi: ${trDateLabel(row.arrival_date)}`,
    `Giriş saat aralığı: ${arrivalWindow}`,
    `Saha giriş nedeni: ${row.entry_reason || 'SU AMAÇLI NAKLİYE'}`,
    `Çalışma yapacağı bölge: ${row.work_area || '-'}`,
    `Tedarikçi / marka: ${row.supplier_name || row.brand_name || '-'}`,
    row.note ? `Not: ${row.note}` : null,
    '',
    'Bilgilerinize sunar, yardımlarınızı rica ederiz.',
  ].filter(Boolean).join('\n')
}

function registerGatePdfFonts(doc) {
  const candidates = [
    ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
    ['/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'],
  ]
  const pair = candidates.find(([regular, bold]) => fs.existsSync(regular) && fs.existsSync(bold))
  if (!pair) return { regular: 'Helvetica', bold: 'Helvetica-Bold' }
  try {
    doc.registerFont('GateRegular', pair[0])
    doc.registerFont('GateBold', pair[1])
    return { regular: 'GateRegular', bold: 'GateBold' }
  } catch {
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' }
  }
}

export function truckGateEntryService(id) {
  const row = q.getTruckArrival(id)
  if (!row) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  return decorateTruck(row)
}

export function buildTruckGateEntryPDF(truck, doc) {
  if (!truck?.id) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  const fonts = registerGatePdfFonts(doc)
  const entry = truck.gate_entry || {}
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height
  const margin = 48
  const innerWidth = pageWidth - margin * 2
  doc.info.Title = truck.mail_subject
  doc.info.Subject = 'Su amaçlı nakliye personel giriş talebi'
  doc.info.Author = 'Şantiye Yatakhane Yönetim Sistemi'

  doc.rect(0, 0, pageWidth, 92).fill('#155E75')
  doc.font(fonts.bold).fontSize(19).fillColor('#FFFFFF')
    .text('SU AMAÇLI NAKLİYE', margin, 30, { width: innerWidth })
  doc.font(fonts.regular).fontSize(10).fillColor('#CFFAFE')
    .text('PERSONEL VE ARAÇ GİRİŞ TALEBİ', margin, 58, { width: innerWidth })
  doc.font(fonts.bold).fontSize(9).fillColor('#0F172A')
    .text(`KAYIT NO  #${truck.id}`, margin, 112)
  doc.font(fonts.regular).fillColor('#475569')
    .text(`GELİŞ  ${trDateLabel(truck.arrival_date)}  ${truck.arrival_window}`, margin, 129)
  doc.font(fonts.bold).fillColor('#0F172A')
    .text('KONU', margin, 162, { width: 54 })
  doc.roundedRect(margin + 54, 154, innerWidth - 54, 40, 4).fillAndStroke('#F0F9FF', '#7DD3FC')
  doc.font(fonts.bold).fontSize(10).fillColor('#0F172A')
    .text(truck.mail_subject, margin + 66, 168, { width: innerWidth - 78, ellipsis: true })

  doc.font(fonts.regular).fontSize(10).fillColor('#1E293B')
    .text(truck.mail_body, margin, 216, { width: innerWidth, lineGap: 4 })

  const signatureY = pageHeight - 132
  const signatureGap = 12
  const signatureWidth = (innerWidth - signatureGap * 2) / 3
  ;['HAZIRLAYAN', 'KONTROL EDEN', 'ONAY'].forEach((label, index) => {
    const x = margin + index * (signatureWidth + signatureGap)
    doc.roundedRect(x, signatureY, signatureWidth, 58, 4).stroke('#CBD5E1')
    doc.font(fonts.bold).fontSize(8).fillColor('#475569').text(label, x + 10, signatureY + 9)
    doc.moveTo(x + 10, signatureY + 42).lineTo(x + signatureWidth - 10, signatureY + 42)
      .dash(3, { space: 3 }).stroke('#94A3B8').undash()
  })
  doc.font(fonts.regular).fontSize(7).fillColor('#64748B')
    .text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}  ·  YYS Su Takibi`, margin, pageHeight - 60, {
      width: innerWidth,
      align: 'center',
    })

  doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 })
  const landscapeWidth = doc.page.width
  const tableX = 24
  const tableWidth = landscapeWidth - 48
  doc.rect(0, 0, landscapeWidth, 66).fill('#155E75')
  doc.font(fonts.bold).fontSize(16).fillColor('#FFFFFF')
    .text('PERSONEL GÜNLÜK GİRİŞ FORMU', tableX, 24, { width: tableWidth, align: 'center' })
  doc.font(fonts.regular).fontSize(8).fillColor('#475569')
    .text(`${trDateLabel(truck.arrival_date)} · ${truck.arrival_window} · ${truck.vehicle_summary}`, tableX, 78, {
      width: tableWidth,
      align: 'center',
    })

  const headers = [
    'ADI SOYADI',
    'T.C. KİMLİK / PASAPORT NUMARASI',
    'TELEFON NUMARASI',
    'ARAÇ PLAKASI',
    'ZİYARET EDİLECEK FİRMA',
    'ZİYARET EDİLECEK KİŞİ',
    'ZİYARET EDİLECEK KİŞİ TELEFONU',
    'GİRİŞ TARİHİ',
    'GİRİŞ SAATİ',
    'SAHA GİRİŞ NEDENİ',
    'ÇALIŞMA YAPACAĞI BÖLGE',
  ]
  const values = [
    entry.full_name || '-',
    `${entry.identity_label || 'T.C. Kimlik'}\n${entry.identity_no || '-'}`,
    entry.phone || '-',
    [entry.plate, entry.trailer_plate].filter(Boolean).join('\n'),
    entry.visit_company || '-',
    entry.host_person_name || '-',
    entry.host_person_phone || '-',
    trDateLabel(entry.entry_date),
    `${entry.entry_start_time || '-'}-${entry.entry_end_time || '-'}`,
    entry.entry_reason || 'SU AMAÇLI NAKLİYE',
    entry.work_area || '-',
  ]
  const baseWidths = [72, 88, 70, 72, 110, 82, 84, 58, 62, 74, 82]
  const widthScale = tableWidth / baseWidths.reduce((sum, width) => sum + width, 0)
  const widths = baseWidths.map(width => width * widthScale)
  const drawRow = (items, y, height, header = false) => {
    let x = tableX
    items.forEach((item, index) => {
      const width = widths[index]
      doc.rect(x, y, width, height).fillAndStroke(header ? '#D6EAF0' : '#FFFFFF', '#64748B')
      doc.font(header ? fonts.bold : fonts.regular).fontSize(header ? 6.4 : 7.8).fillColor('#0F172A')
        .text(String(item || '-'), x + 4, y + 7, {
          width: width - 8,
          height: height - 14,
          align: 'center',
          valign: 'center',
          ellipsis: true,
        })
      x += width
    })
  }
  drawRow(headers, 104, 58, true)
  drawRow(values, 162, 82)

  const requestY = 272
  doc.roundedRect(tableX, requestY, tableWidth, 112, 5).fillAndStroke('#F8FAFC', '#CBD5E1')
  doc.font(fonts.bold).fontSize(9).fillColor('#155E75').text('GİRİŞ TALEBİ', tableX + 14, requestY + 12)
  const requestText = `${trDateLabel(truck.arrival_date)} tarihinde ${truck.arrival_window} saatleri arasında ${entry.full_name || 'bilgileri bulunan personelin'}, ${truck.vehicle_summary} ile ${entry.work_area || 'belirtilen bölgede'} su amaçlı nakliyesi olacaktır. Personel ve araç girişinin sağlanması hususunda yardımlarınızı rica ederiz.`
  doc.font(fonts.regular).fontSize(9).fillColor('#1E293B')
    .text(requestText, tableX + 14, requestY + 34, { width: tableWidth - 28, lineGap: 3 })
  doc.font(fonts.regular).fontSize(7).fillColor('#64748B')
    .text(`Alıcı: ${truck.center_email || '-'}  ·  Kayıt #${truck.id}`, tableX, doc.page.height - 34, {
      width: tableWidth,
      align: 'center',
    })
  doc.end()
  return truck
}

function decorateTruck(row, now = new Date()) {
  const clock = trClock(now)
  const current = minutesOf(clock.time)
  const missing = missingMailFields(row)
  const mailDiff = dateTimeMinute(row.mail_deadline_date, row.mail_deadline_time)
    - dateTimeMinute(clock.date, clock.time)
  const arrivalStartDiff = dateTimeMinute(row.arrival_date, row.arrival_start_time)
    - dateTimeMinute(clock.date, clock.time)
  const arrivalEndDiff = dateTimeMinute(row.arrival_date, row.arrival_end_time)
    - dateTimeMinute(clock.date, clock.time)
  const mailDone = !!row.mail_sent_at || ['arrived', 'cancelled'].includes(row.status)
  const mailJobActive = ['pending', 'processing'].includes(row.mail_job_status)
  const mailJobFailed = !!row.mail_job_id && (
    row.mail_job_status === 'failed'
    || (row.mail_job_status === 'done' && !!row.mail_job_last_error)
  )

  let mailPhase = 'scheduled'
  let mailPhaseLabel = 'Planlı'
  let mailSeverity = 'info'
  let mailNotice = `${row.mail_deadline_label || `${row.mail_deadline_date} ${row.mail_deadline_time}`} son saatine kadar mail hazırlanmalı`
  if (row.mail_sent_at) {
    mailPhase = 'sent'
    mailPhaseLabel = 'Mail atıldı'
    mailSeverity = 'success'
    mailNotice = `Mail ${row.mail_sent_at} tarihinde işaretlenmiş`
  } else if (row.status === 'cancelled') {
    mailPhase = 'cancelled'
    mailPhaseLabel = 'İptal'
    mailSeverity = 'muted'
    mailNotice = 'Tır kaydı iptal edildi'
  } else if (mailJobActive) {
    mailPhase = row.mail_job_status === 'processing' ? 'sending' : 'queued'
    mailPhaseLabel = row.mail_job_status === 'processing' ? 'Gönderiliyor' : 'Mail sırada'
    mailSeverity = row.mail_job_status === 'processing' ? 'attention' : 'info'
    mailNotice = `Mail kalıcı gönderim kuyruğunda · deneme ${row.mail_job_attempts || 0}/${row.mail_job_max_attempts || 5}`
  } else if (mailJobFailed) {
    mailPhase = 'send_failed'
    mailPhaseLabel = 'Gönderilemedi'
    mailSeverity = 'critical'
    mailNotice = row.mail_job_last_error || 'Mail gönderimi bütün denemelerde başarısız oldu'
  } else if (mailDiff < 0) {
    mailPhase = 'overdue'
    mailPhaseLabel = 'Süre geçti'
    mailSeverity = 'critical'
    mailNotice = `Mail son saati ${durationLabel(mailDiff)} geçti`
  } else if (row.mail_deadline_date === clock.date) {
    mailPhase = missing.length ? 'due_missing' : 'due_ready'
    mailPhaseLabel = missing.length ? 'Bugün eksik' : 'Bugün hazır'
    mailSeverity = missing.length ? 'warning' : 'attention'
    mailNotice = `${durationLabel(mailDiff)} içinde ana merkeze mail atılmalı`
  } else if (mailDiff <= 24 * 60) {
    mailPhase = missing.length ? 'soon_missing' : 'soon_ready'
    mailPhaseLabel = missing.length ? 'Yakın eksik' : 'Yakın'
    mailSeverity = missing.length ? 'warning' : 'info'
    mailNotice = `${durationLabel(mailDiff)} sonra mail deadline`
  }

  let arrivalPhase = 'scheduled'
  let arrivalPhaseLabel = 'Planlı'
  let arrivalSeverity = 'info'
  let arrivalNotice = `${row.arrival_date} ${row.arrival_start_time}-${row.arrival_end_time} aralığında bekleniyor`
  if (row.status === 'arrived') {
    arrivalPhase = 'arrived'
    arrivalPhaseLabel = 'Geldi'
    arrivalSeverity = 'success'
    arrivalNotice = 'Geldi olarak işaretlendi'
  } else if (row.status === 'cancelled') {
    arrivalPhase = 'cancelled'
    arrivalPhaseLabel = 'İptal'
    arrivalSeverity = 'muted'
    arrivalNotice = 'Tır kaydı iptal edildi'
  } else if (arrivalEndDiff < 0) {
    arrivalPhase = 'late'
    arrivalPhaseLabel = 'Geliş gecikti'
    arrivalSeverity = 'critical'
    arrivalNotice = `Geliş aralığı ${durationLabel(arrivalEndDiff)} önce bitti`
  } else if (arrivalStartDiff <= 0 && arrivalEndDiff >= 0) {
    arrivalPhase = 'in_window'
    arrivalPhaseLabel = 'Geliş aralığında'
    arrivalSeverity = 'attention'
    arrivalNotice = `${durationLabel(arrivalEndDiff)} içinde geliş aralığı bitecek`
  } else if (row.arrival_date === clock.date) {
    arrivalPhase = 'today'
    arrivalPhaseLabel = 'Bugün gelecek'
    arrivalSeverity = 'warning'
    arrivalNotice = `${durationLabel(arrivalStartDiff)} sonra geliş aralığı başlayacak`
  }

  const nextCheck = nextReminderLabel(row, current)
  const actionItems = []
  if (mailJobActive) actionItems.push(`Mail gönderim kuyruğunda · iş #${row.mail_job_id}`)
  if (mailJobFailed) actionItems.push('Mail gönderimi başarısız; hata kontrol edilip yeniden kuyruğa alınmalı')
  if (!mailDone && missing.length) actionItems.push(`Mail için eksik: ${missing.join(', ')}`)
  if (!row.mail_sent_at && mailDiff < 0 && row.status !== 'cancelled') {
    actionItems.push('Mail deadline geçti, ana merkeze gönderim teyidi alınmalı')
  }
  if (!row.mail_sent_at && mailDiff >= 0 && row.mail_deadline_date === clock.date) {
    actionItems.push('Bugün 17:00 öncesi mail gönderimi kapatılmalı')
  }
  if (row.arrival_date === clock.date && row.status !== 'arrived' && row.status !== 'cancelled') {
    actionItems.push('Tır geliş teyidi yapılmalı')
  }
  if (!row.photo_count) actionItems.push('İrsaliye fotoğrafı henüz yok')

  const mailSubject = truckMailSubject(row)
  const mailBody = truckMailBody(row)
  return {
    ...row,
    status_label: STATUS_LABEL[row.status] || row.status,
    arrival_window: `${row.arrival_start_time}-${row.arrival_end_time}`,
    mail_deadline_label: `${row.mail_deadline_date} ${row.mail_deadline_time}`,
    missing_mail_fields: missing,
    mail_checklist: mailChecklist(row),
    mail_ready: missing.length === 0,
    mail_required: !mailDone,
    deadline_passed: !row.mail_sent_at && mailDiff < 0 && !['arrived', 'cancelled'].includes(row.status),
    mail_phase: mailPhase,
    mail_phase_label: mailPhaseLabel,
    mail_severity: mailSeverity,
    mail_minutes_left: mailDiff,
    mail_time_left_label: mailDiff == null ? null : durationLabel(mailDiff),
    mail_notice: mailNotice,
    mail_queue: row.mail_job_id ? {
      job_id: row.mail_job_id,
      status: row.mail_job_status,
      attempts: row.mail_job_attempts || 0,
      max_attempts: row.mail_job_max_attempts || 5,
      last_error: row.mail_job_last_error || null,
      queued_at: row.mail_queued_at || null,
      active: mailJobActive,
      failed: mailJobFailed,
    } : null,
    arrival_phase: arrivalPhase,
    arrival_phase_label: arrivalPhaseLabel,
    arrival_severity: arrivalSeverity,
    arrival_minutes_to_start: arrivalStartDiff,
    arrival_minutes_to_end: arrivalEndDiff,
    arrival_notice: arrivalNotice,
    next_check_time: nextCheck,
    check_plan_label: `${row.reminder_start_time}-${row.reminder_end_time} / ${row.reminder_interval_minutes || 60} dk`,
    action_items: actionItems,
    identity_summary: [row.driver_name, row.driver_tc].filter(Boolean).join(' · ') || null,
    vehicle_summary: [row.plate, row.trailer_plate].filter(Boolean).join(' / '),
    contact_summary: [row.driver_phone, row.center_email].filter(Boolean).join(' · ') || null,
    gate_entry: {
      full_name: row.driver_name || null,
      identity_type: row.identity_type || 'tc',
      identity_label: row.identity_type === 'passport' ? 'Pasaport' : 'T.C. Kimlik',
      identity_no: row.driver_tc || null,
      phone: row.driver_phone || null,
      plate: row.plate,
      trailer_plate: row.trailer_plate || null,
      visit_company: row.visit_company || null,
      host_person_name: row.host_person_name || null,
      host_person_phone: row.host_person_phone || null,
      entry_date: row.arrival_date,
      entry_start_time: row.arrival_start_time,
      entry_end_time: row.arrival_end_time,
      entry_reason: row.entry_reason || 'SU AMAÇLI NAKLİYE',
      work_area: row.work_area || null,
      ready: missing.length === 0,
      missing_fields: missing,
    },
    mail_subject: mailSubject,
    mail_body: mailBody,
    mail_preview: {
      to: row.center_email || null,
      subject: mailSubject,
      body: mailBody,
      ready: missing.length === 0,
      missing_fields: missing,
      checklist: mailChecklist(row),
    },
  }
}

export function truckArrivalsService(filters = {}) {
  const limit = filters.limit ? Math.min(1000, Math.max(1, parseInt(filters.limit, 10) || 200)) : 200
  return q.listTruckArrivals({ ...filters, limit }).map(row => decorateTruck(row))
}

export function createTruckArrivalService(data, userId) {
  return q.createTruckArrival(normalizeTruckPayload(data, userId))
}

export function updateTruckArrivalService(id, data, userId) {
  const existing = q.getTruckArrival(id)
  if (!existing) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  if (!q.updateTruckArrival(id, normalizeTruckPayload(data, userId, existing))) {
    throw Object.assign(new Error('Tır kaydı güncellenemedi'), { statusCode: 500 })
  }
}

export function sendTruckArrivalMailService(id, userId) {
  const row = q.getTruckArrival(id)
  if (!row) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  if (row.mail_sent_at) {
    throw Object.assign(new Error('Bu tırın maili daha önce gönderilmiş'), { statusCode: 409 })
  }
  const missing = missingMailFields(row)
  if (missing.length) {
    throw Object.assign(new Error(`Mail için eksik bilgi: ${missing.join(', ')}`), { statusCode: 400 })
  }
  parseRecipients(row.center_email)

  if (['pending', 'processing'].includes(row.mail_job_status)) {
    return {
      queued: true,
      alreadyQueued: true,
      job_id: row.mail_job_id,
      truck: decorateTruck(row),
    }
  }

  const subject = truckMailSubject(row)
  const queueMail = getDB().transaction(() => {
    const jobId = enqueue('water.truck-mail', {
      truckArrivalId: id,
      requestedBy: userId || null,
      to: row.center_email,
      subject,
      body: truckMailBody(row),
    }, { maxAttempts: 5 })
    if (!q.setTruckMailQueued(id, jobId, userId)) {
      throw new Error('Tır mail kuyruğu kayda bağlanamadı')
    }
    return jobId
  })
  const jobId = queueMail.immediate()
  return {
    queued: true,
    alreadyQueued: false,
    job_id: jobId,
    truck: decorateTruck(q.getTruckArrival(id)),
  }
}

export function markTruckMailSentService(id, userId) {
  if (!q.getTruckArrival(id)) {
    throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  }
  q.setTruckMailSent(id, userId)
  return decorateTruck(q.getTruckArrival(id))
}

export function markTruckCheckedService(id, userId) {
  if (!q.getTruckArrival(id)) {
    throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  }
  q.setTruckChecked(id, userId)
  return decorateTruck(q.getTruckArrival(id))
}

export function deleteTruckArrivalService(id) {
  const result = q.deleteTruckArrival(id)
  if (!result) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 404 })
  return result
}

export function trClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    hour: parts.hour,
  }
}

export function checkTruckArrivalAlerts({ now = new Date() } = {}) {
  const clock = trClock(now)
  const current = minutesOf(clock.time)
  const rows = q.listTruckArrivals({ limit: 1000 })
    .filter(row => !['arrived', 'cancelled'].includes(row.status))
    .filter(row => row.arrival_date === clock.date || row.mail_deadline_date === clock.date)
  let created = 0
  const alerts = []

  for (const row of rows) {
    const base = `${row.plate}${row.trailer_plate ? ` / ${row.trailer_plate}` : ''}`
    const missing = missingMailFields(row)
    const missingText = missing.length ? ` Eksik bilgi: ${missing.join(', ')}.` : ''
    const interval = Math.max(15, parseInt(row.reminder_interval_minutes, 10) || 60)
    const reminder = reminderSlot(
      current,
      minutesOf(row.reminder_start_time),
      minutesOf(row.reminder_end_time),
      interval,
    )

    if (!row.mail_sent_at && row.mail_deadline_date === clock.date) {
      const deadline = minutesOf(row.mail_deadline_time)
      if (reminder && current <= deadline) {
        const message = `Su tırı mail kontrolü: ${base} için ana merkeze ${row.mail_deadline_time}'ye kadar mail atılmalı.${missingText}`
        const notifications = notifyWaterOperations({
          message,
          severity: missing.length ? 'critical' : 'warning',
          module: 'water',
          dedup_key: `water_truck_mail_${row.id}_${clock.date}_${reminder.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({
          truck_id: row.id,
          type: 'mail_due',
          severity: missing.length ? 'critical' : 'warning',
          created: notifications.length > 0,
          message,
        })
      } else if (current > deadline) {
        const overdue = overdueSlot(current, deadline, interval)
        const message = `Su tırı mail süresi geçti: ${base} için ${row.mail_deadline_time} deadline aşıldı, mail atıldı mı kontrol edin.${missingText}`
        const notifications = notifyWaterOperations({
          message,
          severity: 'critical',
          module: 'water',
          dedup_key: `water_truck_deadline_${row.id}_${clock.date}_${overdue.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({
          truck_id: row.id,
          type: 'mail_overdue',
          severity: 'critical',
          created: notifications.length > 0,
          message,
        })
      }
    }

    if (row.arrival_date === clock.date) {
      const start = minutesOf(row.arrival_start_time)
      const end = minutesOf(row.arrival_end_time)
      const inWindow = current >= start && current <= end
      const late = current > end
      if ((inWindow || late) && reminder) {
        const message = inWindow
          ? `Su tırı geliş kontrolü: ${base} bugün ${row.arrival_start_time}-${row.arrival_end_time} aralığında bekleniyor. Tır gelecek mi teyit edin.`
          : `Su tırı gecikme kontrolü: ${base} için geliş aralığı geçti (${row.arrival_end_time}). Geldi mi kontrol edin.`
        const notifications = notifyWaterOperations({
          message,
          severity: late ? 'critical' : 'info',
          module: 'water',
          dedup_key: `water_truck_arrival_${row.id}_${clock.date}_${reminder.key}`,
          link: '/water',
        })
        if (notifications.length) created += 1
        alerts.push({
          truck_id: row.id,
          type: late ? 'arrival_late' : 'arrival_due',
          severity: late ? 'critical' : 'info',
          created: notifications.length > 0,
          message,
        })
      }
    }
  }
  return { checked: rows.length, created, date: clock.date, time: clock.time, alerts }
}

export function waybillPhotosService(filters = {}) {
  const limit = filters.limit ? Math.min(1000, Math.max(1, parseInt(filters.limit, 10) || 200)) : 200
  return q.listWaybillPhotos({ ...filters, limit }).map(row => ({
    ...row,
    qty_human: row.product_id ? humanize(row, row.qty_base) : null,
  }))
}

export function createWaybillPhotoService(data, file, userId) {
  if (!file) throw Object.assign(new Error('İrsaliye fotoğrafı gerekli'), { statusCode: 400 })
  const truckId = data.truck_arrival_id ? parseInt(data.truck_arrival_id, 10) : null
  const movementId = data.movement_id ? parseInt(data.movement_id, 10) : null
  const truck = truckId ? q.getTruckArrival(truckId) : null
  if (truckId && !truck) throw Object.assign(new Error('Tır kaydı bulunamadı'), { statusCode: 400 })
  const movement = movementId ? q.getMovement(movementId) : null
  if (movementId && !movement) {
    throw Object.assign(new Error('İrsaliye hareketi bulunamadı'), { statusCode: 400 })
  }
  if (movement && movement.type !== 'in') {
    throw Object.assign(new Error('Fotoğraf sadece giriş/irsaliye kaydına bağlanabilir'), { statusCode: 400 })
  }
  const moveDate = data.move_date || movement?.move_date || truck?.arrival_date
  if (!isIsoDate(moveDate)) {
    throw Object.assign(new Error('Fotoğraf tarihi YYYY-MM-DD olmalı'), { statusCode: 400 })
  }
  return q.createWaybillPhoto({
    truck_arrival_id: truckId,
    movement_id: movementId,
    waybill_no: clean(data.waybill_no) || movement?.waybill_no || null,
    move_date: moveDate,
    photo_url: `/uploads/${file.filename}`,
    original_name: file.originalname || null,
    mime: file.mimetype || null,
    size: file.size || null,
    note: clean(data.note),
    uploaded_by: userId || null,
  })
}

export function deleteWaybillPhotoService(id) {
  const row = q.deleteWaybillPhoto(id)
  if (!row) throw Object.assign(new Error('Fotoğraf bulunamadı'), { statusCode: 404 })
  return row
}
