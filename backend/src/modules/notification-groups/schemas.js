import { z } from 'zod'

// Cross-cutting Zod sweep — notification-groups (channels route'ta normalize edilir).
export const groupSchema = z.object({
  name: z.string().trim().min(2, 'Grup adı gerekli').max(120, 'Ad çok uzun'),
  description: z.string().trim().max(1000, 'Açıklama çok uzun').nullish(),
}).passthrough()

export const memberSchema = z.object({
  user_id: z.coerce.number({ invalid_type_error: 'user_id gerekli' }).int().positive('user_id gerekli'),
})
