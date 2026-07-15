import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import {
  gateEntryFileBase,
  gateEntryRows,
  truckBadgeBySeverity,
  truckCheckSlots,
  truckFilterDefs,
  truckPriorityScore,
} from '../logic/truckOperations.js'
import { invalidateWaterQueries } from '../logic/waterQueryInvalidation.js'
import WaterCollapsiblePanel from './WaterCollapsiblePanel.jsx'
import { nf, todayStr } from '../logic/waterUi.js'

const toastOk = message => useToastStore.getState().addToast(message, 'success')
const toastErr = message => useToastStore.getState().addToast(message, 'error')
const errMsg = (error, fallback) => error?.response?.data?.error || error?.message || fallback
const canvasTextLines = (ctx, value, maxWidth, maxLines = 99) => {
  const output = []
  const paragraphs = String(value ?? '-').split(/\r?\n/)
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      output.push('')
      continue
    }
    let line = ''
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > maxWidth) {
        output.push(line)
        line = word
      } else {
        line = next
      }
    })
    if (line) output.push(line)
  }
  if (output.length <= maxLines) return output
  const trimmed = output.slice(0, maxLines)
  let last = `${trimmed[maxLines - 1]}...`
  while (last.length > 3 && ctx.measureText(last).width > maxWidth) last = `${last.slice(0, -4)}...`
  trimmed[maxLines - 1] = last
  return trimmed
}
const triggerDownload = (url, filename) => {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function TruckArrivalPanel({ from, to, label, focusRequest }) {
  const qc = useQueryClient()
  const isManager = useAuthStore(s => s.user?.role === 'campus_manager')
  const fileRef = useRef(null)
  const panelRef = useRef(null)
  const entryFormRef = useRef(null)
  const [open, setOpen] = useState(true)
  const [truckFilter, setTruckFilter] = useState('action')
  const [selectedTruckId, setSelectedTruckId] = useState(null)
  const [editingTruckId, setEditingTruckId] = useState(null)
  const [gateExporting, setGateExporting] = useState('')
  const [photoForm, setPhotoForm] = useState({ truck_arrival_id: '', waybill_no: '', move_date: todayStr(), note: '' })
  const [form, setForm] = useState({
    arrival_date: todayStr(), arrival_start_time: '08:00', arrival_end_time: '17:00',
    mail_deadline_date: todayStr(), mail_deadline_time: '17:00',
    reminder_start_time: '08:00', reminder_end_time: '17:00', reminder_interval_minutes: 60,
    supplier_name: '', brand_id: '', driver_name: '', driver_tc: '', driver_phone: '',
    plate: '', trailer_plate: '', identity_type: 'tc', visit_company: '',
    host_person_name: '', host_person_phone: '', entry_reason: 'SU AMAÇLI NAKLİYE',
    work_area: '', center_email: '', note: '',
  })

  const { data: trucks = [] } = useQuery({
    queryKey: ['water-truck-arrivals', from, to],
    queryFn: () => api.get('/water/truck-arrivals', { params: { from, to, limit: 300 } }).then(r => r.data),
    refetchInterval: query => (query.state.data || []).some(t => ['pending', 'processing'].includes(t.mail_queue?.status)) ? 2000 : 60000,
  })
  const { data: photos = [] } = useQuery({
    queryKey: ['water-waybill-photos', from, to],
    queryFn: () => api.get('/water/waybill-photos', { params: { from, to, limit: 120 } }).then(r => r.data),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ['water-brands'],
    queryFn: () => api.get('/water/brands').then(r => r.data),
  })

  useEffect(() => {
    if (!focusRequest?.seq) return undefined
    setOpen(true)
    const timer = setTimeout(() => {
      const target = focusRequest.mode === 'new' ? entryFormRef.current : panelRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: focusRequest.mode === 'new' ? 'center' : 'start' })
    }, 0)
    return () => clearTimeout(timer)
  }, [focusRequest])

  const invalidate = () => invalidateWaterQueries(qc, 'trucks')
  const create = useMutation({
    mutationFn: () => {
      const body = { ...form, brand_id: form.brand_id || null }
      return editingTruckId
        ? api.put(`/water/truck-arrivals/${editingTruckId}`, body)
        : api.post('/water/truck-arrivals', body)
    },
    onSuccess: response => {
      const savedId = Number(editingTruckId || response.data?.id)
      invalidate()
      if (savedId) {
        setSelectedTruckId(savedId)
        setTruckFilter('all')
      }
      setForm(f => ({
        ...f,
        driver_name: '', driver_tc: '', driver_phone: '', plate: '', trailer_plate: '',
        host_person_name: '', host_person_phone: '', work_area: '', note: '',
        status: 'planned',
      }))
      toastOk(editingTruckId ? 'Kayıt güncellendi; çıktı paketi kullanıma hazır' : 'Kayıt oluşturuldu; PDF, Excel ve PNG çıktıları hazır')
      setEditingTruckId(null)
      requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    },
    onError: e => toastErr(errMsg(e, 'Tır kaydı oluşturulamadı')),
  })
  const updateTruck = useMutation({
    mutationFn: ({ id, body }) => api.put(`/water/truck-arrivals/${id}`, body),
    onSuccess: () => { invalidate(); toastOk('Tır kaydı güncellendi') },
    onError: e => toastErr(errMsg(e, 'Güncellenemedi')),
  })
  const sendMail = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/send-mail`),
    onSuccess: response => {
      invalidate()
      toastOk(response.data?.alreadyQueued ? 'Mail zaten gönderim kuyruğunda' : 'Mail gönderim kuyruğuna alındı')
    },
    onError: e => toastErr(errMsg(e, 'Mail gönderilemedi')),
  })
  const markMail = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/mark-mail-sent`),
    onSuccess: () => { invalidate(); toastOk('Mail atıldı olarak işaretlendi') },
    onError: e => toastErr(errMsg(e, 'İşaretlenemedi')),
  })
  const markChecked = useMutation({
    mutationFn: id => api.post(`/water/truck-arrivals/${id}/check`),
    onSuccess: () => { invalidate(); toastOk('Kontrol saati işlendi') },
    onError: e => toastErr(errMsg(e, 'Kontrol işlenemedi')),
  })
  const runAlertCheck = useMutation({
    mutationFn: () => api.post('/water/truck-arrivals/check-alerts'),
    onSuccess: r => {
      invalidate()
      const checked = r.data?.checked ?? 0
      const created = r.data?.created ?? r.data?.count ?? 0
      toastOk(`${nf(checked)} tır tarandı, ${nf(created)} uyarı oluşturuldu`)
    },
    onError: e => toastErr(errMsg(e, 'Toplu kontrol çalıştırılamadı')),
  })
  const delTruck = useMutation({
    mutationFn: id => api.delete(`/water/truck-arrivals/${id}`),
    onSuccess: () => { invalidate(); toastOk('Tır kaydı silindi') },
    onError: e => toastErr(errMsg(e, 'Silinemedi')),
  })
  const uploadPhoto = useMutation({
    mutationFn: file => {
      const fd = new FormData()
      fd.append('photo', file)
      if (photoForm.truck_arrival_id) fd.append('truck_arrival_id', photoForm.truck_arrival_id)
      if (photoForm.waybill_no.trim()) fd.append('waybill_no', photoForm.waybill_no.trim())
      fd.append('move_date', photoForm.move_date || todayStr())
      if (photoForm.note.trim()) fd.append('note', photoForm.note.trim())
      return api.post('/water/waybill-photos', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => { invalidate(); setPhotoForm(f => ({ ...f, waybill_no: '', note: '' })); toastOk('İrsaliye fotoğrafı yüklendi') },
    onError: e => toastErr(errMsg(e, 'Fotoğraf yüklenemedi')),
  })
  const delPhoto = useMutation({
    mutationFn: id => api.delete(`/water/waybill-photos/${id}`),
    onSuccess: () => { invalidate(); toastOk('Fotoğraf silindi') },
    onError: e => toastErr(errMsg(e, 'Fotoğraf silinemedi')),
  })

  const truckPayload = (t, patch = {}) => ({
    arrival_date: t.arrival_date, arrival_start_time: t.arrival_start_time, arrival_end_time: t.arrival_end_time,
    mail_deadline_date: t.mail_deadline_date, mail_deadline_time: t.mail_deadline_time,
    reminder_start_time: t.reminder_start_time, reminder_end_time: t.reminder_end_time,
    reminder_interval_minutes: t.reminder_interval_minutes,
    supplier_name: t.supplier_name || '', brand_id: t.brand_id || null,
    driver_name: t.driver_name || '', driver_tc: t.driver_tc || '', driver_phone: t.driver_phone || '',
    plate: t.plate, trailer_plate: t.trailer_plate || '', center_email: t.center_email || '',
    identity_type: t.identity_type || 'tc', visit_company: t.visit_company || '',
    host_person_name: t.host_person_name || '', host_person_phone: t.host_person_phone || '',
    entry_reason: t.entry_reason || 'SU AMAÇLI NAKLİYE', work_area: t.work_area || '',
    note: t.note || '', status: t.status, ...patch,
  })
  const editTruck = (t) => {
    setEditingTruckId(t.id)
    setForm({ ...truckPayload(t), brand_id: t.brand_id ? String(t.brand_id) : '' })
    requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  const cancelTruckEdit = () => {
    setEditingTruckId(null)
    setForm(f => ({
      ...f,
      driver_name: '', driver_tc: '', driver_phone: '', plate: '', trailer_plate: '',
      host_person_name: '', host_person_phone: '', work_area: '', note: '', status: 'planned',
    }))
  }
  const today = todayStr()
  const truckStats = useMemo(() => {
    const active = trucks.filter(t => !['arrived', 'cancelled'].includes(t.status))
    return {
      total: trucks.length,
      active: active.length,
      mail: trucks.filter(t => t.mail_required).length,
      missing: trucks.filter(t => (t.missing_mail_fields || []).length > 0 && t.mail_required).length,
      overdue: trucks.filter(t => t.deadline_passed || t.mail_phase === 'overdue' || t.arrival_phase === 'late').length,
      today: trucks.filter(t => t.arrival_date === today && !['arrived', 'cancelled'].includes(t.status)).length,
      ready: trucks.filter(t => t.mail_required && t.mail_ready).length,
      noPhoto: trucks.filter(t => !t.photo_count && t.status !== 'cancelled').length,
      photos: photos.length,
    }
  }, [trucks, photos.length, today])
  const filteredTrucks = useMemo(() => {
    const isAction = (t) => t.mail_required || t.deadline_passed || t.arrival_phase === 'late' || t.arrival_date === today || (t.missing_mail_fields || []).length || !t.photo_count
    const filters = {
      action: isAction,
      mail: (t) => t.mail_required,
      ready: (t) => t.mail_required && t.mail_ready,
      missing: (t) => (t.missing_mail_fields || []).length > 0,
      photo: (t) => !t.photo_count && t.status !== 'cancelled',
      today: (t) => t.arrival_date === today,
      late: (t) => t.deadline_passed || t.mail_phase === 'overdue' || t.arrival_phase === 'late',
      all: () => true,
    }
    return trucks.filter(filters[truckFilter] || filters.action)
  }, [trucks, truckFilter, today])
  const selectedTruck = filteredTrucks.find(t => t.id === selectedTruckId)
    || trucks.find(t => t.id === selectedTruckId)
    || filteredTrucks[0]
    || trucks[0]
    || null
  const danger = truckStats.overdue > 0 || truckStats.missing > 0
  const actionTruckCount = trucks.filter(t => (
    t.mail_required || t.deadline_passed || t.arrival_phase === 'late' || t.arrival_date === today || (t.missing_mail_fields || []).length || !t.photo_count
  )).length
  const missingFieldSummary = useMemo(() => {
    const map = new Map()
    trucks.forEach(t => {
      ;(t.mail_checklist || []).forEach(item => {
        if (item.ok) return
        const row = map.get(item.key) || { key: item.key, label: item.label, count: 0, plates: [] }
        row.count += 1
        if (row.plates.length < 4) row.plates.push(t.plate)
        map.set(item.key, row)
      })
      ;(t.missing_mail_fields || []).forEach(label => {
        const key = String(label || 'missing')
        if ([...map.values()].some(row => row.plates.includes(t.plate) && row.label === label)) return
        const row = map.get(key) || { key, label, count: 0, plates: [] }
        row.count += 1
        if (row.plates.length < 4) row.plates.push(t.plate)
        map.set(key, row)
      })
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [trucks])
  const checkPlanRows = useMemo(() => (
    [...filteredTrucks]
      .filter(t => !['arrived', 'cancelled'].includes(t.status))
      .sort((a, b) => truckPriorityScore(b, today) - truckPriorityScore(a, today))
      .slice(0, 6)
  ), [filteredTrucks, today])
  const photoBacklogRows = useMemo(() => (
    trucks
      .filter(t => !t.photo_count && t.status !== 'cancelled')
      .sort((a, b) => truckPriorityScore(b, today) - truckPriorityScore(a, today))
      .slice(0, 6)
  ), [trucks, today])

  const copyTruckMail = async (t) => {
    if (!t) return
    const preview = t.mail_preview || { to: t.center_email, subject: t.mail_subject, body: t.mail_body }
    const text = [
      `Alıcı: ${preview.to || '-'}`,
      `Konu: ${preview.subject || '-'}`,
      '',
      preview.body || '',
    ].join('\n')
    try {
      await navigator.clipboard?.writeText(text)
      toastOk('Mail taslağı panoya kopyalandı')
    } catch {
      toastErr('Mail taslağı kopyalanamadı')
    }
  }

  const downloadGateEntryExcel = async (t) => {
    if (!t) return
    setGateExporting('excel')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Şantiye Yatakhane Yönetim Sistemi'
      wb.created = new Date()
      wb.subject = 'Su nakliyesi personel günlük giriş bildirimi'

      const gate = wb.addWorksheet('PERSONEL GÜNLÜK GİRİŞ', {
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
        views: [{ showGridLines: false }],
      })
      gate.mergeCells('A1:K1')
      const title = gate.getCell('A1')
      title.value = 'PERSONEL GÜNLÜK GİRİŞ'
      title.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E75' } }
      title.alignment = { horizontal: 'center', vertical: 'middle' }
      gate.getRow(1).height = 30
      gate.getRow(2).height = 8

      const rows = gateEntryRows(t)
      const headers = rows.map(([header]) => header)
      const values = rows.map(([, value]) => value)
      gate.addRow([])
      gate.addRow(headers)
      gate.addRow(values)
      gate.columns = [17, 23, 16, 16, 28, 22, 19, 13, 14, 20, 22].map(width => ({ width }))
      gate.getRow(3).height = 46
      gate.getRow(4).height = 72
      for (let rowNo = 3; rowNo <= 4; rowNo += 1) {
        gate.getRow(rowNo).eachCell(cell => {
          cell.font = { name: 'Times New Roman', size: rowNo === 3 ? 9 : 11, bold: rowNo === 3 }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF334155' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            bottom: { style: 'thin', color: { argb: 'FF334155' } },
            right: { style: 'thin', color: { argb: 'FF334155' } },
          }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNo === 3 ? 'FFD6EAF0' : 'FFFFFFFF' } }
        })
      }
      gate.autoFilter = 'A3:K4'
      gate.pageSetup.printArea = 'A1:K4'
      gate.headerFooter.oddFooter = '&LŞantiye Su Takibi&C&F&R&P / &N'

      const letter = wb.addWorksheet('RESMİ YAZI', {
        pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
        views: [{ showGridLines: false }],
      })
      letter.columns = [{ width: 4 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }]
      letter.mergeCells('B2:E2')
      letter.getCell('B2').value = 'SU AMAÇLI NAKLİYE PERSONEL GİRİŞ TALEBİ'
      letter.getCell('B2').font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF155E75' } }
      letter.getCell('B2').alignment = { horizontal: 'center' }
      letter.mergeCells('B4:E4')
      letter.getCell('B4').value = `Konu: ${t.mail_preview?.subject || t.mail_subject || '-'}`
      letter.getCell('B4').font = { name: 'Times New Roman', size: 11, bold: true }
      letter.mergeCells('B6:E18')
      letter.getCell('B6').value = t.mail_preview?.body || t.mail_body || ''
      letter.getCell('B6').font = { name: 'Times New Roman', size: 11 }
      letter.getCell('B6').alignment = { vertical: 'top', wrapText: true }
      letter.getCell('B6').border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } }, left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } }, right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      }
      letter.getRow(6).height = 280
      letter.mergeCells('B20:E20')
      letter.getCell('B20').value = `Alıcı: ${t.mail_preview?.to || t.center_email || '-'}`
      letter.getCell('B20').font = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF475569' } }
      letter.pageSetup.printArea = 'B2:E20'

      const buffer = await wb.xlsx.writeBuffer()
      const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.xlsx`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Personel giriş formu ve resmi yazı Excel olarak hazırlandı')
    } catch {
      toastErr('Personel giriş Exceli oluşturulamadı')
    } finally {
      setGateExporting('')
    }
  }

  const downloadGateEntryPdf = async (t) => {
    if (!t) return
    setGateExporting('pdf')
    try {
      const response = await api.get(`/water/truck-arrivals/${t.id}/gate-entry.pdf`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(response.data)
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.pdf`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Kurumsal personel giriş PDF’i hazırlandı')
    } catch (error) {
      toastErr(errMsg(error, 'Personel giriş PDF’i oluşturulamadı'))
    } finally {
      setGateExporting('')
    }
  }

  const downloadGateEntryPng = async (t) => {
    if (!t) return
    setGateExporting('png')
    try {
      const width = 1600
      const height = 1000
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas kullanılamıyor')
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = '#155e75'
      ctx.fillRect(0, 0, width, 104)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 34px Arial, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('PERSONEL GÜNLÜK GİRİŞ', 32, 55)
      ctx.font = '18px Arial, sans-serif'
      ctx.fillStyle = '#cffafe'
      ctx.fillText('Su amaçlı nakliye personel giriş talebi', 32, 84)
      ctx.textAlign = 'right'
      ctx.font = '700 20px Arial, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${t.arrival_date || '-'}  ·  ${t.vehicle_summary || t.plate || '-'}`, width - 32, 62)

      const rows = gateEntryRows(t)
      const columnWidths = [125, 170, 117, 117, 205, 161, 139, 95, 102, 146, 163]
      const tableX = 15
      const headerY = 130
      const headerHeight = 88
      const valueHeight = 142
      let x = tableX
      rows.forEach(([header, value], index) => {
        const cellWidth = columnWidths[index]
        ctx.fillStyle = index % 2 ? '#e0f2fe' : '#ecfeff'
        ctx.fillRect(x, headerY, cellWidth, headerHeight)
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1
        ctx.strokeRect(x, headerY, cellWidth, headerHeight)
        ctx.font = '700 14px Arial, sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.textAlign = 'center'
        const headerLines = canvasTextLines(ctx, header, cellWidth - 12, 4)
        const headerStart = headerY + (headerHeight - headerLines.length * 18) / 2 + 14
        headerLines.forEach((line, lineIndex) => ctx.fillText(line, x + cellWidth / 2, headerStart + lineIndex * 18))

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, headerY + headerHeight, cellWidth, valueHeight)
        ctx.strokeRect(x, headerY + headerHeight, cellWidth, valueHeight)
        ctx.font = '18px Arial, sans-serif'
        ctx.fillStyle = '#111827'
        const valueLines = canvasTextLines(ctx, value, cellWidth - 14, 5)
        const valueStart = headerY + headerHeight + (valueHeight - valueLines.length * 23) / 2 + 17
        valueLines.forEach((line, lineIndex) => ctx.fillText(line, x + cellWidth / 2, valueStart + lineIndex * 23))
        x += cellWidth
      })

      const requestY = 400
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(28, requestY, width - 56, 475)
      ctx.strokeStyle = '#94a3b8'
      ctx.strokeRect(28, requestY, width - 56, 475)
      ctx.fillStyle = '#155e75'
      ctx.fillRect(28, requestY, 11, 475)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 25px Arial, sans-serif'
      ctx.fillText('ANA MERKEZ PERSONEL GİRİŞ TALEBİ', 62, requestY + 48)
      ctx.font = '700 17px Arial, sans-serif'
      ctx.fillStyle = '#334155'
      const subject = `Konu: ${t.mail_preview?.subject || t.mail_subject || '-'}`
      canvasTextLines(ctx, subject, width - 145, 2).forEach((line, index) => ctx.fillText(line, 62, requestY + 85 + index * 23))
      ctx.font = '19px Arial, sans-serif'
      ctx.fillStyle = '#1e293b'
      const body = t.mail_preview?.body || t.mail_body || ''
      canvasTextLines(ctx, body, width - 145, 13).forEach((line, index) => ctx.fillText(line, 62, requestY + 148 + index * 27))

      ctx.fillStyle = '#e0f2fe'
      ctx.fillRect(28, 898, width - 56, 70)
      ctx.fillStyle = '#0e7490'
      ctx.font = '700 17px Arial, sans-serif'
      ctx.fillText(`Alıcı: ${t.mail_preview?.to || t.center_email || '-'}`, 50, 928)
      ctx.font = '15px Arial, sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText(`Kayıt no: ${t.id}  ·  Oluşturulma: ${new Date().toLocaleString('tr-TR')}  ·  Şantiye Su Takibi`, 50, 953)

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG üretilemedi')), 'image/png')
      })
      const blobUrl = URL.createObjectURL(blob)
      triggerDownload(blobUrl, `${gateEntryFileBase(t)}.png`)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      toastOk('Mailde paylaşılabilir yüksek çözünürlüklü PNG hazırlandı')
    } catch {
      toastErr('Personel giriş PNG görseli oluşturulamadı')
    } finally {
      setGateExporting('')
    }
  }

  return (
    <WaterCollapsiblePanel
      ref={panelRef}
      id="water-truck-entry"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title={<>TIR / İRSALİYE TAKİBİ — {label}</>}
      subtitle={`${truckStats.total} tır kaydı · ${truckStats.mail} mail bekliyor · ${truckStats.photos} irsaliye fotoğrafı`}
      beforeToggle={<>
        {truckStats.today > 0 && <span className="badge badge-amber">{truckStats.today} bugün</span>}
        {truckStats.overdue > 0 && <span className="badge badge-red">{truckStats.overdue} kritik</span>}
      </>}
      style={{ marginTop: '16px', borderTop: `3px solid ${danger ? 'var(--red)' : 'var(--teal)'}`, scrollMarginTop: '18px' }}
    >
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '8px' }}>
            {[
              ['Mail bekleyen', truckStats.mail, 'var(--accent)', `${truckStats.ready} hazır`],
              ['Eksik bilgi', truckStats.missing, 'var(--red)', 'mail öncesi tamamla'],
              ['Deadline / gecikme', truckStats.overdue, 'var(--red)', 'hemen kontrol'],
              ['Bugün gelecek', truckStats.today, 'var(--blue)', 'geliş teyidi'],
              ['Fotoğrafsız', truckStats.noPhoto, 'var(--teal)', 'irsaliye arşivi'],
            ].map(([title, value, color, sub]) => (
              <div key={title} style={{ border: `1px solid color-mix(in srgb, ${color} 34%, var(--border))`, borderLeft: `4px solid ${color}`, borderRadius: '8px', background: `color-mix(in srgb, ${color} 7%, var(--surface))`, padding: '9px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0 }}>{title}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', marginTop: '4px' }}>
                  <strong style={{ fontFamily: 'var(--mono)', fontSize: '20px', color }}>{nf(value)}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{sub}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            <section style={{ border: '1px solid color-mix(in srgb, var(--blue) 28%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--blue) 5%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Saatlik kontrol planı</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Geciken, bugüne düşen ve mail bekleyen tırlar önce görünür</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!isManager || runAlertCheck.isPending}
                  title={isManager ? 'Aktif tırları tarar ve uyarı üretir' : 'Sadece müdür çalıştırabilir'}
                  onClick={() => runAlertCheck.mutate()}
                >
                  {runAlertCheck.isPending ? 'Taranıyor...' : 'Toplu kontrol çalıştır'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: '7px' }}>
                {checkPlanRows.map(t => {
                  const slots = truckCheckSlots(t)
                  const urgent = truckPriorityScore(t, today) >= 50
                  return (
                    <div key={t.id} style={{ border: `1px solid ${urgent ? 'color-mix(in srgb, var(--red) 36%, var(--border))' : 'var(--border)'}`, borderRadius: '7px', background: urgent ? 'color-mix(in srgb, var(--red) 5%, var(--surface))' : 'var(--surface)', padding: '7px' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between', alignItems: 'start' }}>
                        <button type="button" onClick={() => setSelectedTruckId(t.id)} style={{ textAlign: 'left', padding: 0, fontFamily: 'var(--mono)', fontWeight: 900, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>{t.plate}</button>
                        <span className={`badge ${urgent ? 'badge-red' : truckBadgeBySeverity(t.mail_severity)}`}>{t.next_check_time || t.mail_phase_label || 'Planlı'}</span>
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '3px' }}>{t.arrival_date} · {t.arrival_window || '-'} · {t.check_plan_label || 'kontrol aralığı yok'}</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {slots.slice(0, 7).map(slot => <span key={slot} className={`badge ${slot === t.next_check_time ? 'badge-blue' : 'badge-gray'}`}>{slot}</span>)}
                        {slots.length > 7 && <span className="badge badge-gray">+{slots.length - 7}</span>}
                      </div>
                    </div>
                  )
                })}
                {checkPlanRows.length === 0 && <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '18px 4px' }}>Kontrol bekleyen aktif tır yok</div>}
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--red) 24%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--red) 4%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Eksik bilgi listesi</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Mail atılmadan önce tamamlanması gereken alanlar</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTruckFilter('missing')}>Filtrele</button>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {missingFieldSummary.slice(0, 6).map(item => (
                  <button key={item.key} type="button" onClick={() => setTruckFilter('missing')} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '7px', padding: '7px', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <strong style={{ fontSize: '11px' }}>{item.label}</strong>
                      <span className="badge badge-red">{nf(item.count)}</span>
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '3px', fontFamily: 'var(--mono)' }}>{item.plates.join(', ')}</div>
                  </button>
                ))}
                {missingFieldSummary.length === 0 && <div style={{ color: 'var(--green)', fontSize: '12px', padding: '18px 4px' }}>Mail bilgileri tamam görünüyor</div>}
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--teal) 28%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 5%, var(--surface))', padding: '10px', minHeight: '172px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <strong style={{ fontSize: '12px' }}>Foto bekleyen irsaliye</strong>
                  <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Gelen fotoğraf bağlanınca arşiv ve tır kaydı birlikte takip edilir</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTruckFilter('photo')}>Fotosuz</button>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {photoBacklogRows.map(t => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: '7px', padding: '7px' }}>
                    <button type="button" onClick={() => setSelectedTruckId(t.id)} style={{ textAlign: 'left', padding: 0, border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                      <strong style={{ fontFamily: 'var(--mono)' }}>{t.plate}</strong>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>{t.arrival_date} · {t.brand_name || t.supplier_name || 'tedarikçi yok'}</div>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPhotoForm(f => ({ ...f, truck_arrival_id: String(t.id), move_date: t.arrival_date })); fileRef.current?.click() }}>Foto</button>
                  </div>
                ))}
                {photoBacklogRows.length === 0 && <div style={{ color: 'var(--green)', fontSize: '12px', padding: '18px 4px' }}>Fotoğraf bekleyen aktif kayıt yok</div>}
              </div>
            </section>
          </div>
          <div ref={entryFormRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '8px', alignItems: 'end', border: `1px solid ${editingTruckId ? 'color-mix(in srgb, var(--amber) 55%, var(--border))' : 'var(--border)'}`, background: 'var(--surface2)', borderRadius: '8px', padding: '10px' }}>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', alignItems: 'center', border: '1px solid color-mix(in srgb, var(--teal) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 6%, var(--surface))', padding: '10px 11px' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '12px' }}>PERSONEL GİRİŞİ VE ÇIKTI MERKEZİ</strong>
                <div style={{ color: 'var(--text2)', fontSize: '10px', marginTop: '3px' }}>
                  <span style={{ fontWeight: 800 }}>1.</span> Bilgileri doldur&nbsp;&nbsp; <span style={{ fontWeight: 800 }}>2.</span> Kaydı oluştur&nbsp;&nbsp; <span style={{ fontWeight: 800 }}>3.</span> Mail eklerini indir
                </div>
                <div style={{ color: selectedTruck ? 'var(--green)' : 'var(--text3)', fontSize: '10px', marginTop: '5px', fontFamily: 'var(--mono)' }}>
                  {selectedTruck ? `Aktif çıktı: ${selectedTruck.arrival_date} · ${selectedTruck.vehicle_summary || selectedTruck.plate}` : 'Henüz kayıt yok. Bilgileri doldurup Tır Kaydı Oluştur düğmesine basın.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryPdf(selectedTruck)}>{gateExporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF Hazırla'}</button>
                <button className="btn btn-ghost btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryExcel(selectedTruck)}>{gateExporting === 'excel' ? 'Hazırlanıyor…' : 'Excel Hazırla'}</button>
                <button className="btn btn-ghost btn-sm" disabled={!selectedTruck || Boolean(gateExporting)} onClick={() => downloadGateEntryPng(selectedTruck)}>{gateExporting === 'png' ? 'Hazırlanıyor…' : 'PNG Hazırla'}</button>
              </div>
            </div>
            {editingTruckId && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '7px', background: 'color-mix(in srgb, var(--amber) 12%, var(--surface))' }}>
                <strong style={{ fontSize: '12px' }}>Kayıt #{editingTruckId} düzenleniyor</strong>
                <button className="btn btn-ghost btn-sm" onClick={cancelTruckEdit}>Düzenlemeyi İptal</button>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '2px' }}>
              <span className="badge badge-blue">1</span>
              <strong style={{ fontSize: '12px' }}>Geliş, mail deadline ve kontrol aralığı</strong>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>17:00 son saat ve seçilen aralıklar uyarılara bağlanır</span>
            </div>
            <label className="form-label">Geliş tarihi<input type="date" className="form-input" value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value, mail_deadline_date: f.mail_deadline_date || e.target.value }))} /></label>
            <label className="form-label">Başlangıç<input type="time" className="form-input" value={form.arrival_start_time} onChange={e => setForm(f => ({ ...f, arrival_start_time: e.target.value }))} /></label>
            <label className="form-label">Bitiş<input type="time" className="form-input" value={form.arrival_end_time} onChange={e => setForm(f => ({ ...f, arrival_end_time: e.target.value }))} /></label>
            <label className="form-label">Mail son tarih<input type="date" className="form-input" value={form.mail_deadline_date} onChange={e => setForm(f => ({ ...f, mail_deadline_date: e.target.value }))} /></label>
            <label className="form-label">Mail son saat<input type="time" className="form-input" value={form.mail_deadline_time} onChange={e => setForm(f => ({ ...f, mail_deadline_time: e.target.value }))} /></label>
            <label className="form-label">Kontrol başla<input type="time" className="form-input" value={form.reminder_start_time} onChange={e => setForm(f => ({ ...f, reminder_start_time: e.target.value }))} /></label>
            <label className="form-label">Kontrol bitiş<input type="time" className="form-input" value={form.reminder_end_time} onChange={e => setForm(f => ({ ...f, reminder_end_time: e.target.value }))} /></label>
            <label className="form-label">Saat aralığı<input type="number" min="15" step="15" className="form-input" value={form.reminder_interval_minutes} onChange={e => setForm(f => ({ ...f, reminder_interval_minutes: e.target.value }))} /></label>
            <label className="form-label">Marka<select className="form-select" value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}><option value="">Seçin</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label className="form-label">Tedarikçi<input className="form-input" value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <span className="badge badge-amber">2</span>
              <strong style={{ fontSize: '12px' }}>Personel giriş / güvenlik bilgileri</strong>
              <span style={{ color: 'var(--text3)', fontSize: '11px' }}>fotoğraftaki günlük giriş formu ve resmi yazı aynı kayıttan hazırlanır</span>
            </div>
            <label className="form-label">Tırcı adı<input className="form-input" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></label>
            <label className="form-label">Kimlik türü<select className="form-select" value={form.identity_type} onChange={e => setForm(f => ({ ...f, identity_type: e.target.value }))}><option value="tc">T.C. Kimlik</option><option value="passport">Pasaport</option></select></label>
            <label className="form-label">TC / Pasaport / Sicil no<input className="form-input" value={form.driver_tc} onChange={e => setForm(f => ({ ...f, driver_tc: e.target.value }))} /></label>
            <label className="form-label">Telefon<input className="form-input" value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))} /></label>
            <label className="form-label">Plaka<input className="form-input" value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} /></label>
            <label className="form-label">Dorse<input className="form-input" value={form.trailer_plate} onChange={e => setForm(f => ({ ...f, trailer_plate: e.target.value.toUpperCase() }))} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Ziyaret edilecek firma<input className="form-input" value={form.visit_company} onChange={e => setForm(f => ({ ...f, visit_company: e.target.value }))} placeholder="AVS Küresel Gıda Tedarik ve Yönetim A.Ş." /></label>
            <label className="form-label">Ziyaret edilecek kişi<input className="form-input" value={form.host_person_name} onChange={e => setForm(f => ({ ...f, host_person_name: e.target.value }))} /></label>
            <label className="form-label">Yetkili telefonu<input className="form-input" value={form.host_person_phone} onChange={e => setForm(f => ({ ...f, host_person_phone: e.target.value }))} /></label>
            <label className="form-label">Saha giriş nedeni<input className="form-input" value={form.entry_reason} onChange={e => setForm(f => ({ ...f, entry_reason: e.target.value }))} /></label>
            <label className="form-label">Çalışma yapacağı bölge<input className="form-input" value={form.work_area} onChange={e => setForm(f => ({ ...f, work_area: e.target.value }))} placeholder="FPU Kamp Alanı" /></label>
            <label className="form-label">Ana merkez mail<input type="email" className="form-input" value={form.center_email} onChange={e => setForm(f => ({ ...f, center_email: e.target.value }))} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Not<input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', paddingTop: '9px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" disabled={!form.arrival_date || !form.plate.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Kaydediliyor…' : editingTruckId ? 'Kaydı Güncelle ve Çıktıları Yenile' : 'Tır Kaydı Oluştur'}</button>
              <span style={{ color: 'var(--text3)', fontSize: '10px' }}>Kayıttan sonra PDF, Excel ve PNG düğmeleri otomatik aktifleşir.</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, .65fr)', gap: '12px', alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {truckFilterDefs.map(f => {
                  const counts = {
                    action: actionTruckCount,
                    mail: truckStats.mail,
                    ready: truckStats.ready,
                    missing: truckStats.missing,
                    photo: truckStats.noPhoto,
                    today: truckStats.today,
                    late: truckStats.overdue,
                    all: truckStats.total,
                  }
                  return (
                    <button key={f.key} className={`btn btn-sm ${truckFilter === f.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTruckFilter(f.key)}>
                      {f.label} <span style={{ fontFamily: 'var(--mono)' }}>{nf(counts[f.key] || 0)}</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '11px', minWidth: '1040px' }}>
                  <thead><tr>{['Geliş', 'Mail', 'Durum', 'Marka/Tedarikçi', 'Tırcı / Sicil', 'Araç', 'İletişim', 'Eksik', 'Foto', 'Kontrol'].map(h => <th key={h} style={{ textAlign: h === 'Kontrol' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredTrucks.map(t => {
                      const missing = t.missing_mail_fields || []
                      const selected = selectedTruck?.id === t.id
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTruckId(t.id)}
                          style={{
                            cursor: 'pointer',
                            background: selected
                              ? 'color-mix(in srgb, var(--blue) 12%, transparent)'
                              : t.deadline_passed || t.arrival_phase === 'late'
                                ? 'color-mix(in srgb, var(--red) 7%, transparent)'
                                : undefined,
                          }}
                        >
                          <td>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{t.arrival_date}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.arrival_window}</div>
                          </td>
                          <td>
                            <span className={`badge ${truckBadgeBySeverity(t.mail_severity)}`}>{t.mail_phase_label || (t.mail_sent_at ? 'Mail atıldı' : 'Bekliyor')}</span>
                            <div style={{ fontFamily: 'var(--mono)', color: t.deadline_passed ? 'var(--red)' : 'var(--text3)', fontSize: '10px', marginTop: '4px' }}>{t.mail_deadline_label}</div>
                          </td>
                          <td>
                            <span className={`badge ${t.status === 'arrived' ? 'badge-green' : t.status === 'cancelled' ? 'badge-gray' : t.mail_sent_at ? 'badge-blue' : 'badge-amber'}`}>{t.status_label}</span>
                            <div style={{ marginTop: '4px' }}><span className={`badge ${truckBadgeBySeverity(t.arrival_severity)}`}>{t.arrival_phase_label || 'Planlı'}</span></div>
                          </td>
                          <td>{t.brand_name || t.supplier_name || '—'}</td>
                          <td>
                            <div>{t.driver_name || '—'}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.driver_tc || 'sicil yok'}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>{t.plate}</div>
                            <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: '10px' }}>{t.trailer_plate || 'dorse yok'}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'var(--mono)' }}>{t.driver_phone || '—'}</div>
                            <div style={{ color: 'var(--text3)', fontSize: '10px' }}>{t.center_email || 'mail yok'}</div>
                          </td>
                          <td style={{ color: missing.length ? 'var(--red)' : 'var(--green)', maxWidth: '210px' }}>{missing.length ? missing.join(', ') : 'Tamam'}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: t.photo_count ? 'var(--green)' : 'var(--accent)' }}>{nf(t.photo_count || 0)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setPhotoForm(f => ({ ...f, truck_arrival_id: String(t.id), move_date: t.arrival_date })); fileRef.current?.click() }}>Foto</button>
                            <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); markChecked.mutate(t.id) }}>Kontrol</button>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredTrucks.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>Bu filtrede tır kaydı yok</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', padding: '12px', minHeight: '280px' }}>
              {selectedTruck ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '17px' }}>{selectedTruck.vehicle_summary || selectedTruck.plate}</div>
                      <div style={{ color: 'var(--text2)', fontSize: '12px' }}>{selectedTruck.brand_name || selectedTruck.supplier_name || 'Tedarikçi yok'} · {selectedTruck.arrival_date} {selectedTruck.arrival_window}</div>
                    </div>
                    <span className={`badge ${truckBadgeBySeverity(selectedTruck.mail_severity)}`}>{selectedTruck.mail_phase_label}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--surface)' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Mail durumu</div>
                      <strong style={{ color: selectedTruck.deadline_passed ? 'var(--red)' : 'var(--text)' }}>{selectedTruck.mail_notice}</strong>
                      {selectedTruck.mail_queue && (
                        <div style={{ color: selectedTruck.mail_queue.failed ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '10px', marginTop: '4px' }}>
                          İş #{selectedTruck.mail_queue.job_id} · {selectedTruck.mail_queue.attempts}/{selectedTruck.mail_queue.max_attempts} deneme
                        </div>
                      )}
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--surface)' }}>
                      <div style={{ color: 'var(--text3)', fontSize: '10px' }}>Geliş durumu</div>
                      <strong>{selectedTruck.arrival_notice}</strong>
                    </div>
                  </div>

                  <div style={{ border: '1px solid color-mix(in srgb, var(--teal) 38%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--teal) 6%, var(--surface))', padding: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '7px' }}>
                      <div>
                        <strong style={{ fontSize: '12px' }}>PERSONEL GİRİŞ KARTI</strong>
                        <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '2px' }}>Mail eki ve ana merkez bildirimi için tek kayıt</div>
                      </div>
                      <span className={`badge ${(selectedTruck.missing_mail_fields || []).length ? 'badge-red' : 'badge-green'}`}>
                        {(selectedTruck.missing_mail_fields || []).length ? `${selectedTruck.missing_mail_fields.length} eksik alan` : 'Çıktıya hazır'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 10px', fontSize: '11px' }}>
                      {[
                        ['Adı soyadı', selectedTruck.gate_entry?.full_name || selectedTruck.driver_name],
                        ['Kimlik / sicil', `${selectedTruck.gate_entry?.identity_label || 'T.C. Kimlik'} · ${selectedTruck.gate_entry?.identity_no || selectedTruck.driver_tc || '—'}`],
                        ['Telefon', selectedTruck.gate_entry?.phone || selectedTruck.driver_phone],
                        ['Araç / dorse', selectedTruck.vehicle_summary],
                        ['Ziyaret firması', selectedTruck.gate_entry?.visit_company || selectedTruck.visit_company],
                        ['Ziyaret kişisi', [selectedTruck.gate_entry?.host_person_name || selectedTruck.host_person_name, selectedTruck.gate_entry?.host_person_phone || selectedTruck.host_person_phone].filter(Boolean).join(' · ')],
                        ['Giriş tarihi / saati', `${selectedTruck.arrival_date} · ${selectedTruck.arrival_window}`],
                        ['Giriş nedeni', selectedTruck.gate_entry?.entry_reason || selectedTruck.entry_reason],
                        ['Çalışma bölgesi', selectedTruck.gate_entry?.work_area || selectedTruck.work_area],
                      ].map(([key, value]) => (
                        <div key={key} style={{ minWidth: 0 }}>
                          <div style={{ color: 'var(--text3)', fontSize: '9px', textTransform: 'uppercase' }}>{key}</div>
                          <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{value || '—'}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid color-mix(in srgb, var(--teal) 24%, var(--border))', display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '11px' }}>PAYLAŞIM ÇIKTILARI</div>
                        <div style={{ color: 'var(--text3)', fontSize: '9px' }}>PDF resmi yazı · Excel düzenlenebilir tablo · PNG hızlı paylaşım</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryPdf(selectedTruck)}>{gateExporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF İndir'}</button>
                        <button className="btn btn-ghost btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryExcel(selectedTruck)}>{gateExporting === 'excel' ? 'Hazırlanıyor…' : 'Excel İndir'}</button>
                        <button className="btn btn-ghost btn-sm" disabled={Boolean(gateExporting)} onClick={() => downloadGateEntryPng(selectedTruck)}>{gateExporting === 'png' ? 'Hazırlanıyor…' : 'PNG Görsel'}</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid color-mix(in srgb, var(--blue) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--blue) 6%, var(--surface))', padding: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '12px' }}>Ana merkez mail taslağı</strong>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyTruckMail(selectedTruck)}>Taslağı Kopyala</button>
                    </div>
                    <div style={{ display: 'grid', gap: '5px', fontSize: '11px' }}>
                      <div><span style={{ color: 'var(--text3)' }}>Alıcı:</span> <span style={{ fontFamily: 'var(--mono)' }}>{selectedTruck.mail_preview?.to || selectedTruck.center_email || '—'}</span></div>
                      <div><span style={{ color: 'var(--text3)' }}>Konu:</span> <span style={{ fontWeight: 700 }}>{selectedTruck.mail_preview?.subject || selectedTruck.mail_subject || '—'}</span></div>
                      <textarea className="form-input" readOnly value={selectedTruck.mail_preview?.body || selectedTruck.mail_body || ''} style={{ minHeight: '150px', fontFamily: 'var(--mono)', fontSize: '11px', resize: 'vertical', whiteSpace: 'pre-wrap' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                    {(selectedTruck.mail_checklist || []).map(item => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px', background: item.ok ? 'color-mix(in srgb, var(--green) 5%, var(--surface))' : 'color-mix(in srgb, var(--red) 5%, var(--surface))' }}>
                        <span className={`badge ${item.ok ? 'badge-green' : 'badge-red'}`}>{item.ok ? 'OK' : 'Eksik'}</span>
                        <span style={{ fontSize: '11px' }}>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {selectedTruck.action_items?.length > 0 && (
                    <div style={{ border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))', borderRadius: '8px', background: 'color-mix(in srgb, var(--accent) 7%, var(--surface))', padding: '8px' }}>
                      <strong style={{ fontSize: '12px' }}>Aksiyon listesi</strong>
                      <ul style={{ margin: '6px 0 0 16px', padding: 0, color: 'var(--text2)', fontSize: '11px' }}>
                        {selectedTruck.action_items.map((a, idx) => <li key={`${a}-${idx}`}>{a}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {isManager && !selectedTruck.mail_sent_at && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!selectedTruck.mail_ready || sendMail.isPending || selectedTruck.mail_queue?.active}
                        onClick={() => sendMail.mutate(selectedTruck.id)}
                      >
                        {sendMail.isPending
                          ? 'Kuyruğa alınıyor…'
                          : selectedTruck.mail_queue?.active
                            ? selectedTruck.mail_queue.status === 'processing' ? 'Gönderiliyor…' : 'Mail kuyrukta'
                            : selectedTruck.mail_queue?.failed ? 'Tekrar Kuyruğa Al' : 'Maili Kuyruğa Al'}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => editTruck(selectedTruck)}>Düzenle</button>
                    {!selectedTruck.mail_sent_at && <button className="btn btn-ghost btn-sm" onClick={() => markMail.mutate(selectedTruck.id)}>Mail atıldı</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => markChecked.mutate(selectedTruck.id)}>Kontrol edildi</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPhotoForm(f => ({ ...f, truck_arrival_id: String(selectedTruck.id), move_date: selectedTruck.arrival_date })); fileRef.current?.click() }}>Foto bağla</button>
                    {selectedTruck.status !== 'arrived' && <button className="btn btn-ghost btn-sm" onClick={() => updateTruck.mutate({ id: selectedTruck.id, body: truckPayload(selectedTruck, { status: 'arrived' }) })}>Geldi</button>}
                    {selectedTruck.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => updateTruck.mutate({ id: selectedTruck.id, body: truckPayload(selectedTruck, { status: 'cancelled' }) })}>İptal</button>}
                    {isManager && <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Tır Kaydı Sil', body: `${selectedTruck.plate} kaydı silinsin mi?`, danger: true })) delTruck.mutate(selectedTruck.id) }}>Sil</button>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--text3)', fontSize: '11px' }}>
                    <div>Kontrol planı: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.check_plan_label}</strong></div>
                    <div>Son kontrol: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.last_checked_at || '—'}</strong></div>
                    <div>Sonraki kontrol: <strong style={{ color: 'var(--text2)' }}>{selectedTruck.next_check_time || '—'}</strong></div>
                    <div>Fotoğraf: <strong style={{ color: 'var(--text2)' }}>{nf(selectedTruck.photo_count || 0)}</strong></div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px 10px' }}>Tır seçilmedi</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .8fr)', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '8px' }}>
                <label className="form-label" style={{ minWidth: '180px' }}>Tır bağlantısı<select className="form-select" value={photoForm.truck_arrival_id} onChange={e => { const t = trucks.find(x => String(x.id) === e.target.value); setPhotoForm(f => ({ ...f, truck_arrival_id: e.target.value, move_date: t?.arrival_date || f.move_date })) }}><option value="">Serbest</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.arrival_date} · {t.plate}</option>)}</select></label>
                <label className="form-label" style={{ width: '130px' }}>Tarih<input type="date" className="form-input" value={photoForm.move_date} onChange={e => setPhotoForm(f => ({ ...f, move_date: e.target.value }))} /></label>
                <label className="form-label" style={{ width: '140px' }}>İrsaliye no<input className="form-input" value={photoForm.waybill_no} onChange={e => setPhotoForm(f => ({ ...f, waybill_no: e.target.value }))} /></label>
                <label className="form-label" style={{ flex: 1, minWidth: '160px' }}>Not<input className="form-input" value={photoForm.note} onChange={e => setPhotoForm(f => ({ ...f, note: e.target.value }))} /></label>
                <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploadPhoto.isPending}>{uploadPhoto.isPending ? 'Yükleniyor…' : 'Foto Yükle'}</button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: 'none' }} onChange={e => { const file = e.target.files?.[0]; if (file) uploadPhoto.mutate(file); e.target.value = '' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: '8px' }}>
                {photos.slice(0, 12).map(p => (
                  <button key={p.id} type="button" onClick={() => window.open(p.photo_url, '_blank')} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '8px', padding: '5px', cursor: 'pointer', textAlign: 'left' }}>
                    <img src={p.photo_url} alt="irsaliye" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                    <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '4px', fontFamily: 'var(--mono)' }}>{p.move_date}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.waybill_no || p.plate || 'irsaliye'}</div>
                  </button>
                ))}
                {photos.length === 0 && <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px' }}>Fotoğraf yok</div>}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '11px', minWidth: '430px' }}>
                <thead><tr><th>Tarih</th><th>İrsaliye</th><th>Plaka</th><th>Yükleyen</th><th></th></tr></thead>
                <tbody>
                  {photos.slice(0, 10).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--mono)' }}>{p.move_date}</td>
                      <td>{p.waybill_no || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{p.plate || '—'}</td>
                      <td>{p.uploaded_by_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'İrsaliye Fotoğrafı Sil', body: 'Fotoğraf silinsin mi?', danger: true })) delPhoto.mutate(p.id) }}>Sil</button></td>
                    </tr>
                  ))}
                  {photos.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: '10px' }}>Kayıt yok</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </WaterCollapsiblePanel>
  )
}

export default memo(TruckArrivalPanel)
