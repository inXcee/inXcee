import { z } from 'zod'

// Cross-cutting Zod sweep — avs-self-service (worker kiosk). Gate olarak eklenir.
export const mealSelectionSchema = z.object({
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'meal_date YYYY-AA-GG olmalı'),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack'], { errorMap: () => ({ message: 'geçerli meal_type gerekli' }) }),
  attending: z.coerce.boolean().optional(),
}).passthrough()

export const maintenanceSchema = z.object({
  location: z.string().trim().min(3, 'location en az 3 karakter olmalıdır').max(200, 'Konum çok uzun'),
  description: z.string().trim().min(10, 'description en az 10 karakter olmalıdır').max(2000, 'Açıklama çok uzun'),
  priority: z.enum(['high', 'medium', 'low'], { errorMap: () => ({ message: 'Geçersiz öncelik' }) }).optional().default('medium'),
  category: z.enum(['elektrik', 'tesisat', 'klima', 'boya', 'genel'], { errorMap: () => ({ message: 'Geçersiz arıza kategorisi' }) }).optional().default('genel'),
  block: z.string().trim().min(1).max(8).nullish(),
  room_id: z.coerce.number().int().positive().nullish(),
  cleaning_task_id: z.coerce.number().int().positive().nullish(),
}).passthrough()

export const skipCleaningTaskSchema = z.object({
  reason: z.enum(['occupied', 'dnd', 'locked', 'fault', 'other'], {
    errorMap: () => ({ message: 'Geçersiz temizlenememe nedeni' }),
  }),
  note: z.string().trim().max(300, 'Not çok uzun').nullish(),
})

export const feedbackSchema = z.object({
  type: z.enum(['complaint', 'suggestion', 'other'], { errorMap: () => ({ message: 'Geçersiz tip' }) }),
  message: z.string().trim().min(20, 'Mesaj en az 20 karakter olmalıdır').max(4000, 'Mesaj çok uzun'),
}).passthrough()

// Saha ekranı oda panosu (board.js). Yer anahtarı: oda `BLOK-ODANO`, M ortak alanı `BLOK-KAT-kod`.
const fieldLocation = z.string({ required_error: 'Yer gerekli' }).trim().min(1, 'Yer gerekli').max(40, 'Geçersiz yer')

export const fieldMarkSchema = z.object({
  location: fieldLocation,
  action: z.enum(['clean', 'skip'], { errorMap: () => ({ message: 'Geçersiz işlem' }) }),
  reason: z.enum(['occupied', 'dnd', 'locked', 'fault', 'other'], {
    errorMap: () => ({ message: 'Geçersiz temizlenememe nedeni' }),
  }).optional(),
  note: z.string().trim().max(300, 'Not çok uzun').nullish(),
})

export const fieldLocationSchema = z.object({ location: fieldLocation })

export const fieldOccupancySchema = z.object({
  occupancy: z.enum(['occupied', 'empty'], { errorMap: () => ({ message: 'Geçersiz doluluk' }) }).nullable(),
})

// dry_run zorunlu: istemci önce kuru denemeyle sayıyı gösterir, onayda açıkça false gönderir
export const fieldFloorSchema = z.object({
  block: z.string().trim().min(1, 'Blok gerekli').max(10, 'Geçersiz blok'),
  floor: z.coerce.number().int().min(0).max(20),
  dry_run: z.boolean({ required_error: 'dry_run gerekli', invalid_type_error: 'dry_run true/false olmalı' }),
})

export const fieldFloorUndoSchema = z.object({
  locations: z.array(fieldLocation).min(1, 'Yer listesi boş').max(200, 'Yer listesi çok uzun'),
})
