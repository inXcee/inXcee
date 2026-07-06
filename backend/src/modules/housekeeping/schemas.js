import { z } from 'zod'

// Cross-cutting Zod sweep — housekeeping yazma uçları.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')

export const completeFloorSchema = z.object({
  block: z.string().trim().min(1, 'Blok gerekli').max(10, 'Blok geçersiz'),
  floor: z.coerce.number({ invalid_type_error: 'Kat gerekli' }).int(),
  date: dateStr,
})

export const skipTaskSchema = z.object({
  reason: z.string().trim().max(500, 'Sebep çok uzun').nullish(),
})

export const roomNotesSchema = z.object({
  notes: z.string().trim().max(2000, 'Not çok uzun').nullish(),
})

export const noCleanSchema = z.object({
  no_clean: z.coerce.boolean().optional().default(false),
})

export const faultReportSchema = z.object({
  location: z.string().trim().min(2, 'Konum gerekli').max(200, 'Konum çok uzun'),
  description: z.string().trim().min(5, 'Açıklama en az 5 karakter olmalı').max(2000, 'Açıklama çok uzun'),
  priority: z.enum(['high', 'medium', 'low'], { errorMap: () => ({ message: 'Geçersiz öncelik' }) }).optional().default('medium'),
})

export const createStaffSchema = z.object({
  full_name: z.string().trim().min(2, 'Ad gerekli').max(200, 'Ad çok uzun'),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
})

export const updateStaffSchema = z.object({
  full_name: z.string().trim().min(1, 'Ad boş olamaz').max(200, 'Ad çok uzun').optional(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  assigned_block: z.string().trim().max(10, 'Blok geçersiz').nullish(),
  assigned_floor: z.coerce.number().int().nullable().optional(),
})

export const completeTaskSchema = z.object({
  checklist: z.any().optional(),
  via_qr: z.coerce.boolean().optional().default(false),
})
