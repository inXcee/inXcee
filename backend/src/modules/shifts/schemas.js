import { z } from 'zod'
import { isIsoDate } from '../../shared/validation/date.js'

const isoDate = z.string().refine(isIsoDate, 'Tarih geçerli bir YYYY-MM-DD tarihi olmalı')

// Excel içe aktarımı — frontend'in ürettiği kanonik çizelge payload'ı.
const importCell = z.object({
  date: isoDate,
  startHour: z.number().int().min(0).max(24).nullable(),
  endHour: z.number().int().min(0).max(24).nullable(),
  status: z.enum(['scheduled', 'worked', 'absent', 'on_leave', 'overtime', 'off']),
  leaveType: z.enum(['weekly_off', 'sick', 'annual', 'unpaid']).optional(),
  raw: z.string().optional(),
  locationName: z.string().trim().max(160).nullable().optional(),
})

const importRow = z.object({
  name: z.string().trim().min(1, 'Personel adı boş olamaz'),
  deptName: z.string().trim().nullable().optional(),
  locationName: z.string().trim().max(160).nullable().optional(),
  cells: z.array(importCell).default([]),
})

export const importScheduleSchema = z.object({
  weekDates: z.array(isoDate).max(31).default([]),
  rows: z.array(importRow).min(1, 'İçe aktarılacak satır bulunamadı').max(2000),
  unrecognized: z.array(z.object({
    name: z.string().optional(),
    date: z.string().optional(),
    raw: z.string().optional(),
  })).default([]),
  // Seçim/eşleştirme kontrolü (opsiyonel)
  excludeDepts: z.array(z.string()).optional(),          // içe aktarılmayacak departman adları
  mappings: z.record(z.string(), z.coerce.number()).optional(), // excelAdı → mevcut staffId
})
