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

const PHOTO_CATEGORY_VALUES = ['genel', 'oncesi', 'sonrasi', 'detay', 'hasar']
const photoCategoryEnum = z.enum(PHOTO_CATEGORY_VALUES, {
  errorMap: () => ({ message: 'Geçersiz kategori' }),
}).optional()
// Foto başına kategori: yüklenen dosyalarla aynı sırada tekrarlanan alan.
// Tek dosyada string, çoklu dosyada dizi olarak gelir.
const photoCategoryList = z.union([
  z.enum(PHOTO_CATEGORY_VALUES, { errorMap: () => ({ message: 'Geçersiz kategori' }) }),
  z.array(z.enum(PHOTO_CATEGORY_VALUES, { errorMap: () => ({ message: 'Geçersiz kategori' }) })),
]).optional()
const photoCaption = z.string().trim().max(300, 'Açıklama çok uzun').nullish()

export const completeTaskSchema = z.object({
  checklist: z.any().optional(),
  via_qr: z.coerce.boolean().optional().default(false),
  category: photoCategoryEnum,
  categories: photoCategoryList,
  caption: photoCaption,
})

export const addTaskPhotoSchema = z.object({
  category: photoCategoryEnum,
  categories: photoCategoryList,
  caption: photoCaption,
})

export const updateTaskPhotoSchema = z.object({
  category: photoCategoryEnum,
  caption: photoCaption,
}).refine(v => v.category !== undefined || v.caption !== undefined, {
  message: 'Güncellenecek alan yok (category veya caption)',
})

export const photoRetentionSchema = z.object({
  retention_days: z.coerce.number().int().refine(value => value === 3 || value === 7, {
    message: 'Fotoğraf saklama süresi 3 veya 7 gün olmalı',
  }),
})
