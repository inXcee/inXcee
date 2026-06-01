import { z } from 'zod'

// Cross-cutting Zod sweep — announcements.
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'Başlık gerekli').max(200, 'Başlık çok uzun'),
  body: z.string().trim().min(5, 'İçerik gerekli').max(5000, 'İçerik çok uzun'),
  expires_at: z.string().trim().max(40, 'Tarih çok uzun').nullish(),
})
