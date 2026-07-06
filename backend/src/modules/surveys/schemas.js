import { z } from 'zod'

// Cross-cutting Zod sweep — surveys (kiosk/anonim gönderim).
const score = z.coerce.number().int().min(1, 'Puan 1-5 arası olmalı').max(5, 'Puan 1-5 arası olmalı').nullish()

export const submitSurveySchema = z.object({
  personnel_id: z.coerce.number().int().positive().nullish(),
  room_score: score,
  cleaning_score: score,
  food_score: score,
  laundry_score: score,
  overall_score: score,
  comment: z.string().trim().max(2000, 'Yorum çok uzun').nullish(),
}).refine(
  d => d.comment || [d.room_score, d.cleaning_score, d.food_score, d.laundry_score, d.overall_score].some(s => s != null),
  { message: 'En az bir puan veya yorum gerekli' },
)
