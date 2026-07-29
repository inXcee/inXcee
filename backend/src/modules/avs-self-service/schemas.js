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
