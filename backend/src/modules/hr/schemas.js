import { z } from 'zod'

// Cross-cutting Zod sweep — hr yazma uçları.
export const startChecklistSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  kind: z.enum(['onboarding', 'offboarding'], {
    errorMap: () => ({ message: 'kind (onboarding/offboarding) gerekli' }),
  }),
})

export const toggleItemSchema = z.object({
  done: z.coerce.boolean().optional().default(false),
  note: z.string().trim().max(500, 'Not çok uzun').nullish(),
})

export const addItemSchema = z.object({
  label: z.string().trim().min(1, 'Adım metni gerekli').max(200, 'Adım metni çok uzun'),
})
