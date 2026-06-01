import { z } from 'zod'

// Cross-cutting Zod sweep — meals yazma uçları.
const VALID_MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const mealEnum = z.enum(VALID_MEALS, { errorMap: () => ({ message: 'Geçersiz meal_type' }) })
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı')

export const logMealSchema = z.object({
  staff_id: z.coerce.number().int().positive().nullish(),
  meal_type: mealEnum,
  meal_date: dateStr.optional(),
  qr_token: z.string().trim().max(200, 'QR çok uzun').nullish(),
  cost: z.coerce.number().nonnegative().max(100000).nullish(),
  method: z.string().trim().max(20, 'Yöntem çok uzun').optional().default('manual'),
})

export const selectionSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  meal_date: dateStr,
  meal_type: mealEnum,
  attending: z.coerce.boolean().optional().default(true),
})

export const dietSchema = z.object({
  diet_flags: z.string().trim().max(200, 'Diyet bilgisi çok uzun').nullish(),
})

export const menuSchema = z.object({
  meal_date: dateStr,
  meal_type: mealEnum,
  items: z.string().trim().max(2000, 'Menü çok uzun').nullish(),
})
