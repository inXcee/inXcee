import { z } from 'zod'

// Cross-cutting Zod sweep — cards yazma uçları.
const cardTypeEnum = z.enum(['access', 'meal'], { errorMap: () => ({ message: 'Geçersiz card_type' }) })

export const bulkIssueSchema = z.object({
  card_type: cardTypeEnum,
})

export const issueSchema = z.object({
  card_type: cardTypeEnum,
  nfc_uid: z.string().trim().max(100, 'NFC UID çok uzun').nullish(),
  valid_until: z.string().trim().max(40, 'Tarih çok uzun').nullish(),
  regenerate: z.coerce.boolean().optional(),
})

export const bindNfcSchema = z.object({
  nfc_uid: z.string().trim().min(1, 'nfc_uid gerekli').max(100, 'NFC UID çok uzun'),
})

// Hızlı seri kayıt: kişinin o tipte aktif kartını bul/üret + NFC bağla (atomik).
export const enrollNfcSchema = z.object({
  holder_type: z.enum(['staff', 'personnel', 'visitor']).default('staff'),
  holder_id: z.coerce.number().int().positive('holder_id gerekli'),
  card_type: cardTypeEnum,
  nfc_uid: z.string().trim().min(1, 'nfc_uid gerekli').max(100, 'NFC UID çok uzun'),
})
