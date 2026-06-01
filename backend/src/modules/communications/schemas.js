import { z } from 'zod'

// Cross-cutting Zod sweep — communications.
export const smsSendSchema = z.object({
  staff_id: z.coerce.number().int().positive().nullish(),
  phone: z.string().trim().max(40, 'Telefon çok uzun').nullish(),
  body: z.string().trim().min(1, 'body gerekli').max(1000, 'Mesaj çok uzun'),
}).refine(d => d.staff_id != null || d.phone, { message: 'staff_id veya phone gerekli' })

export const broadcastSchema = z.object({
  channel: z.enum(['sms', 'push', 'toast'], { errorMap: () => ({ message: 'channel: sms|push|toast' }) }),
  target_type: z.enum(['group', 'role', 'dept', 'all'], { errorMap: () => ({ message: 'target_type: group|role|dept|all' }) }),
  target_id: z.union([z.coerce.number().int(), z.string().trim().max(60)]).nullish(),
  body: z.string().trim().min(1, 'body gerekli').max(1000, 'Mesaj çok uzun'),
  subject: z.string().trim().max(200, 'Konu çok uzun').nullish(),
})
