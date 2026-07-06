import { z } from 'zod'

// Cross-cutting Zod sweep — discipline yazma uçları.
export const addRecordSchema = z.object({
  personnel_id: z.coerce.number({ invalid_type_error: 'Personel ID gerekli' }).int().positive('Personel ID gerekli'),
  card_type: z.enum(['yellow', 'red'], { errorMap: () => ({ message: 'Geçersiz kart tipi' }) }),
  reason: z.string().trim().min(3, 'Sebep en az 3 karakter olmalı').max(1000, 'Sebep çok uzun'),
})

export const blacklistAddSchema = z.object({
  personnel_id: z.coerce.number({ invalid_type_error: 'Personel ID gerekli' }).int().positive('Personel ID gerekli'),
  reason: z.string().trim().min(3, 'Sebep gerekli').max(1000, 'Sebep çok uzun'),
})

export const blacklistRemoveSchema = z.object({
  personnel_id: z.coerce.number({ invalid_type_error: 'Personel ID gerekli' }).int().positive('Personel ID gerekli'),
})
