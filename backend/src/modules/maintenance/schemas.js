import { z } from 'zod'

// Cross-cutting Zod sweep — maintenance yazma uçları.
const PRIORITIES = ['high', 'medium', 'low']
const STATUSES = ['open', 'in_progress', 'done']
const CATEGORIES = ['elektrik', 'tesisat', 'klima', 'boya', 'genel']

const priorityEnum = z.enum(PRIORITIES, { errorMap: () => ({ message: 'Geçersiz öncelik' }) })
const categoryEnum = z.enum(CATEGORIES, { errorMap: () => ({ message: 'Geçersiz arıza kategorisi' }) })

export const createRequestSchema = z.object({
  location: z.string().trim().min(2, 'Konum gerekli').max(200, 'Konum çok uzun'),
  block: z.string().trim().min(1, 'Blok boş olamaz').max(8, 'Blok çok uzun').optional(),
  room_id: z.coerce.number().int().positive('Geçersiz oda').optional(),
  description: z.string().trim().min(5, 'Açıklama en az 5 karakter olmalı').max(2000, 'Açıklama çok uzun'),
  priority: priorityEnum.optional().default('medium'),
  category: categoryEnum.optional().default('genel'),
  cleaning_task_id: z.coerce.number().int().positive('Geçersiz temizlik görevi').nullish(),
  wait_reason: z.string().trim().max(500, 'Bekleme nedeni çok uzun').nullish(),
})

export const updatePrioritySchema = z.object({ priority: priorityEnum })

export const waitReasonSchema = z.object({
  wait_reason: z.string().trim().max(500, 'Bekleme nedeni çok uzun').nullish(),
})

export const assignSchema = z.object({
  technician_id: z.coerce.number({ invalid_type_error: 'Teknisyen ID gerekli' }).int().positive('Teknisyen ID gerekli'),
})

export const updateStatusSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'Geçersiz durum' }) }),
})

export const createTechnicianSchema = z.object({
  full_name: z.string().trim().min(2, 'Ad gerekli').max(200, 'Ad çok uzun'),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  specialty: z.string().trim().max(100, 'Uzmanlık çok uzun').nullish(),
  shift: z.string().trim().max(20, 'Vardiya çok uzun').nullish(),
})

export const updateTechnicianSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz').max(200, 'Ad çok uzun').optional(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  specialty: z.string().trim().max(100, 'Uzmanlık çok uzun').nullish(),
  shift: z.string().trim().max(20, 'Vardiya çok uzun').nullish(),
  // null ile bağlantı kaldırılabilir; .nullable() null'ı coerce'ten önce geçirir.
  user_id: z.coerce.number().int().positive().nullable().optional(),
})

export const addCommentSchema = z.object({
  comment: z.string().trim().min(1, 'Yorum boş olamaz').max(2000, 'Yorum çok uzun'),
})
