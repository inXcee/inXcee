import { z } from 'zod'

// Cross-cutting Zod sweep — safety yazma uçları.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')
const categoryEnum = z.enum(['safety', 'fire', 'first_aid', 'environment', 'quality', 'other'], {
  errorMap: () => ({ message: 'Geçersiz kategori' }),
})

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'title gerekli').max(200, 'Başlık çok uzun'),
  category: categoryEnum,
  session_date: dateStr,
  duration_min: z.coerce.number().int().positive().max(10000).nullish(),
  location: z.string().trim().max(200).nullish(),
  instructor: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

export const updateSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: categoryEnum.optional(),
  session_date: dateStr.optional(),
  duration_min: z.coerce.number().int().positive().max(10000).nullish(),
  location: z.string().trim().max(200).nullish(),
  instructor: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  status: z.string().trim().max(40).nullish(),
})

export const createKkdSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  item_type: z.string().trim().min(1, 'item_type gerekli').max(100, 'Tür çok uzun'),
  size: z.string().trim().max(40).nullish(),
  serial_no: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(1000).nullish(),
})

export const kkdReturnSchema = z.object({
  condition: z.string().trim().max(500, 'Durum notu çok uzun').nullish(),
})

// İSG olay/kaza kaydı
export const createIncidentSchema = z.object({
  occurred_at: z.string().trim().min(1, 'Olay zamanı gerekli').max(30),
  location: z.string().trim().max(200, 'Konum çok uzun').nullish(),
  incident_type: z.enum(['injury', 'near_miss', 'property_damage', 'environmental', 'other'],
    { errorMap: () => ({ message: 'Geçersiz olay tipi' }) }),
  severity: z.enum(['minor', 'moderate', 'major', 'critical'],
    { errorMap: () => ({ message: 'Geçersiz şiddet' }) }).default('minor'),
  description: z.string().trim().min(1, 'Açıklama gerekli').max(4000, 'Açıklama çok uzun'),
  staff_id: z.coerce.number().int().positive().nullish(),
  actions_taken: z.string().trim().max(4000).nullish(),
})

export const updateIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'closed']).optional(),
  actions_taken: z.string().trim().max(4000).nullish(),
  severity: z.enum(['minor', 'moderate', 'major', 'critical']).optional(),
  location: z.string().trim().max(200).nullish(),
  description: z.string().trim().min(1).max(4000).optional(),
}).refine(o => Object.keys(o).some(k => o[k] !== undefined), { message: 'Güncellenecek alan yok' })
