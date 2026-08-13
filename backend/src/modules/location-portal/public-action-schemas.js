import { z } from 'zod'

const clientRequestId = z.string().trim().min(8, 'İşlem kimliği eksik').max(100, 'İşlem kimliği çok uzun')
  .regex(/^[A-Za-z0-9._:-]+$/, 'Geçersiz işlem kimliği')
const score = z.coerce.number().int().min(1, 'Puan 1-5 arasında olmalı').max(5, 'Puan 1-5 arasında olmalı').nullish()

export const portalFaultSchema = z.object({
  client_request_id: clientRequestId,
  category: z.enum(['elektrik', 'tesisat', 'klima', 'boya', 'genel'], {
    errorMap: () => ({ message: 'Geçersiz arıza kategorisi' }),
  }),
  description: z.string().trim().min(5, 'Açıklama en az 5 karakter olmalı').max(2000, 'Açıklama çok uzun'),
})

export const portalSurveySchema = z.object({
  client_request_id: clientRequestId,
  room_score: score,
  cleaning_score: score,
  food_score: score,
  laundry_score: score,
  overall_score: score,
  comment: z.string().trim().max(2000, 'Yorum çok uzun').nullish(),
}).refine(
  data => data.comment || [
    data.room_score,
    data.cleaning_score,
    data.food_score,
    data.laundry_score,
    data.overall_score,
  ].some(value => value != null),
  { message: 'En az bir puan veya yorum gerekli' },
)

export const portalCleaningCompleteSchema = z.object({
  client_request_id: clientRequestId,
  checklist: z.record(z.string(), z.boolean()),
  note: z.string().trim().max(500, 'Not çok uzun').nullish(),
})

export const portalCleaningReviewSchema = z.object({
  client_request_id: clientRequestId,
  outcome: z.enum(['approved', 'issue'], {
    errorMap: () => ({ message: 'Geçersiz değerlendirme sonucu' }),
  }),
  rating: z.coerce.number().int().min(1, 'Puan 1-5 arasında olmalı').max(5, 'Puan 1-5 arasında olmalı').nullish(),
  comment: z.string().trim().max(1000, 'Açıklama çok uzun').nullish(),
}).superRefine((data, context) => {
  if (data.outcome === 'issue' && (!data.comment || data.comment.length < 3)) {
    context.addIssue({ code: 'custom', path: ['comment'], message: 'Eksik bildiriminde en az 3 karakter açıklama gerekli' })
  }
})
