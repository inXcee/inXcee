import { z } from 'zod'

// Cross-cutting Zod sweep — laundry'nin ham req.body → SQL uçları.
// (Item/machine/supply uçları service katmanında doğrulanıyor; onlara dokunulmadı.)

export const createGarmentTypeSchema = z.object({
  name: z.string().trim().min(1, 'İsim zorunlu').max(100, 'İsim çok uzun'),
  emoji: z.string().trim().max(16, 'Emoji çok uzun').nullish(),
  image_url: z.string().trim().max(500, 'URL çok uzun').nullish(),
  sort_order: z.coerce.number().int().min(0).nullish(),
})

export const updateGarmentTypeSchema = z.object({
  name: z.string().trim().min(1, 'İsim boş olamaz').max(100, 'İsim çok uzun').optional(),
  emoji: z.string().trim().max(16, 'Emoji çok uzun').nullish(),
  image_url: z.string().trim().max(500, 'URL çok uzun').nullish(),
  sort_order: z.coerce.number().int().min(0).nullish(),
  is_active: z.coerce.number().int().min(0).max(1).nullish(),
})

export const createBagSchema = z.object({
  qr_code: z.string().trim().min(3, 'qr_code zorunlu (>=3 char)').max(100, 'qr_code çok uzun'),
  room_id: z.coerce.number().int().positive().nullish(),
})
